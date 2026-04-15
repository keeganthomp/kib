import { join } from "node:path";
import {
	compileVault,
	createProvider,
	fixLintIssues,
	ingestSource,
	type LLMProvider,
	lintVault,
	listRaw,
	listWiki,
	loadConfig,
	loadManifest,
	type Manifest,
	queryVault,
	readGraph,
	readIndex,
	readRaw,
	readWiki,
	SearchIndex,
	saveConfig,
	type VaultConfig,
} from "@kibhq/core";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// ─── Context ────────────────────────────────────────────────────

interface McpContext {
	root: string;
	getConfig(): Promise<VaultConfig>;
	getManifest(): Promise<Manifest>;
	getProvider(): Promise<LLMProvider>;
	getSearchIndex(): Promise<SearchIndex>;
	invalidateSearch(): void;
}

function createContext(root: string): McpContext {
	let cachedConfig: VaultConfig | null = null;
	let cachedProvider: LLMProvider | null = null;
	let cachedIndex: SearchIndex | null = null;

	return {
		root,
		async getConfig() {
			if (!cachedConfig) cachedConfig = await loadConfig(root);
			return cachedConfig;
		},
		async getManifest() {
			// Always re-read — vault mutates
			return loadManifest(root);
		},
		async getProvider() {
			if (!cachedProvider) {
				const config = await this.getConfig();
				cachedProvider = await createProvider(config.provider.default, config.provider.model);
			}
			return cachedProvider;
		},
		async getSearchIndex() {
			if (!cachedIndex) {
				cachedIndex = new SearchIndex();
				const loaded = await cachedIndex.load(root);
				if (!loaded) {
					await cachedIndex.build(root, "all");
					await cachedIndex.save(root);
				}
			}
			return cachedIndex;
		},
		invalidateSearch() {
			cachedIndex = null;
		},
	};
}

// ─── Helpers ────────────────────────────────────────────────────

function ok(text: string) {
	return { content: [{ type: "text" as const, text }] };
}

function err(text: string) {
	return { content: [{ type: "text" as const, text }], isError: true as const };
}

function json(data: unknown) {
	return ok(JSON.stringify(data, null, 2));
}

// ─── Server ─────────────────────────────────────────────────────

