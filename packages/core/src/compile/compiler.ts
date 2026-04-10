import { join } from "node:path";
import { createBackup } from "../backup.js";
import { DEFAULTS, GRAPH_FILE, INDEX_FILE } from "../constants.js";
import { hash } from "../hash.js";
import { countWords } from "../ingest/normalize.js";
import { withLock } from "../lockfile.js";
import type {
	CompileResult,
	FileOperation,
	LLMProvider,
	Manifest,
	SourceTokenUsage,
	VaultConfig,
} from "../types.js";
import {
	appendLog,
	deleteFile,
	listImageAssets,
	loadManifest,
	readIndex,
	readRaw,
	readWiki,
	saveManifest,
	writeWiki,
} from "../vault.js";
import { buildLinkGraph, generateGraphMd } from "./backlinks.js";
import { CompileCache } from "./cache.js";
import { extractWikilinks, parseCompileOutput, parseFrontmatter } from "./diff.js";
import { enrichCrossReferences } from "./enrichment.js";
import { computeStats, generateIndexMd } from "./index-manager.js";
import { compileSystemPrompt, compileUserPrompt } from "./prompts.js";

/** Emitted for each article as it is created, updated, or deleted. */
export interface ArticleEvent {
	op: "create" | "update" | "delete";
	title: string;
	path: string;
	source: string;
}

export interface CompileOptions {
	/** Recompile all sources regardless of state */
	force?: boolean;
	/** Only compile this specific source path */
	sourceFilter?: string;
	/** Max sources to compile in this pass */
	maxSources?: number;
	/** Don't actually write files, just return what would happen */
	dryRun?: boolean;
	/** Callback for progress updates */
	onProgress?: (msg: string) => void;
	/** Callback fired for each article as it is processed */
	onArticle?: (event: ArticleEvent) => void;
}

// ─── Token estimation ──────────────────────────────────────────

/** Rough token count estimate from character length */
function estimateTokens(text: string): number {
	return Math.ceil(text.length * DEFAULTS.tokensPerChar);
}

// ─── Source summarization ──────────────────────────────────────

/**
 * Summarize a large source by chunking and keeping key sections.
 * Preserves title/headings and truncates body with a note.
 */
function truncateSource(content: string, maxTokens: number): { text: string; truncated: boolean } {
	const estimated = estimateTokens(content);
	if (estimated <= maxTokens) {
		return { text: content, truncated: false };
	}

	// Keep approximately maxTokens worth of characters
	const maxChars = Math.floor(maxTokens / DEFAULTS.tokensPerChar);

	// Try to keep the beginning (title, headings) and cut at a paragraph boundary
	const cutPoint = content.lastIndexOf("\n\n", maxChars);
	const sliceEnd = cutPoint > maxChars * 0.5 ? cutPoint : maxChars;

	const truncated = content.slice(0, sliceEnd);
	return {
		text: `${truncated}\n\n---\n[Source truncated: original was ~${estimated} tokens, showing first ~${estimateTokens(truncated)} tokens]`,
		truncated: true,
	};
}

// ─── Smart context selection ───────────────────────────────────

/**
 * For large vaults, send article summaries instead of full content.
 * Returns compact context when existing articles exceed the budget.
 */
