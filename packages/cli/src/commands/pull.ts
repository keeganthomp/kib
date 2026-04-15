import { resolveVaultRoot, VaultNotFoundError } from "@kibhq/core";
import { debug } from "../ui/debug.js";
import * as log from "../ui/logger.js";
import { createSpinner } from "../ui/spinner.js";

interface PullOpts {
	json?: boolean;
}

export async function pull(opts: PullOpts) {
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

	debug(`vault root: ${root}`);

	const spinner = opts.json ? null : createSpinner("Pulling from remote...");
	spinner?.start();

	try {
		const { pullVault } = await import("@kibhq/core");
		const result = await pullVault(root);

		spinner?.stop();

		if (opts.json) {
			console.log(JSON.stringify(result, null, 2));
			return;
		}

		if (!result.updated) {
			log.header("pull");
			log.dim("Already up to date.");
			log.blank();
			return;
		}

		log.header("pull");
		log.success(result.summary);

		if (result.newSources > 0) {
			log.info(`${result.newSources} new source${result.newSources === 1 ? "" : "s"}`);
		}
		if (result.newArticles > 0) {
			log.info(`${result.newArticles} new article${result.newArticles === 1 ? "" : "s"}`);
		}
		if (result.conflicts.length > 0) {
			log.blank();
			log.warn("Unresolved conflicts:");
			for (const file of result.conflicts) {
				log.warn(`  ${file}`);
			}
			log.dim("Resolve these manually, then run kib push.");
		}

		log.blank();
	} catch (err) {
		spinner?.stop();
		log.error((err as Error).message);
		process.exit(1);
	}
}
