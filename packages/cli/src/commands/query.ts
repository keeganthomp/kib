import type { LLMProvider } from "@kibhq/core";
import {
	createProvider,
	loadConfig,
	NoProviderError,
	resolveVaultRoot,
	VaultNotFoundError,
} from "@kibhq/core";
import { debug, debugTime } from "../ui/debug.js";
import * as log from "../ui/logger.js";
import { setupProvider } from "../ui/setup-provider.js";
import { createSpinner } from "../ui/spinner.js";

interface QueryOpts {
	file?: boolean;
	sources?: boolean;
	json?: boolean;
}

export async function query(question: string, opts: QueryOpts) {
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

	const config = await loadConfig(root);

	// Create provider
	let provider: LLMProvider;
	try {
		provider = await createProvider(config.provider.default, config.provider.model);
	} catch (err) {
		if (err instanceof NoProviderError) {
			provider = await setupProvider(root);
		} else {
			log.error((err as Error).message);
			process.exit(1);
		}
	}

	const { queryVault } = await import("@kibhq/core");

	debug(`vault root: ${root}`);
	debug(`provider: ${config.provider.default}, model: ${config.provider.model}`);
	debug(`question: "${question}"`);

	log.header("querying knowledge base");

	const spinner = createSpinner("Searching and generating answer...");
	spinner.start();
	const endQuery = debugTime("queryVault");

	try {
		const autoFile = opts.file !== false && config.query.auto_file;
		const result = await queryVault(root, question, provider, {
			autoFile,
			autoFileThreshold: config.query.auto_file_threshold,
		});
		endQuery();
		debug(`sources used: ${result.sourcePaths.length}`);
		spinner.stop();

		// Print answer
		console.log();
		console.log(result.answer);
		console.log();

		// Print sources if requested
		if (opts.sources && result.sourcePaths.length > 0) {
			log.dim("Sources:");
			for (const path of result.sourcePaths) {
				log.dim(`  - ${path}`);
			}
			log.blank();
		}

		if (result.filedTo) {
			log.dim(`Auto-filed to ${result.filedTo}`);
			log.blank();
		}

		if (opts.json) {
			console.log(JSON.stringify(result, null, 2));
		}
	} catch (err) {
		spinner.fail("Query failed");
		log.error((err as Error).message);
		process.exit(1);
	}
}