function selectContext(
	existingArticles: { path: string; content: string }[],
	manifest: Manifest,
	contextBudget: number,
): { path: string; content: string }[] {
	if (existingArticles.length === 0) return [];

	const totalTokens = existingArticles.reduce((sum, a) => sum + estimateTokens(a.content), 0);

	// If existing articles fit in the budget, send them in full
	if (totalTokens <= contextBudget) {
		return existingArticles;
	}

	// Otherwise, send compact summaries
	return existingArticles.map((article) => {
		const relPath = article.path.replace(/^wiki\//, "").replace(/\.md$/, "");
		const slug = relPath.split("/").pop() ?? relPath;
		const entry = manifest.articles[slug];

		if (entry) {
			const summary = `---\ntitle: ${slug}\ncategory: ${entry.category}\ntags: [${entry.tags.join(", ")}]\nsummary: ${entry.summary}\n---\n\n(Full article omitted for context budget — ${entry.wordCount} words)`;
			return { path: article.path, content: summary };
		}
		return article;
	});
}

// ─── Duplicate detection ───────────────────────────────────────

/**
 * Check if newly created articles overlap with existing ones.
 * Returns merge suggestions as warnings.
 */
function detectDuplicateArticles(operations: FileOperation[], manifest: Manifest): string[] {
	const warnings: string[] = [];

	for (const op of operations) {
		if (op.op !== "create" || !op.content) continue;

		const { frontmatter } = parseFrontmatter(op.content);
		const newSlug = (frontmatter.slug as string) ?? "";
		const newTags = Array.isArray(frontmatter.tags) ? (frontmatter.tags as string[]) : [];
		const newTitle = ((frontmatter.title as string) ?? "").toLowerCase();

		for (const [existingSlug, existingArticle] of Object.entries(manifest.articles)) {
			if (existingSlug === newSlug) continue; // same article = update, not dup

			// Check title similarity (simple substring match)
			const existingTitle = existingArticle.summary.split(".")[0]?.toLowerCase() ?? "";
			const titleOverlap =
				(newTitle && existingTitle && newTitle.includes(existingTitle)) ||
				(newTitle && existingTitle?.includes(newTitle));

			// Check tag overlap (>= 3 shared tags = likely same topic)
			const sharedTags = newTags.filter((t) => existingArticle.tags.includes(t));

			if (titleOverlap || sharedTags.length >= 3) {
				warnings.push(
					`Potential duplicate: new "${newSlug}" overlaps with existing "${existingSlug}" (${sharedTags.length} shared tags${titleOverlap ? ", similar title" : ""})`,
				);
			}
		}
	}

	return warnings;
}

// ─── Retry with adjusted prompt ────────────────────────────────

const MAX_RETRIES = 2;

async function compileWithRetry(
	provider: LLMProvider,
	system: string,
	userPrompt: string,
	maxTokens: number,
	cache: CompileCache | null,
	onProgress?: (msg: string) => void,
): Promise<{ content: string; inputTokens: number; outputTokens: number; cached: boolean }> {
	// Check cache first
	if (cache) {
		const cacheKey = await cache.key(system, userPrompt);
		const cached = await cache.get(cacheKey);
		if (cached) {
			return {
				content: cached.content,
				inputTokens: cached.usage.inputTokens,
				outputTokens: cached.usage.outputTokens,
				cached: true,
			};
		}
	}

	let lastError: Error | null = null;

	for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
		const prompt =
			attempt === 0
				? userPrompt
				: `${userPrompt}\n\nIMPORTANT: Your previous response was not valid JSON. You MUST respond with ONLY a raw JSON array of file operations. No markdown, no explanation, no code fences. Just the JSON array starting with [ and ending with ].`;

		try {
			const result = await provider.complete({
				system,
				messages: [{ role: "user", content: prompt }],
				temperature: 0,
				maxTokens,
			});

			// Validate it parses before returning
			parseCompileOutput(result.content);

			// Cache the successful response
			if (cache) {
				const cacheKey = await cache.key(system, userPrompt);
				await cache.set(cacheKey, result.content, result.usage);
			}

			return {
				content: result.content,
				inputTokens: result.usage.inputTokens,
				outputTokens: result.usage.outputTokens,
				cached: false,
			};
		} catch (err) {
			lastError = err as Error;
			if (attempt < MAX_RETRIES) {
				onProgress?.(`Parse failed (attempt ${attempt + 1}/${MAX_RETRIES + 1}), retrying...`);
			}
		}
	}

	throw lastError!;
}

// ─── Single source compilation ─────────────────────────────────