export function createMcpServer(root: string) {
	const ctx = createContext(root);

	const server = new McpServer({
		name: "kib",
		version: "0.2.0",
	});

	// ── kib_status ────────────────────────────────────────────

	server.tool(
		"kib_status",
		"Call this first. Returns vault state, provider readiness, and setup instructions. Use the output to greet the user and guide them through any needed setup.",
		{},
		async () => {
			try {
				const manifest = await ctx.getManifest();
				const config = await ctx.getConfig();
				const providerConfigured = await ctx
					.getProvider()
					.then(() => true)
					.catch(() => false);

				const envKeys: Record<string, string> = {
					anthropic: "ANTHROPIC_API_KEY",
					openai: "OPENAI_API_KEY",
					ollama: "(Ollama must be running on localhost:11434)",
				};

				const result: Record<string, unknown> = {
					name: manifest.vault.name,
					provider: config.provider.default,
					model: config.provider.model,
					providerConfigured,
					totalSources: manifest.stats.totalSources,
					totalArticles: manifest.stats.totalArticles,
					totalWords: manifest.stats.totalWords,
					lastCompiled: manifest.vault.lastCompiled,
					lastLint: manifest.stats.lastLintAt,
					availableNow: [
						"kib_search",
						"kib_list",
						"kib_read",
						"kib_ingest",
						"kib_export",
						"kib_lint",
						"kib_config",
					],
					requiresProvider: ["kib_compile", "kib_query", "kib_skill"],
				};

				if (!providerConfigured) {
					const envKey = envKeys[config.provider.default] ?? "an API key";
					result.setupInstructions =
						config.provider.default === "ollama"
							? "Start Ollama with: ollama serve"
							: `Set ${envKey} in the environment or add it to ~/.config/kib/credentials. kib_ingest still works — sources are saved but not compiled until the key is set.`;
				}

				return json(result);
			} catch (e) {
				return err((e as Error).message);
			}
		},
	);

	// ── kib_list ──────────────────────────────────────────────

	server.tool(
		"kib_list",
		"List all wiki articles or raw sources in the knowledge base. No API key needed.",
		{
			scope: z.enum(["wiki", "raw"]).default("wiki").describe("List wiki articles or raw sources"),
		},
		async ({ scope }) => {
			try {
				const files = scope === "wiki" ? await listWiki(root) : await listRaw(root);
				// Strip absolute path prefix to return vault-relative paths
				const prefix = `${root}/`;
				const relative = files.map((f) => f.replace(prefix, ""));
				return json(relative);
			} catch (e) {
				return err((e as Error).message);
			}
		},
	);

	// ── kib_read ─────────────────────────────��────────────────

	server.tool(
		"kib_read",
		"Read a specific wiki article or raw source from the knowledge base. No API key needed.",
		{
			path: z.string().describe("Relative path, e.g. 'concepts/attention.md'"),
			scope: z.enum(["wiki", "raw"]).default("wiki").describe("Read from wiki/ or raw/"),
		},
		async ({ path, scope }) => {
			try {
				const content = scope === "wiki" ? await readWiki(root, path) : await readRaw(root, path);
				return ok(content);
			} catch (_e) {
				return err(`File not found: ${path}`);
			}
		},
	);

	// ── kib_search ────────────────────────────────────────────

	server.tool(
		"kib_search",
		"Search the knowledge base using full-text BM25 search. No API key needed. Supports fuzzy matching, phrase search (wrap in quotes), tag filtering, and date filtering.",
		{
			query: z
				.string()
				.describe(
					'Search query. Wrap phrases in quotes for exact match, e.g. "attention mechanism"',
				),
			limit: z.number().int().positive().max(50).default(10).describe("Max results"),
			tag: z
				.union([z.string(), z.array(z.string())])
				.optional()
				.describe("Filter by frontmatter tag(s). Single tag or array for AND logic."),
			since: z
				.string()
				.optional()
				.describe("Filter to articles dated on or after this date (YYYY-MM-DD)"),
			scope: z
				.enum(["wiki", "raw", "all"])
				.default("all")
				.describe("Search scope: wiki articles, raw sources, or all"),
		},
		async ({ query, limit, tag, since, scope }) => {
			try {
				// Rebuild index with requested scope if not 'all'
				const index = scope === "all" ? await ctx.getSearchIndex() : new SearchIndex();
				if (scope !== "all") {
					await index.build(root, scope);
				}
				const results = index.search(query, { limit, tag, since });
				const prefix = `${root}/`;
				return json(
					results.map((r) => ({
						title: r.title,
						path: r.path.replace(prefix, ""),
						score: r.score,
						snippet: r.snippet,
					})),
				);
			} catch (e) {
				return err((e as Error).message);
			}
		},
	);

	// ── kib_query ─────────────────────────────────────────────

	server.tool(
		"kib_query",
		"Ask a question against the knowledge base using RAG (retrieval-augmented generation). Searches both raw sources and compiled wiki articles, so it works immediately after ingest — no compile needed. Requires a configured LLM provider.",
		{
			question: z.string().describe("Question to ask"),
			max_articles: z
				.number()
				.int()
				.positive()
				.max(10)
				.default(5)
				.describe("Max sources/articles to use as context"),
			source: z
				.string()
				.optional()
				.describe(
					"Path to a specific source to query against (e.g. 'raw/articles/my-source.md'). Skips search and uses only this source as context.",
				),
		},
		async ({ question, max_articles, source }) => {
			try {
				const provider = await ctx.getProvider();
				const config = await ctx.getConfig();
				const sourcePath = source ? join(root, source) : undefined;
				const result = await queryVault(root, question, provider, {
					maxArticles: max_articles,
					autoFile: config.query.auto_file,
					autoFileThreshold: config.query.auto_file_threshold,
					source: sourcePath,
				});
				const filed = result.filedTo ? `\nFiled to: ${result.filedTo}` : "";
				return ok(
					`${result.answer}\n\n---\nSources: ${result.sourcePaths.join(", ") || "none"}${filed}`,
				);
			} catch (e) {
				return err((e as Error).message);
			}
		},
	);

	// ── kib_ingest ────────────────────────────────────────────

	server.tool(
		"kib_ingest",
		"Ingest a source (URL or file path) into the knowledge base. No API key needed for ingestion. Sources are immediately searchable and queryable after ingest. Auto-compiles into wiki articles if an LLM provider is configured.",
		{
			source: z.string().describe("URL or file path to ingest"),
			category: z
				.string()
				.optional()
				.describe("Raw subdirectory override (e.g. 'papers', 'articles')"),
			tags: z.string().optional().describe("Comma-separated tags"),
			dry_run: z
				.boolean()
				.default(false)
				.describe("Preview what would be ingested without writing"),
		},
		async ({ source, category, tags, dry_run }) => {
			try {
				const result = await ingestSource(root, source, {
					category,
					tags: tags?.split(",").map((t) => t.trim()),
					dryRun: dry_run,
				});

				if (dry_run) {
					return json({
						dryRun: true,
						path: result.path,
						title: result.title,
						wordCount: result.wordCount,
						skipped: result.skipped,
					});
				}

				// Auto-compile after ingest so content is immediately queryable
				let compiled = null;
				if (!result.skipped) {
					try {
						const provider = await ctx.getProvider();
						const config = await ctx.getConfig();
						compiled = await compileVault(root, provider, config, {
							sourceFilter: result.path,
						});
						ctx.invalidateSearch();
					} catch (compileErr) {
						// Ingest succeeded but compile failed — give actionable feedback
						ctx.invalidateSearch();
						const msg = (compileErr as Error).message;
						const isProviderErr = msg.includes("No LLM provider");
						return json({
							path: result.path,
							title: result.title,
							wordCount: result.wordCount,
							skipped: result.skipped,
							searchable: true,
							compiled: null,
							compileError: isProviderErr
								? "No LLM provider configured. Source is searchable and queryable immediately. To compile into wiki articles, set ANTHROPIC_API_KEY, OPENAI_API_KEY, or start Ollama, then run `kib compile`."
								: msg,
						});
					}
				}

				ctx.invalidateSearch();
				return json({
					path: result.path,
					title: result.title,
					wordCount: result.wordCount,
					skipped: result.skipped,
					skipReason: result.skipReason,
					searchable: !result.skipped,
					compiled: compiled
						? {
								articlesCreated: compiled.articlesCreated,
								articlesUpdated: compiled.articlesUpdated,
							}
						: null,
				});
			} catch (e) {
				return err((e as Error).message);
			}
		},
	);

	// ── kib_compile ───────────────────────────────────────────

	server.tool(
		"kib_compile",
		"Compile pending raw sources into wiki articles. Requires a configured LLM provider.",
		{
			force: z.boolean().default(false).describe("Recompile all sources"),
			source: z.string().optional().describe("Compile only a specific source"),
			dry_run: z.boolean().default(false).describe("Preview without writing"),
			max: z
				.number()
				.int()
				.positive()
				.optional()
				.describe("Limit number of sources to compile per pass"),
		},
		async ({ force, source, dry_run, max }) => {
			try {
				const provider = await ctx.getProvider();
				const config = await ctx.getConfig();
				const result = await compileVault(root, provider, config, {
					force,
					dryRun: dry_run,
					sourceFilter: source,
					maxSources: max,
				});
				ctx.invalidateSearch();
				return json({
					sourcesCompiled: result.sourcesCompiled,
					articlesCreated: result.articlesCreated,
					articlesUpdated: result.articlesUpdated,
					articlesDeleted: result.articlesDeleted,
					operations: result.operations,
				});
			} catch (e) {
				return err((e as Error).message);
			}
		},
	);

	// ── kib_lint ──────────────────────────────────────────────

	server.tool(
		"kib_lint",
		"Run health checks on the wiki and report issues. No API key needed for checks. Use fix=true to auto-fix fixable issues (requires LLM provider for stale source recompilation).",
		{
			rule: z
				.string()
				.optional()
				.describe(
					"Run only a specific rule: orphan, stale, missing, broken-link, frontmatter, contradiction",
				),
			fix: z
				.boolean()
				.default(false)
				.describe("Auto-fix fixable issues (recompile stale, create missing articles)"),
		},
		async ({ rule, fix }) => {
			try {
				const provider = await ctx.getProvider().catch(() => undefined);
				const result = await lintVault(root, { ruleFilter: rule, provider });

				if (fix) {
					const fixable = result.diagnostics.filter((d) => d.fixable);
					if (fixable.length > 0) {
						let fixProvider: LLMProvider | undefined;
						let config: VaultConfig | undefined;
						const hasStale = fixable.some((d) => d.rule === "stale");
						if (hasStale) {
							try {
								config = await ctx.getConfig();
								fixProvider = await ctx.getProvider();
							} catch {
								// Provider not available — stale fixes will be skipped
							}
						}
						const fixResult = await fixLintIssues(root, result.diagnostics, fixProvider, config);
						ctx.invalidateSearch();
						return json({
							diagnostics: result.diagnostics,
							errors: result.errors,
							warnings: result.warnings,
							infos: result.infos,
							fixed: fixResult.fixed,
							fixSkipped: fixResult.skipped,
							fixErrors: fixResult.errors,
						});
					}
				}

				return json({
					errors: result.errors,
					warnings: result.warnings,
					infos: result.infos,
					diagnostics: result.diagnostics,
				});
			} catch (e) {
				return err((e as Error).message);
			}
		},
	);

	// ── kib_config ────────────────────────────────────────────

	server.tool(
		"kib_config",
		"Get or set vault configuration. No API key needed. Call with no arguments to list all config. Pass key to read a value, pass key+value to set it. Useful keys: provider.default, provider.model.",
		{
			key: z
				.string()
				.optional()
				.describe(
					"Dot-separated config key (e.g. 'provider.default', 'provider.model', 'search.engine')",
				),
			value: z.string().optional().describe("Value to set. Omit to read the current value."),
		},
		async ({ key, value }) => {
			try {
				const config = await loadConfig(root);

				// List all config
				if (!key) {
					return json(config);
				}

				// Get a value
				if (!value) {
					const val = getNestedValue(config, key);
					if (val === undefined) return err(`Unknown config key: ${key}`);
					return json({ [key]: val });
				}

				// Set a value
				const parsed = parseConfigValue(value);
				const updated = setNestedValue(config, key, parsed);
				if (!updated) return err(`Unknown config key: ${key}`);
				await saveConfig(root, config);
				return json({ [key]: parsed, saved: true });
			} catch (e) {
				return err((e as Error).message);
			}
		},
	);

	// ── kib_skill ─────────────────────────��───────────────────

	server.tool(
		"kib_skill",
		"List or run vault skills. Most skills require a configured LLM provider. Skills are reusable operations (summarize, flashcards, connections, etc).",
		{
			action: z
				.enum(["list", "run"])
				.describe("'list' to see available skills, 'run' to execute one"),
			name: z.string().optional().describe("Skill name to run (required when action is 'run')"),
		},
		async ({ action, name }) => {
			try {
				const { loadSkills, findSkill, runSkill } = await import("@kibhq/core");

				if (action === "list") {
					const skills = await loadSkills(root);
					return json(skills.map((s) => ({ name: s.name, description: s.description })));
				}

				// action === "run"
				if (!name) return err("Skill name is required. Use action='list' to see available skills.");

				const skill = await findSkill(root, name);
				if (!skill)
					return err(`Skill "${name}" not found. Use action='list' to see available skills.`);

				let provider: LLMProvider | undefined;
				if (skill.llm?.required) {
					const config = await ctx.getConfig();
					const modelKey = skill.llm.model === "fast" ? "fast_model" : "model";
					const model = config.provider[modelKey as keyof typeof config.provider] as string;
					provider = await createProvider(config.provider.default, model);
				}

				const result = await runSkill(root, skill, { provider });
				return json({ skill: skill.name, content: result.content ?? null });
			} catch (e) {
				return err((e as Error).message);
			}
		},
	);

	// ── kib_export ────────────────────────────────────────────

	server.tool(
		"kib_export",
		"Export the wiki as a clean markdown bundle or static HTML site. No API key needed. Returns the output directory path and file count.",
		{
			format: z
				.enum(["markdown", "html"])
				.default("markdown")
				.describe("Export format: 'markdown' (clean, no frontmatter) or 'html' (static site)"),
			output: z.string().optional().describe("Output directory path. Defaults to <vault>/export"),
		},
		async ({ format, output }) => {
			try {
				const { exportVault } = await import("./export-helper.js");
				const result = await exportVault(root, format, output);
				return json(result);
			} catch (e) {
				return err((e as Error).message);
			}
		},
	);

	// ── Sharing ───────────────────────────────────────────────

	server.tool(
		"kib_share_status",
		"Check if the vault is shared and show sync status (ahead/behind, contributors, remote URL)",
		{},
		async () => {
			try {
				const { isShared, shareStatus } = await import("@kibhq/core");
				if (!isShared(root)) {
					return json({
						shared: false,
						hint: "Run 'kib share <remote-url>' to enable team collaboration",
					});
				}
				const status = await shareStatus(root);
				return json(status);
			} catch (e) {
				return err((e as Error).message);
			}
		},
	);

	server.tool(
		"kib_pull",
		"Pull latest changes from the shared vault remote. Auto-merges manifest conflicts.",
		{},
		async () => {
			try {
				const { isShared, pullVault } = await import("@kibhq/core");
				if (!isShared(root)) return err("Vault is not shared. Run 'kib share <remote-url>' first.");
				const result = await pullVault(root);
				ctx.invalidateSearch();
				return json(result);
			} catch (e) {
				return err((e as Error).message);
			}
		},
	);

	server.tool(
		"kib_push",
		"Commit and push local vault changes to the shared remote.",
		{
			message: z.string().optional().describe("Custom commit message. Auto-generated if omitted."),
		},
		async ({ message }) => {
			try {
				const { isShared, pushVault } = await import("@kibhq/core");
				if (!isShared(root)) return err("Vault is not shared. Run 'kib share <remote-url>' first.");
				const result = await pushVault(root, message);
				return json(result);
			} catch (e) {
				return err((e as Error).message);
			}
		},
	);

	// ── Resources ─────────────────────────────────────────────

	server.resource("wiki-index", "wiki://index", { mimeType: "text/markdown" }, async () => {
		const content = await readIndex(root);
		return {
			contents: [{ uri: "wiki://index", text: content || "(no index yet — run kib compile)" }],
		};
	});

	server.resource("wiki-graph", "wiki://graph", { mimeType: "text/markdown" }, async () => {
		const content = await readGraph(root);
		return {
			contents: [{ uri: "wiki://graph", text: content || "(no graph yet — run kib compile)" }],
		};
	});

	server.resource("wiki-log", "wiki://log", { mimeType: "text/markdown" }, async () => {
		const { readLog } = await import("@kibhq/core");
		const content = await readLog(root);
		return {
			contents: [{ uri: "wiki://log", text: content || "(no activity yet)" }],
		};
	});

	return server;
}

// ─── Config Helpers ─────────────────────────────────────────────

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
	const parts = path.split(".");
	let current: unknown = obj;
	for (const part of parts) {
		if (current == null || typeof current !== "object") return undefined;
		current = (current as Record<string, unknown>)[part];
	}
	return current;
}

function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): boolean {
	const parts = path.split(".");
	let current: unknown = obj;
	for (let i = 0; i < parts.length - 1; i++) {
		if (current == null || typeof current !== "object") return false;
		current = (current as Record<string, unknown>)[parts[i]!];
	}
	const lastKey = parts[parts.length - 1]!;
	if (
		current == null ||
		typeof current !== "object" ||
		!(lastKey in (current as Record<string, unknown>))
	) {
		return false;
	}
	(current as Record<string, unknown>)[lastKey] = value;
	return true;
}

function parseConfigValue(val: string): unknown {
	if (val === "true") return true;
	if (val === "false") return false;
	const num = Number(val);
	if (!Number.isNaN(num) && val.trim() !== "") return num;
	return val;
}

export async function startMcpServer(root: string) {
	const server = createMcpServer(root);
	const transport = new StdioServerTransport();
	await server.connect(transport);
}
