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

interface CompileOpts {
	force?: boolean;
	dryRun?: boolean;
	source?: string;
	max?: number;
}

export async function compile(opts: CompileOpts) {
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

	log.header("compiling wiki");

	// Create LLM provider
	let provider;
	const providerSpinner = createSpinner("Connecting to LLM provider...");
	providerSpinner.start();
	try {
		provider = await createProvider(config.provider.default, config.provider.model);
		providerSpinner.succeed(`Connected to ${provider.name}`);
	} catch (err) {
		providerSpinner.stop();
		if (err instanceof NoProviderError) {
			provider = await setupProvider(root);
		} else {
			log.error((err as Error).message);
			process.exit(1);
		}
	}

	// Lazy import compile engine
	const { compileVault } = await import("@kibhq/core");

	const compileSpinner = createSpinner("Compiling sources...");
	compileSpinner.start();

	try {
		const result = await compileVault(root, provider, config, {
			force: opts.force,
			dryRun: opts.dryRun,
			sourceFilter: opts.source,
			maxSources: opts.max,
			onProgress: (msg) => {
				compileSpinner.text = `  ${msg}`;
			},
		});

		if (result.sourcesCompiled === 0) {
			compileSpinner.info("No sources pending compilation");
			log.blank();
			log.dim("Use --force to recompile all sources");
			log.blank();
			return;
		}

		compileSpinner.succeed(
			`Compiled ${result.sourcesCompiled} source${result.sourcesCompiled === 1 ? "" : "s"}`,
		);

		log.blank();
		if (result.articlesCreated > 0) {
			log.success(
				`${result.articlesCreated} article${result.articlesCreated === 1 ? "" : "s"} created`,
			);
		}
		if (result.articlesUpdated > 0) {
			log.success(
				`${result.articlesUpdated} article${result.articlesUpdated === 1 ? "" : "s"} updated`,
			);
		}
		if (result.articlesDeleted > 0) {
			log.info(
				`${result.articlesDeleted} article${result.articlesDeleted === 1 ? "" : "s"} deleted`,
			);
		}

		if (opts.dryRun) {
			log.blank();
			log.dim("(dry run — no files were written)");

			if (result.operations.length > 0) {
				log.blank();
				for (const op of result.operations) {
					const symbol = op.op === "create" ? "+" : op.op === "update" ? "~" : "-";
					log.info(`${symbol} ${op.path}`);
				}
			}
		}

		log.blank();
	} catch (err) {
		compileSpinner.fail("Compilation failed");
		log.error((err as Error).message);
		process.exit(1);
	}
}