interface SourceCompileResult {
	operations: FileOperation[];
	created: number;
	updated: number;
	deleted: number;
	tokenUsage: SourceTokenUsage;
	warnings: string[];
}

async function compileSingleSource(
	root: string,
	provider: LLMProvider,
	manifest: Manifest,
	sourceId: string,
	sourcePath: string,
	config: VaultConfig,
	indexContent: string,
	cache: CompileCache | null,
	options: CompileOptions & { onArticle?: (event: ArticleEvent) => void },
	imageAssets?: string[],
): Promise<SourceCompileResult> {
	const categories = config.compile.categories;
	const contextWindow = config.compile.context_window;
	const maxSourceTokens = config.compile.max_source_tokens;
	const warnings: string[] = [];

	// Read the raw source content
	let sourceContent = await readRaw(root, sourcePath);

	// Estimate tokens and warn/truncate if needed
	const sourceTokens = estimateTokens(sourceContent);

	if (sourceTokens > contextWindow * 0.8) {
		warnings.push(
			`Source "${sourcePath}" (~${sourceTokens} tokens) approaches the context window (${contextWindow}). Output quality may degrade.`,
		);
	}

	let truncated = false;
	if (sourceTokens > maxSourceTokens) {
		const result = truncateSource(sourceContent, maxSourceTokens);
		sourceContent = result.text;
		truncated = result.truncated;
		if (truncated) {
			warnings.push(
				`Source "${sourcePath}" was truncated from ~${sourceTokens} to ~${maxSourceTokens} tokens.`,
			);
		}
	}

	// Read existing articles this source produced (for context)
	const rawExistingArticles = await loadExistingArticles(root, manifest, sourceId);

	// Smart context selection: use summaries if articles are too large
	const contextBudget = Math.floor(contextWindow * 0.3); // 30% of context for existing articles
	const existingArticles = selectContext(rawExistingArticles, manifest, contextBudget);

	// Build the compile prompt
	const today = new Date().toISOString().split("T")[0]!;
	const userPrompt = compileUserPrompt({
		indexContent,
		sourceContent,
		sourcePath: `raw/${sourcePath}`,
		existingArticles,
		today,
	});

	// Call the LLM with retry and cache
	const system = compileSystemPrompt(categories, {
		imageAssets: imageAssets && imageAssets.length > 0 ? imageAssets : undefined,
	});
	const result = await compileWithRetry(
		provider,
		system,
		userPrompt,
		8192,
		cache,
		options.onProgress,
	);

	const operations = parseCompileOutput(result.content);

	// Detect potential duplicates
	const dupWarnings = detectDuplicateArticles(operations, manifest);
	warnings.push(...dupWarnings);

	let created = 0;
	let updated = 0;
	let deleted = 0;

	if (!options.dryRun) {
		const producedArticles: string[] = [];

		for (const op of operations) {
			const wikiRelPath = op.path.replace(/^wiki\//, "");

			if (op.op === "create" || op.op === "update") {
				if (!op.content) continue;
				await writeWiki(root, wikiRelPath, op.content);
				producedArticles.push(op.path);

				// Update article entry in manifest
				const { frontmatter, body } = parseFrontmatter(op.content);
				const articleSlug = (frontmatter.slug as string) ?? wikiRelPath.replace(/\.md$/, "");
				const contentHash = await hash(op.content);
				const wikilinks = extractWikilinks(op.content);
				const now = new Date().toISOString();

				manifest.articles[articleSlug] = {
					hash: contentHash,
					createdAt: op.op === "create" ? now : (manifest.articles[articleSlug]?.createdAt ?? now),
					lastUpdated: now,
					derivedFrom: [`raw/${sourcePath}`],
					backlinks: [], // will be computed after all sources are compiled
					forwardLinks: wikilinks,
					tags: Array.isArray(frontmatter.tags) ? (frontmatter.tags as string[]) : [],
					summary: (frontmatter.summary as string) ?? "",
					wordCount: countWords(body),
					category: normalizeCategory((frontmatter.category as string) ?? "topic"),
				};

				const articleTitle = (frontmatter.title as string) ?? articleSlug;
				options.onArticle?.({ op: op.op, title: articleTitle, path: op.path, source: sourcePath });

				if (op.op === "create") created++;
				else updated++;
			} else if (op.op === "delete") {
				const fullPath = join(root, op.path);
				await deleteFile(fullPath);
				deleted++;

				// Remove from manifest
				const slug = wikiRelPath.replace(/\.md$/, "");
				const deletedTitle = manifest.articles[slug]?.summary?.split(".")[0] ?? slug;
				options.onArticle?.({
					op: "delete",
					title: deletedTitle,
					path: op.path,
					source: sourcePath,
				});
				delete manifest.articles[slug];
			}
		}

		// Update source entry
		manifest.sources[sourceId]!.lastCompiled = new Date().toISOString();
		manifest.sources[sourceId]!.producedArticles = producedArticles;
	} else {
		for (const op of operations) {
			if (op.op === "create" || op.op === "update") {
				const { frontmatter } = op.content
					? parseFrontmatter(op.content)
					: { frontmatter: {} as Record<string, unknown> };
				const slug =
					op.path
						.replace(/^wiki\//, "")
						.replace(/\.md$/, "")
						.split("/")
						.pop() ?? op.path;
				const title = ((frontmatter as Record<string, unknown>).title as string) ?? slug;
				options.onArticle?.({ op: op.op, title, path: op.path, source: sourcePath });
			} else if (op.op === "delete") {
				const slug =
					op.path
						.replace(/^wiki\//, "")
						.replace(/\.md$/, "")
						.split("/")
						.pop() ?? op.path;
				options.onArticle?.({ op: "delete", title: slug, path: op.path, source: sourcePath });
			}

			if (op.op === "create") created++;
			else if (op.op === "update") updated++;
			else if (op.op === "delete") deleted++;
		}
	}

	return {
		operations,
		created,
		updated,
		deleted,
		tokenUsage: {
			sourceId,
			sourcePath,
			inputTokens: result.inputTokens,
			outputTokens: result.outputTokens,
			cached: result.cached,
			truncated,
		},
		warnings,
	};
}

// ─── Main compile function ─────────────────────────────────────

/**
 * Compile pending raw sources into wiki articles.
 */
export async function compileVault(
	root: string,
	provider: LLMProvider,
	config: VaultConfig,
	options: CompileOptions = {},
): Promise<CompileResult> {
	// Dry runs don't write — skip locking and backups
	if (options.dryRun) {
		return compileVaultInner(root, provider, config, options);
	}

	return withLock(root, "compile", async () => {
		// Back up manifest before force-recompile (destructive operation)
		if (options.force) {
			await createBackup(root);
		}
		return compileVaultInner(root, provider, config, options);
	});
}

async function compileVaultInner(
	root: string,
	provider: LLMProvider,
	config: VaultConfig,
	options: CompileOptions,
): Promise<CompileResult> {
	const manifest = await loadManifest(root);

	// Find sources that need compilation
	const pendingSources = findPendingSources(manifest, options);

	if (pendingSources.length === 0) {
		return {
			sourcesCompiled: 0,
			articlesCreated: 0,
			articlesUpdated: 0,
			articlesDeleted: 0,
			articlesEnriched: 0,
			operations: [],
		};
	}

	// Limit sources per pass
	const maxSources = options.maxSources ?? config.compile.max_sources_per_pass;
	const sourcesToCompile = pendingSources.slice(0, maxSources);

	// Read current INDEX.md for context
	const indexContent = await readIndex(root);

	// Load available image assets for reference in articles
	const imageAssets = await listImageAssets(root);

	// Initialize compile cache
	const cache = new CompileCache(root, {
		enabled: config.cache.enabled,
		ttlHours: config.cache.ttl_hours,
	});

	let totalCreated = 0;
	let totalUpdated = 0;
	let totalDeleted = 0;
	let totalEnriched = 0;
	const allOperations: CompileResult["operations"] = [];
	const newlyChangedSlugs = new Set<string>();
	const perSourceUsage: SourceTokenUsage[] = [];
	const allWarnings: string[] = [];

	// Token budget tracking
	let totalInputTokens = 0;
	const maxTokensPerPass = config.compile.max_tokens_per_pass;

	// Compile sources (parallel or sequential)
	const useParallel = config.compile.parallel && sourcesToCompile.length > 1;

	if (useParallel) {
		const maxParallel = config.compile.max_parallel;
		options.onProgress?.(
			`Compiling ${sourcesToCompile.length} sources (${maxParallel} parallel)...`,
		);

		// Process in batches
		for (let i = 0; i < sourcesToCompile.length; i += maxParallel) {
			// Check token budget before starting a new batch
			if (maxTokensPerPass && totalInputTokens >= maxTokensPerPass) {
				allWarnings.push(
					`Token budget exhausted (${totalInputTokens}/${maxTokensPerPass}). Stopping after ${i} sources.`,
				);
				break;
			}

			const batch = sourcesToCompile.slice(i, i + maxParallel);
			const results = await Promise.allSettled(
				batch.map(([sourceId, sourcePath]) =>
					compileSingleSource(
						root,
						provider,
						manifest,
						sourceId,
						sourcePath,
						config,
						indexContent,
						cache,
						options,
						imageAssets,
					),
				),
			);

			for (let j = 0; j < results.length; j++) {
				const result = results[j]!;
				const [_sourceId, sourcePath] = batch[j]!;

				if (result.status === "fulfilled") {
					const r = result.value;
					totalCreated += r.created;
					totalUpdated += r.updated;
					totalDeleted += r.deleted;
					allOperations.push(...r.operations);
					perSourceUsage.push(r.tokenUsage);
					allWarnings.push(...r.warnings);
					totalInputTokens += r.tokenUsage.inputTokens;

					// Track changed slugs for enrichment
					for (const op of r.operations) {
						if (op.op === "create" || op.op === "update") {
							const slug = op.path
								.replace(/^wiki\//, "")
								.replace(/\.md$/, "")
								.split("/")
								.pop();
							if (slug) newlyChangedSlugs.add(slug);
						}
					}
				} else {
					const msg = (result.reason as Error).message ?? String(result.reason);
					if (
						msg.includes("401") ||
						msg.includes("404") ||
						msg.includes("authentication") ||
						msg.includes("No LLM provider")
					) {
						throw result.reason;
					}
					allWarnings.push(`Failed to compile ${sourcePath}: ${msg}`);
					options.onProgress?.(`Failed to compile ${sourcePath}: ${msg}`);
				}
			}
		}
	} else {
		// Sequential compilation (original behavior)
		for (const [sourceId, sourcePath] of sourcesToCompile) {
			// Check token budget
			if (maxTokensPerPass && totalInputTokens >= maxTokensPerPass) {
				allWarnings.push(
					`Token budget exhausted (${totalInputTokens}/${maxTokensPerPass}). Skipping remaining sources.`,
				);
				break;
			}

			options.onProgress?.(`Compiling ${sourcePath}...`);

			try {
				const result = await compileSingleSource(
					root,
					provider,
					manifest,
					sourceId,
					sourcePath,
					config,
					indexContent,
					cache,
					options,
					imageAssets,
				);

				totalCreated += result.created;
				totalUpdated += result.updated;
				totalDeleted += result.deleted;
				allOperations.push(...result.operations);
				perSourceUsage.push(result.tokenUsage);
				allWarnings.push(...result.warnings);
				totalInputTokens += result.tokenUsage.inputTokens;

				// Track changed slugs for enrichment
				for (const op of result.operations) {
					if (op.op === "create" || op.op === "update") {
						const slug = op.path
							.replace(/^wiki\//, "")
							.replace(/\.md$/, "")
							.split("/")
							.pop();
						if (slug) newlyChangedSlugs.add(slug);
					}
				}
			} catch (err) {
				const msg = (err as Error).message ?? String(err);
				if (
					msg.includes("401") ||
					msg.includes("404") ||
					msg.includes("authentication") ||
					msg.includes("No LLM provider")
				) {
					throw err;
				}
				allWarnings.push(`Failed to compile ${sourcePath}: ${msg}`);
				options.onProgress?.(`Failed to compile ${sourcePath}: ${msg}`);
			}
		}
	}

	if (!options.dryRun) {
		// Cross-reference enrichment pass
		if (config.compile.enrich_cross_refs !== false && newlyChangedSlugs.size > 0) {
			options.onProgress?.("Enriching cross-references...");
			try {
				const enrichResult = await enrichCrossReferences(
					root,
					provider,
					manifest,
					newlyChangedSlugs,
					{
						maxArticles: config.compile.max_enrich_articles,
						onProgress: options.onProgress,
					},
				);
				totalEnriched += enrichResult.articlesEnriched;
				allOperations.push(...enrichResult.operations);
			} catch {
				options.onProgress?.("Cross-reference enrichment failed, continuing...");
			}
		}

		// Rebuild link graph (backlinks)
		options.onProgress?.("Updating backlinks...");
		const graph = await buildLinkGraph(root);

		// Update backlinks in manifest
		for (const [slug, backlinksSet] of graph.backlinks) {
			if (manifest.articles[slug]) {
				manifest.articles[slug]!.backlinks = [...backlinksSet];
			}
		}
		for (const [slug, forwardSet] of graph.forwardLinks) {
			if (manifest.articles[slug]) {
				manifest.articles[slug]!.forwardLinks = [...forwardSet];
			}
		}

		// Regenerate INDEX.md
		if (config.compile.auto_index) {
			options.onProgress?.("Updating INDEX.md...");
			const indexMd = await generateIndexMd(root);
			await writeWiki(root, INDEX_FILE, indexMd);
		}

		// Regenerate GRAPH.md
		if (config.compile.auto_graph) {
			options.onProgress?.("Updating GRAPH.md...");
			const graphMd = generateGraphMd(graph);
			await writeWiki(root, GRAPH_FILE, graphMd);
		}

		// Update manifest stats
		const stats = await computeStats(root);
		manifest.stats.totalArticles = stats.totalArticles;
		manifest.stats.totalWords = stats.totalWords;
		manifest.stats.totalSources = Object.keys(manifest.sources).length;
		manifest.vault.lastCompiled = new Date().toISOString();

		await saveManifest(root, manifest);

		// Update search index with newly compiled wiki articles
		try {
			const { SearchIndex } = await import("../search/engine.js");
			const searchIndex = new SearchIndex();
			await searchIndex.load(root);
			for (const op of allOperations) {
				if ((op.op === "create" || op.op === "update") && op.content) {
					const { frontmatter, body } = parseFrontmatter(op.content);
					const title =
						(frontmatter.title as string) ?? op.path.split("/").pop()?.replace(/\.md$/, "") ?? "";
					const tags = Array.isArray(frontmatter.tags) ? (frontmatter.tags as string[]) : [];
					const date =
						(frontmatter.created as string) ??
						(frontmatter.updated as string) ??
						new Date().toISOString().slice(0, 10);
					searchIndex.addDocument({
						path: join(root, op.path),
						title,
						content: body,
						tags,
						date,
					});
				}
			}
			await searchIndex.save(root);
		} catch {
			// Search index update is best-effort — don't fail the compile
		}

		// Log compile activity
		const parts = [`${sourcesToCompile.length} sources compiled`];
		if (totalCreated > 0) parts.push(`${totalCreated} articles created`);
		if (totalUpdated > 0) parts.push(`${totalUpdated} articles updated`);
		if (totalEnriched > 0) parts.push(`${totalEnriched} articles enriched`);
		const cachedCount = perSourceUsage.filter((u) => u.cached).length;
		if (cachedCount > 0) parts.push(`${cachedCount} cache hits`);
		await appendLog(root, "compile", parts.join(", "));
	}

	// Compute total token usage
	const totalOutputTokens = perSourceUsage.reduce((sum, u) => sum + u.outputTokens, 0);

	return {
		sourcesCompiled: perSourceUsage.length,
		articlesCreated: totalCreated,
		articlesUpdated: totalUpdated,
		articlesDeleted: totalDeleted,
		articlesEnriched: totalEnriched,
		operations: allOperations,
		tokenUsage: {
			totalInputTokens,
			totalOutputTokens,
			perSource: perSourceUsage,
		},
		warnings: allWarnings.length > 0 ? allWarnings : undefined,
	};
}

/**
 * Find sources that need compilation.
 */
function findPendingSources(manifest: Manifest, options: CompileOptions): [string, string][] {
	const pending: [string, string][] = [];

	for (const [sourceId, source] of Object.entries(manifest.sources)) {
		// If filtering to a specific source
		if (options.sourceFilter) {
			const matchesId = sourceId === options.sourceFilter;
			const matchesPath = source.producedArticles.some((p) => p.includes(options.sourceFilter!));
			if (!matchesId && !matchesPath) continue;
		}

		// Determine the raw file path from sourceId
		// Source was written to raw/{category}/{slug}.md
		const rawPath = findRawPath(manifest, sourceId);
		if (!rawPath) continue;

		if (options.force || !source.lastCompiled || source.lastCompiled < source.ingestedAt) {
			pending.push([sourceId, rawPath]);
		}
	}

	return pending;
}

/**
 * Find the raw file path for a source.
 * Sources are tracked by ID; we need to find which raw/ file they correspond to.
 */
function findRawPath(manifest: Manifest, sourceId: string): string | null {
	const source = manifest.sources[sourceId];
	if (!source) return null;

	// The raw path is derived from the source metadata
	const title = source.metadata.title ?? sourceId;
	const slug = title
		.toLowerCase()
		.replace(/[^a-z0-9\s-]/g, "")
		.replace(/\s+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "")
		.slice(0, 80);

	const category = categoryForSourceType(source.sourceType);
	return `${category}/${slug}.md`;
}

function categoryForSourceType(sourceType: string): string {
	switch (sourceType) {
		case "pdf":
			return "papers";
		case "youtube":
			return "transcripts";
		case "github":
			return "repos";
		case "image":
			return "images";
		default:
			return "articles";
	}
}

type ArticleCategory = "concept" | "topic" | "reference" | "output";

/** Normalize category from plural directory name to singular schema value */
function normalizeCategory(raw: string): ArticleCategory {
	const map: Record<string, ArticleCategory> = {
		concepts: "concept",
		concept: "concept",
		topics: "topic",
		topic: "topic",
		references: "reference",
		reference: "reference",
		outputs: "output",
		output: "output",
	};
	return map[raw.toLowerCase()] ?? "topic";
}

/**
 * Load existing wiki articles that a source previously produced.
 */
async function loadExistingArticles(
	root: string,
	manifest: Manifest,
	sourceId: string,
): Promise<{ path: string; content: string }[]> {
	const source = manifest.sources[sourceId];
	if (!source?.producedArticles.length) return [];

	const articles: { path: string; content: string }[] = [];
	for (const articlePath of source.producedArticles) {
		try {
			const relPath = articlePath.replace(/^wiki\//, "");
			const content = await readWiki(root, relPath);
			articles.push({ path: articlePath, content });
		} catch {
			// Article might have been deleted
		}
	}
	return articles;
}
