import { resolveVaultRoot, VaultNotFoundError } from "@kibhq/core";
import * as log from "../ui/logger.js";
import { createSpinner } from "../ui/spinner.js";

interface IngestOpts {
	category?: string;
	tags?: string;
	batch?: boolean;
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

	log.header("ingesting sources");

	const tags = opts.tags?.split(",").map((t) => t.trim());
	let ingested = 0;
	let skipped = 0;

	for (const source of sources) {
		const spinner = createSpinner(`Ingesting ${source}`);
		spinner.start();

		try {
			const result = await ingestSource(root, source, {
				category: opts.category,
				tags,
			});

			if (result.skipped) {
				spinner.warn(`Skipped: ${result.skipReason}`);
				skipped++;
			} else {
				spinner.succeed(
					`${result.title} → ${result.path} (${result.wordCount.toLocaleString()} words)`,
				);
				ingested++;
			}
		} catch (err) {
			spinner.fail(`Failed: ${source}`);
			log.error((err as Error).message);
		}
	}

	log.blank();
	if (ingested > 0) {
		log.success(
			`Ingested ${ingested} source${ingested === 1 ? "" : "s"}${skipped > 0 ? `, skipped ${skipped}` : ""}`,
		);
		log.blank();
		log.dim("run kib compile to update the wiki");
	} else if (skipped > 0) {
		log.dim(`All ${skipped} source${skipped === 1 ? "" : "s"} already ingested`);
	}
	log.blank();
}
