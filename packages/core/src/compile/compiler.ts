import { join } from "node:path";
import { GRAPH_FILE, INDEX_FILE } from "../constants.js";
import { hash } from "../hash.js";
import { countWords } from "../ingest/normalize.js";
import type { CompileResult, LLMProvider, Manifest, VaultConfig } from "../types.js";
import {
	deleteFile,
	loadManifest,
	readIndex,
	readRaw,
	readWiki,
	saveManifest,
	writeWiki,
} from "../vault.js";
import { buildLinkGraph, generateGraphMd } from "./backlinks.js";
import { extractWikilinks, parseCompileOutput, parseFrontmatter } from "./diff.js";
import { computeStats, generateIndexMd } from "./index-manager.js";
import { compileSystemPrompt, compileUserPrompt } from "./prompts.js";

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
}

/**
 * Compile pending raw sources into wiki articles.
 */
export async function compileVault(
	root: string,
	provider: LLMProvider,
	config: VaultConfig,
	options: CompileOptions = {},
): Promise<CompileResult> {
	const manifest = await loadManifest(root);
	const categories = config.compile.categories;

	// Find sources that need compilation
	const pendingSources = findPendingSources(manifest, options);

	if (pendingSources.length === 0) {
		return {
			sourcesCompiled: 0,
			articlesCreated: 0,
			articlesUpdated: 0,
			articlesDeleted: 0,
			operations: [],
		};
	}

	// Limit sources per pass
	const maxSources = options.maxSources ?? config.compile.max_sources_per_pass;
	const sourcesToCompile = pendingSources.slice(0, maxSources);

	// Read current INDEX.md for context
	const indexContent = await readIndex(root);

	let totalCreated = 0;
	let totalUpdated = 0;
	let totalDeleted = 0;
	const allOperations: CompileResult["operations"] = [];

	for (const [sourceId, sourcePath] of sourcesToCompile) {
		options.onProgress?.(`Compiling ${sourcePath}...`);

		try {
			// Read the raw source content
			const sourceContent = await readRaw(root, sourcePath);

			// Read existing articles this source produced (for context)
			const existingArticles = await loadExistingArticles(root, manifest, sourceId);

			// Build the compile prompt
			const today = new Date().toISOString().split("T")[0]!;
			const userPrompt = compileUserPrompt({
				indexContent,
				sourceContent,
				sourcePath: `raw/${sourcePath}`,
				existingArticles,
				today,
			});

			// Call the LLM
			const result = await provider.complete({
				system: compileSystemPrompt(categories),
				messages: [{ role: "user", content: userPrompt }],
				temperature: 0,
				maxTokens: 8192,
			});

			// Parse the response into file operations
			const operations = parseCompileOutput(result.content);

			if (options.dryRun) {
				allOperations.push(...operations);
				for (const op of operations) {
					if (op.op === "create") totalCreated++;
					else if (op.op === "update") totalUpdated++;
					else if (op.op === "delete") totalDeleted++;
				}
				continue;
			}

			// Execute file operations
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
						createdAt:
							op.op === "create" ? now : (manifest.articles[articleSlug]?.createdAt ?? now),
						lastUpdated: now,
						derivedFrom: [`raw/${sourcePath}`],
						backlinks: [], // will be computed after all sources are compiled
						forwardLinks: wikilinks,
						tags: Array.isArray(frontmatter.tags) ? (frontmatter.tags as string[]) : [],
						summary: (frontmatter.summary as string) ?? "",
						wordCount: countWords(body),
						category: (frontmatter.category as string) ?? "topic",
					};

					if (op.op === "create") totalCreated++;
					else totalUpdated++;
				} else if (op.op === "delete") {
					const fullPath = join(root, op.path);
					await deleteFile(fullPath);
					totalDeleted++;

					// Remove from manifest
					const slug = wikiRelPath.replace(/\.md$/, "");
					delete manifest.articles[slug];
				}

				allOperations.push(op);
			}

			// Update source entry
			manifest.sources[sourceId]!.lastCompiled = new Date().toISOString();
			manifest.sources[sourceId]!.producedArticles = producedArticles;
		} catch (err) {
			const msg = (err as Error).message ?? String(err);
			// Auth and provider errors should not be silently swallowed
			if (
				msg.includes("401") ||
				msg.includes("authentication") ||
				msg.includes("No LLM provider")
			) {
				throw err;
			}
			options.onProgress?.(`Failed to compile ${sourcePath}: ${msg}`);
			// Continue with other sources on non-fatal errors (e.g. parse failures)
		}
	}

	if (!options.dryRun) {
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
	}

	return {
		sourcesCompiled: sourcesToCompile.length,
		articlesCreated: totalCreated,
		articlesUpdated: totalUpdated,
		articlesDeleted: totalDeleted,
		operations: allOperations,
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
