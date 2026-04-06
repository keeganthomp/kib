import type { LLMProvider } from "@kibhq/core";
import {
	createProvider,
	loadConfig,
	NoProviderError,
	resolveVaultRoot,
	VaultNotFoundError,
} from "@kibhq/core";
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

	log.header("querying knowledge base");

	const spinner = createSpinner("Searching and generating answer...");
	spinner.start();

	try {
		const result = await queryVault(root, question, provider);
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

		if (opts.json) {
			console.log(JSON.stringify(result, null, 2));
		}
	} catch (err) {
		spinner.fail("Query failed");
		log.error((err as Error).message);
		process.exit(1);
	}
}
