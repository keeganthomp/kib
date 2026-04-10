import { resolve } from "node:path";
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
	source?: string;
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
		const queryModel = config.query.model ?? config.provider.model;
		provider = await createProvider(config.provider.default, queryModel);
	} catch (err) {
		if (err instanceof NoProviderError) {
			provider = await setupProvider(root);
		} else {
			log.error((err as Error).message);
			process.exit(1);
		}
	}

	const { queryVault } = await import("@kibhq/core");

	// Resolve --source path to absolute
	const sourcePath = opts.source ? resolve(opts.source) : undefined;

	debug(`vault root: ${root}`);
	debug(`provider: ${config.provider.default}, model: ${config.provider.model}`);
	debug(`question: "${question}"`);
	if (sourcePath) debug(`source: ${sourcePath}`);

	log.header(sourcePath ? "querying source" : "querying knowledge base");

	const spinner = createSpinner(
		sourcePath ? "Reading source and generating answer..." : "Searching and generating answer...",
	);
	spinner.start();
	const endQuery = debugTime("queryVault");

	try {
		const autoFile = opts.file !== false && config.query.auto_file;
		const result = await queryVault(root, question, provider, {
			autoFile,
			autoFileThreshold: config.query.auto_file_threshold,
			source: sourcePath,
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
