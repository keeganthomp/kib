import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { LLMProvider } from "@kibhq/core";
import {
	createProvider,
	loadConfig,
	NoProviderError,
	resolveVaultRoot,
	VaultNotFoundError,
} from "@kibhq/core";
import { debug, debugTime } from "../ui/debug.js";
import { coloredDiff } from "../ui/diff.js";
import * as log from "../ui/logger.js";
import { setupProvider } from "../ui/setup-provider.js";
import { createSpinner } from "../ui/spinner.js";

interface CompileOpts {
	force?: boolean;
	dryRun?: boolean;
	source?: string;
	max?: number;
	json?: boolean;
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

	const endLoadConfig = debugTime("loadConfig");
	const config = await loadConfig(root);
	endLoadConfig();

	debug(`vault root: ${root}`);
	debug(`provider: ${config.provider.default}, model: ${config.provider.model}`);
	if (opts.force) debug("force recompile enabled");
	if (opts.dryRun) debug("dry run enabled");
	if (opts.source) debug(`source filter: ${opts.source}`);
	if (opts.max) debug(`max sources: ${opts.max}`);

	if (!opts.json) {
		log.header("compiling wiki");
	}

	// Create LLM provider
	let provider: LLMProvider;
	const providerSpinner = opts.json ? null : createSpinner("Connecting to LLM provider...");
	providerSpinner?.start();
	const endProvider = debugTime("createProvider");
	try {
		const compileModel = config.compile.model ?? config.provider.model;
		provider = await createProvider(config.provider.default, compileModel);
		endProvider();
		providerSpinner?.succeed(`Connected to ${provider.name}`);
	} catch (err) {
		providerSpinner?.stop();
		if (err instanceof NoProviderError) {
			provider = await setupProvider(root);
		} else {
			log.error((err as Error).message);
			process.exit(1);
		}
	}

	// Lazy import compile engine
	const { compileVault } = await import("@kibhq/core");

	const compileSpinner = opts.json ? null : createSpinner("Compiling sources...");
	compileSpinner?.start();
	const endCompile = debugTime("compileVault");

	try {
		const result = await compileVault(root, provider, config, {
			force: opts.force,
			dryRun: opts.dryRun,
			sourceFilter: opts.source,
			maxSources: opts.max,
			onProgress: (msg) => {
				if (compileSpinner) compileSpinner.text = `  ${msg}`;
			},
		});

		endCompile();
		debug(`compiled ${result.sourcesCompiled} sources, ${result.operations.length} operations`);

		if (opts.json) {
			console.log(JSON.stringify(result, null, 2));
			return;
		}

		if (result.sourcesCompiled === 0) {
			compileSpinner?.info("No sources pending compilation");
			log.blank();
			log.dim("Use --force to recompile all sources");
			log.blank();
			return;
		}

		compileSpinner?.succeed(
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
		const articlesEnriched =
			"articlesEnriched" in result && typeof result.articlesEnriched === "number"
				? result.articlesEnriched
				: 0;
		if (articlesEnriched > 0) {
			log.success(
				`${articlesEnriched} article${articlesEnriched === 1 ? "" : "s"} enriched with cross-references`,
			);
		}

		// Show token usage
		if (result.tokenUsage) {
			const { totalInputTokens, totalOutputTokens, perSource } = result.tokenUsage;
			const cachedCount = perSource.filter((s) => s.cached).length;
			const parts = [`${totalInputTokens + totalOutputTokens} tokens used`];
			parts.push(`${totalInputTokens} in / ${totalOutputTokens} out`);
			if (cachedCount > 0) parts.push(`${cachedCount} cache hit${cachedCount === 1 ? "" : "s"}`);
			log.dim(parts.join(" · "));
		}

		// Show warnings
		if (result.warnings && result.warnings.length > 0) {
			log.blank();
			for (const warning of result.warnings) {
				log.warn(warning);
			}
		}

		if (opts.dryRun) {
			log.blank();
			log.dim("(dry run — no files were written)");

			if (result.operations.length > 0) {
				log.blank();
				for (const op of result.operations) {
					const symbol = op.op === "create" ? "+" : op.op === "update" ? "~" : "-";
					log.info(`${symbol} ${op.path}`);

					if (op.content) {
						if (op.op === "update") {
							// Show colored diff for updates
							try {
								const oldContent = await readFile(join(root, op.path), "utf-8");
								const diff = coloredDiff(oldContent, op.content, op.path);
								if (diff) {
									console.log(diff);
									log.blank();
								}
							} catch {
								// File might not exist yet, show as create
							}
						} else if (op.op === "create") {
							// Show new content preview for creates
							const diff = coloredDiff("", op.content, op.path);
							if (diff) {
								console.log(diff);
								log.blank();
							}
						}
					}
				}
			}
		}

		log.blank();
	} catch (err) {
		compileSpinner?.fail("Compilation failed");
		log.error((err as Error).message);
		process.exit(1);
	}
}
