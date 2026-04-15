import { resolveVaultRoot, ShareError, VaultNotFoundError } from "@kibhq/core";
import { debug } from "../ui/debug.js";
import * as log from "../ui/logger.js";
import { createSpinner } from "../ui/spinner.js";

interface PushOpts {
	message?: string;
	json?: boolean;
}

export async function push(opts: PushOpts) {
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

	const spinner = opts.json ? null : createSpinner("Pushing to remote...");
	spinner?.start();

	try {
		const { pushVault } = await import("@kibhq/core");
		const result = await pushVault(root, opts.message);

		spinner?.stop();

		if (opts.json) {
			console.log(JSON.stringify(result, null, 2));
			return;
		}

		log.header("push");

		if (!result.pushed) {
			log.dim("Nothing to push — vault is clean.");
			log.blank();
			return;
		}

		log.success(
			`Pushed ${result.filesChanged} file${result.filesChanged === 1 ? "" : "s"} (${result.commit})`,
		);
		log.blank();
	} catch (err) {
		spinner?.stop();
		if (err instanceof ShareError) {
			log.error(err.message);
			log.blank();
			log.dim(err.hint);
			log.blank();
		} else {
			log.error((err as Error).message);
		}
		process.exit(1);
	}
}
