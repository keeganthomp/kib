import { resolveVaultRoot, VaultNotFoundError } from "@kibhq/core";
import * as log from "../ui/logger.js";
import { createSpinner } from "../ui/spinner.js";

interface IngestOpts {
	category?: string;
	tags?: string;
	batch?: boolean;
	json?: boolean;
	dryRun?: boolean;
}

export async function ingest(sources: string[], opts: IngestOpts) {
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

	// Lazy import — don't load ingest machinery for other commands
	const { ingestSource } = await import("@kibhq/core");

	if (!opts.json) {
		log.header("ingesting sources");
	}

	const tags = opts.tags?.split(",").map((t) => t.trim());
	const results: {
		source: string;
		title?: string;
		path?: string;
		wordCount?: number;
		skipped?: boolean;
		skipReason?: string;
		error?: string;
	}[] = [];

	for (const source of sources) {
		const spinner = opts.json ? null : createSpinner(`Ingesting ${source}`);
		spinner?.start();

		try {
			const result = await ingestSource(root, source, {
				category: opts.category,
				tags,
				dryRun: opts.dryRun,
			});

			results.push({
				source,
				title: result.title,
				path: result.path,
				wordCount: result.wordCount,
				skipped: result.skipped,
				skipReason: result.skipReason,
			});

			if (!opts.json) {
				if (result.skipped) {
					spinner?.warn(`Skipped: ${result.skipReason}`);
				} else {
					const suffix = opts.dryRun ? " (dry run)" : "";
					spinner?.succeed(
						`${result.title} → ${result.path} (${result.wordCount.toLocaleString()} words)${suffix}`,
					);
				}
			}
		} catch (err) {
			results.push({ source, error: (err as Error).message });
			if (!opts.json) {
				spinner?.fail(`Failed: ${source}`);
				log.error((err as Error).message);
			}
		}
	}

	if (opts.json) {
		console.log(JSON.stringify(results, null, 2));
		return;
	}

	const ingested = results.filter((r) => !r.skipped && !r.error).length;
	const skipped = results.filter((r) => r.skipped).length;

	log.blank();
	if (ingested > 0) {
		log.success(
			`Ingested ${ingested} source${ingested === 1 ? "" : "s"}${skipped > 0 ? `, skipped ${skipped}` : ""}`,
		);
		if (opts.dryRun) {
			log.dim("(dry run — no files were written)");
		} else {
			log.blank();
			log.dim("run kib compile to update the wiki");
		}
	} else if (skipped > 0) {
		log.dim(`All ${skipped} source${skipped === 1 ? "" : "s"} already ingested`);
	}
	log.blank();
}
