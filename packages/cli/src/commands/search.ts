import {
	VaultNotFoundError,
	resolveVaultRoot,
} from "@kib/core";
import * as log from "../ui/logger.js";
import { createSpinner } from "../ui/spinner.js";

interface SearchOpts {
	wiki?: boolean;
	raw?: boolean;
	limit?: number;
	json?: boolean;
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

	const { SearchIndex } = await import("@kib/core/src/search/engine.js");

	const scope = opts.wiki ? "wiki" : opts.raw ? "raw" : "all";
	const limit = opts.limit ?? 20;

	const spinner = createSpinner("Searching...");
	spinner.start();

	const index = new SearchIndex();

	// Try to load cached index first
	const loaded = await index.load(root);
	if (!loaded) {
		spinner.text = "  Building search index...";
		await index.build(root, scope);
		await index.save(root);
	}

	const start = performance.now();
	const results = index.search(term, { limit });
	const elapsed = Math.round(performance.now() - start);

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
