import {
	compileVault,
	createProvider,
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
		"Get vault status: source count, article count, provider, and config",
		{},
		async () => {
			try {
				const manifest = await ctx.getManifest();
				const config = await ctx.getConfig();
				return json({
					name: manifest.vault.name,
					provider: config.provider.default,
					model: config.provider.model,
					totalSources: manifest.stats.totalSources,
					totalArticles: manifest.stats.totalArticles,
					totalWords: manifest.stats.totalWords,
					lastCompiled: manifest.vault.lastCompiled,
					lastLint: manifest.stats.lastLintAt,
				});
			} catch (e) {
				return err((e as Error).message);
			}
		},
	);

	// ── kib_list ──────────────────────────────────────────────

	server.tool(
		"kib_list",
		"List all wiki articles or raw sources in the knowledge base",
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

	// ── kib_read ──────────────────────────────────────────────

	server.tool(
		"kib_read",
		"Read a specific wiki article or raw source from the knowledge base",
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
		"Search the knowledge base using full-text BM25 search",
		{
			query: z.string().describe("Search query"),
			limit: z.number().int().positive().max(50).default(10).describe("Max results"),
		},
		async ({ query, limit }) => {
			try {
				const index = await ctx.getSearchIndex();
				const results = index.search(query, { limit });
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
		"Ask a question against the knowledge base using RAG (retrieval-augmented generation)",
		{
			question: z.string().describe("Question to ask"),
			max_articles: z
				.number()
				.int()
				.positive()
				.max(10)
				.default(5)
				.describe("Max articles to use as context"),
		},
		async ({ question, max_articles }) => {
			try {
				const provider = await ctx.getProvider();
				const result = await queryVault(root, question, provider, {
					maxArticles: max_articles,
				});
				return ok(`${result.answer}\n\n---\nSources: ${result.sourcePaths.join(", ") || "none"}`);
			} catch (e) {
				return err((e as Error).message);
			}
		},
	);

	// ── kib_ingest ────────────────────────────────────────────

	server.tool(
		"kib_ingest",
		"Ingest a source (URL or file path) into the knowledge base",
		{
			source: z.string().describe("URL or file path to ingest"),
			category: z
				.string()
				.optional()
				.describe("Raw subdirectory override (e.g. 'papers', 'articles')"),
			tags: z.string().optional().describe("Comma-separated tags"),
		},
		async ({ source, category, tags }) => {
			try {
				const result = await ingestSource(root, source, {
					category,
					tags: tags?.split(",").map((t) => t.trim()),
				});
				ctx.invalidateSearch();
				return json({
					path: result.path,
					title: result.title,
					wordCount: result.wordCount,
					skipped: result.skipped,
					skipReason: result.skipReason,
				});
			} catch (e) {
				return err((e as Error).message);
			}
		},
	);

	// ── kib_compile ───────────────────────────────────────────

	server.tool(
		"kib_compile",
		"Compile pending raw sources into wiki articles using the configured LLM",
		{
			force: z.boolean().default(false).describe("Recompile all sources"),
			source: z.string().optional().describe("Compile only a specific source"),
			dry_run: z.boolean().default(false).describe("Preview without writing"),
		},
		async ({ force, source, dry_run }) => {
			try {
				const provider = await ctx.getProvider();
				const config = await ctx.getConfig();
				const result = await compileVault(root, provider, config, {
					force,
					dryRun: dry_run,
					sourceFilter: source,
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
		"Run health checks on the wiki and report issues",
		{
			rule: z
				.string()
				.optional()
				.describe("Run only a specific rule: orphan, stale, missing, broken-link, frontmatter"),
		},
		async ({ rule }) => {
			try {
				const result = await lintVault(root, { ruleFilter: rule });
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

	return server;
}

export async function startMcpServer(root: string) {
	const server = createMcpServer(root);
	const transport = new StdioServerTransport();
	await server.connect(transport);
}
