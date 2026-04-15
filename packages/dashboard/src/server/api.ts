import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, relative } from "node:path";
import {
	buildLinkGraph,
	compileVault,
	computeStats,
	ingestSource,
	isShared,
	listRaw,
	listWiki,
	pullVault,
	pushVault,
	readRaw,
	readWiki,
	shareStatus,
} from "@kibhq/core";
import type { DashboardContext } from "./context.js";
import { emit, handleEventsStream } from "./events.js";
import { handleQueryStream } from "./stream.js";

function json(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

function error(message: string, status = 400): Response {
	return json({ error: message }, status);
}

let compileAbort: AbortController | null = null;

export async function handleApi(url: URL, req: Request, ctx: DashboardContext): Promise<Response> {
	const path = url.pathname.replace(/^\/api/, "");

	try {
		// GET /api/events — SSE stream for real-time updates
		if (req.method === "GET" && path === "/events") {
			return handleEventsStream();
		}

		// GET /api/status
		if (req.method === "GET" && path === "/status") {
			const manifest = await ctx.getManifest();
			const config = await ctx.getConfig();
			const stats = await computeStats(ctx.root);

			let providerReady = false;
			try {
				await ctx.getProvider();
				providerReady = true;
			} catch {
				// Provider not configured
			}

			// Read API key and truncate for display
			let apiKeyHint: string | null = null;
			try {
				const credsPath = join(homedir(), ".config", "kib", "credentials");
				const creds = readFileSync(credsPath, "utf-8");
				const providerName = config.provider.default;
				const envKey =
					providerName === "anthropic"
						? "ANTHROPIC_API_KEY"
						: providerName === "openai"
							? "OPENAI_API_KEY"
							: null;
				if (envKey) {
					const match = creds.match(new RegExp(`${envKey}=(.+)`));
					if (match?.[1]) {
						const key = match[1].trim();
						apiKeyHint = `${key.slice(0, 10)}...${key.slice(-4)}`;
					}
				}
			} catch {
				// No credentials file or env var
				const envKey =
					config.provider.default === "anthropic"
						? process.env.ANTHROPIC_API_KEY
						: config.provider.default === "openai"
							? process.env.OPENAI_API_KEY
							: null;
				if (envKey) {
					apiKeyHint = `${envKey.slice(0, 10)}...${envKey.slice(-4)}`;
				}
			}

			return json({
				vault: manifest.vault,
				root: ctx.root,
				stats: {
					...manifest.stats,
					...stats,
				},
				provider: {
					name: config.provider.default,
					model: config.provider.model,
					ready: providerReady,
					apiKeyHint,
				},
			});
		}

		// GET /api/articles?scope=wiki|raw
		if (req.method === "GET" && path === "/articles") {
			const scope = url.searchParams.get("scope") ?? "wiki";
			const manifest = await ctx.getManifest();

			if (scope === "raw") {
				const files = await listRaw(ctx.root);
				const rawDir = join(ctx.root, "raw");
				const items = files.map((f) => {
					const rel = relative(rawDir, f);
					const sourceId = Object.keys(manifest.sources).find((id) => {
						const s = manifest.sources[id];
						return s && (f.endsWith(id) || rel === id || f.includes(id.replace(/\.md$/, "")));
					});
					const meta = sourceId ? manifest.sources[sourceId] : undefined;
					return {
						path: rel,
						title: meta?.metadata?.title ?? rel.replace(/\.md$/, ""),
						sourceType: meta?.sourceType,
						ingestedAt: meta?.ingestedAt,
						wordCount: meta?.metadata?.wordCount,
					};
				});
				return json(items);
			}

			const files = await listWiki(ctx.root);
			const wikiDir = join(ctx.root, "wiki");
			const items = files
				.filter((f) => !f.endsWith("INDEX.md") && !f.endsWith("GRAPH.md") && !f.endsWith("LOG.md"))
				.map((f) => {
					const rel = relative(wikiDir, f);
					const slug = rel.replace(/\.md$/, "").split("/").pop() ?? rel;
					const meta = manifest.articles[slug];
					return {
						path: rel,
						slug,
						title: meta?.summary ? slug : slug,
						category: meta?.category ?? "topic",
						tags: meta?.tags ?? [],
						summary: meta?.summary ?? "",
						wordCount: meta?.wordCount ?? 0,
						lastUpdated: meta?.lastUpdated,
					};
				});
			return json(items);
		}

		// GET /api/articles/* — read a single file
		if (req.method === "GET" && path.startsWith("/articles/")) {
			const filePath = path.replace("/articles/", "");
			const scope = url.searchParams.get("scope") ?? "wiki";

			const content =
				scope === "raw" ? await readRaw(ctx.root, filePath) : await readWiki(ctx.root, filePath);
			return json({ path: filePath, content });
		}

		// GET /api/search?q=...&limit=...&tag=...&since=...
		if (req.method === "GET" && path === "/search") {
			const q = url.searchParams.get("q");
			if (!q) return error("Missing query parameter: q");

			const limit = Number.parseInt(url.searchParams.get("limit") ?? "20", 10);
			const tag = url.searchParams.get("tag") ?? undefined;
			const since = url.searchParams.get("since") ?? undefined;
			const scope = (url.searchParams.get("scope") as "wiki" | "raw" | "all") ?? "all";

			const index = await ctx.getSearchIndex();
			const results = index.search(q, { limit, tag, since, scope });

			const wikiDir = join(ctx.root, "wiki");
			const rawDir = join(ctx.root, "raw");
			const items = results.map((r) => ({
				...r,
				path: r.path.startsWith(wikiDir)
					? relative(wikiDir, r.path)
					: r.path.startsWith(rawDir)
						? relative(rawDir, r.path)
						: r.path,
				scope: r.path.startsWith(wikiDir) ? "wiki" : "raw",
			}));
			return json(items);
		}

		// POST /api/query — SSE streaming
		if (req.method === "POST" && path === "/query") {
			const body = (await req.json()) as {
				question: string;
				maxArticles?: number;
				source?: string;
			};
			if (!body.question) return error("Missing field: question");
			return handleQueryStream(ctx, body);
		}

		// POST /api/ingest
		if (req.method === "POST" && path === "/ingest") {
			const body = (await req.json()) as { url?: string; content?: string; title?: string };
			const source = body.url ?? body.content;
			if (!source) return error("Missing field: url or content");

			const result = await ingestSource(ctx.root, source, {
				tags: [],
			});
			ctx.invalidateSearch();
			if (!result.skipped) {
				emit({ type: "ingest", sourceId: result.sourceId, title: result.title });
			}
			return json(result);
		}

		// POST /api/compile — runs in background, streams progress via SSE events
		if (req.method === "POST" && path === "/compile") {
			if (compileAbort) return error("Compile already running", 409);

			const provider = await ctx.getProvider();
			const config = await ctx.getConfig();
			const body = (await req.json().catch(() => ({}))) as { force?: boolean };

			compileAbort = new AbortController();
			emit({ type: "compile_started" });

			compileVault(ctx.root, provider, config, {
				force: body.force ?? false,
				signal: compileAbort.signal,
				onProgress: (msg) => emit({ type: "compile_progress", message: msg }),
				onArticle: (event) => emit({ type: "compile_article", op: event.op, title: event.title }),
			})
				.then((result) => {
					ctx.invalidateSearch();
					emit({
						type: "compile_done",
						articlesCreated: result.articlesCreated,
						articlesUpdated: result.articlesUpdated,
						sourcesCompiled: result.sourcesCompiled,
					});
				})
				.catch((err) => {
					emit({ type: "compile_error", message: (err as Error).message });
				})
				.finally(() => {
					compileAbort = null;
				});

			return json({ started: true });
		}

		// POST /api/compile/stop
		if (req.method === "POST" && path === "/compile/stop") {
			if (!compileAbort) return json({ stopped: false, reason: "No compile running" });
			compileAbort.abort();
			compileAbort = null;
			emit({ type: "compile_done", articlesCreated: 0, articlesUpdated: 0, sourcesCompiled: 0 });
			return json({ stopped: true });
		}

		// GET /api/graph
		if (req.method === "GET" && path === "/graph") {
			const manifest = await ctx.getManifest();
			const graph = await buildLinkGraph(ctx.root);

			const nodes = [...new Set([...graph.forwardLinks.keys(), ...graph.backlinks.keys()])].map(
				(slug) => {
					const meta = manifest.articles[slug];
					return {
						id: slug,
						category: meta?.category ?? "topic",
						tags: meta?.tags ?? [],
						wordCount: meta?.wordCount ?? 0,
						summary: meta?.summary ?? "",
					};
				},
			);

			const edges: { source: string; target: string }[] = [];
			for (const [slug, targets] of graph.forwardLinks) {
				for (const target of targets) {
					edges.push({ source: slug, target });
				}
			}

			return json({ nodes, edges });
		}

		// GET /api/share/status
		if (req.method === "GET" && path === "/share/status") {
			if (!isShared(ctx.root)) {
				return json({ shared: false, ahead: 0, behind: 0, dirty: false, contributors: [] });
			}
			const status = await shareStatus(ctx.root);
			return json(status);
		}

		// POST /api/share/pull
		if (req.method === "POST" && path === "/share/pull") {
			if (!isShared(ctx.root)) return error("Vault is not shared", 400);
			const result = await pullVault(ctx.root);
			if (result.updated) {
				ctx.invalidateSearch();
				emit({ type: "search_invalidated" });
			}
			return json(result);
		}

		// POST /api/share/push
		if (req.method === "POST" && path === "/share/push") {
			if (!isShared(ctx.root)) return error("Vault is not shared", 400);
			const body = (await req.json().catch(() => ({}))) as { message?: string };
			const result = await pushVault(ctx.root, body.message);
			return json(result);
		}

		return error("Not found", 404);
	} catch (err) {
		console.error("API error:", err);
		return error((err as Error).message, 500);
	}
}
