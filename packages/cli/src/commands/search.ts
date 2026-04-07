import type { SearchResult } from "@kibhq/core";
import { resolveVaultRoot, VaultNotFoundError } from "@kibhq/core";
import { debug, debugTime } from "../ui/debug.js";
import * as log from "../ui/logger.js";
import { createSpinner } from "../ui/spinner.js";

interface SearchOpts {
	wiki?: boolean;
	raw?: boolean;
	limit?: number;
	json?: boolean;
	engine?: "builtin" | "vector" | "hybrid";
}

export async function search(term: string, opts: SearchOpts) {
	let root: string;
	try {
		root = resolveVaultRoot();
	} catch (err) {
		if (err instanceof VaultNotFoundError) {
			log.error(err.message);
			process.exit(1);
		}
		throw err;
	}

	const { SearchIndex, HybridSearch, VectorIndex, loadConfig, createProvider } = await import(
		"@kibhq/core"
	);

	const scope = opts.wiki ? "wiki" : opts.raw ? "raw" : "all";
	const limit = opts.limit ?? 20;

	// Determine search engine
	let engine = opts.engine;
	if (!engine) {
		try {
			const config = await loadConfig(root);
			engine = config.search.engine;
		} catch {
			engine = "builtin";
		}
	}

	debug(`vault root: ${root}`);
	debug(`scope: ${scope}, limit: ${limit}, engine: ${engine}, term: "${term}"`);

	const spinner = createSpinner("Searching...");
	spinner.start();

	let results: SearchResult[];
	let elapsed: number;

	if (engine === "hybrid" || engine === "vector") {
		const endIndex = debugTime("load/build hybrid index");
		const bm25 = new SearchIndex();
		const vector = new VectorIndex();
		const hybrid = new HybridSearch(bm25, vector);
		const loaded = await hybrid.load(root);

		let provider: Awaited<ReturnType<typeof createProvider>> | null = null;
		try {
			provider = await createProvider();
		} catch {
			log.warn("No embedding provider available, falling back to BM25");
			engine = "builtin";
		}

		if (provider && (engine === "hybrid" || engine === "vector")) {
			if (!loaded.bm25) {
				debug("no cached index, building...");
				spinner.text = "  Building search index...";
				await hybrid.build(root, provider, scope);
				await hybrid.save(root);
			} else if (!loaded.vector && provider.embed) {
				debug("no vector index, building embeddings...");
				spinner.text = "  Building vector index...";
				await vector.build(root, provider, scope);
				await vector.save(root);
			}
			endIndex();

			const start = performance.now();
			results = await hybrid.search(term, provider, { limit });
			elapsed = Math.round(performance.now() - start);
		} else {
			endIndex();
			// Fallback path
			const index = new SearchIndex();
			const bm25Loaded = await index.load(root);
			if (!bm25Loaded) {
				spinner.text = "  Building search index...";
				await index.build(root, scope);
				await index.save(root);
			}
			const start = performance.now();
			results = index.search(term, { limit });
			elapsed = Math.round(performance.now() - start);
		}
	} else {
		const index = new SearchIndex();
		const endIndex = debugTime("load/build index");
		const loaded = await index.load(root);
		if (!loaded) {
			debug("no cached index, building...");
			spinner.text = "  Building search index...";
			await index.build(root, scope);
			await index.save(root);
		} else {
			debug("loaded cached index");
		}
		endIndex();

		const start = performance.now();
		results = index.search(term, { limit });
		elapsed = Math.round(performance.now() - start);
	}

	spinner.stop();

	if (opts.json) {
		console.log(JSON.stringify(results, null, 2));
		return;
	}

	log.header("searching vault");

	if (results.length === 0) {
		log.dim(`No results for "${term}"`);
		log.blank();
		return;
	}

	console.log(`  ${results.length} result${results.length === 1 ? "" : "s"} (${elapsed}ms):`);
	log.blank();

	for (let i = 0; i < results.length; i++) {
		const r = results[i]!;
		const num = String(i + 1).padStart(2);
		const title = r.title ?? r.path.split("/").pop()?.replace(/\.md$/, "") ?? r.path;
		const score = r.score.toFixed(2).padStart(5);

		console.log(`  ${num}. ${title}  ${score}`);
		console.log(`      ${dimPath(r.path)}`);
		if (r.snippet) {
			console.log(`      ${truncate(r.snippet, 80)}`);
		}
		console.log();
	}
}

function dimPath(path: string): string {
	// Import chalk dynamically to keep lazy loading
	return `\x1b[2m${path}\x1b[0m`;
}

function truncate(str: string, max: number): string {
	if (str.length <= max) return str;
	return `${str.slice(0, max - 3)}...`;
}
