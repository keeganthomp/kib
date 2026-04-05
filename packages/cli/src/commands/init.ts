import { resolve } from "node:path";
import {
	VaultExistsError,
	detectProvider,
	initVault,
} from "@kib/core";
import * as log from "../ui/logger.js";

interface InitOpts {
	name?: string;
	provider?: string;
	force?: boolean;
}

export async function init(opts: InitOpts) {
	const cwd = resolve(process.cwd());

	log.header("initializing vault");

	try {
		// Detect provider
		const detected = detectProvider();
		const provider = opts.provider ?? detected.name;
		const model = detected.model;

		const { root, manifest } = await initVault(cwd, {
			name: opts.name,
			provider,
			model,
			force: opts.force,
		});

		log.success("Created .kb/manifest.json");
		log.success("Created .kb/config.toml");
		log.success("Created raw/");
		log.success("Created wiki/");
		log.success("Created inbox/");

		const providerLabel =
			provider === "anthropic"
				? `anthropic (ANTHROPIC_API_KEY)`
				: provider === "openai"
					? `openai (OPENAI_API_KEY)`
					: `ollama (localhost:11434)`;

		log.success(`Detected provider: ${providerLabel}`);
		log.success(`Model: ${model}`);
		log.blank();
		log.dim(`vault ready — start with kib ingest <source>`);
		log.blank();
	} catch (err) {
		if (err instanceof VaultExistsError) {
			log.error(err.message);
			process.exit(1);
		}
		throw err;
	}
}
