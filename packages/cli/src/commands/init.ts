import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { detectProvider, initVault, VaultExistsError } from "@kibhq/core";
import * as log from "../ui/logger.js";
import { setupMcp } from "./mcp.js";

const DEFAULT_VAULT = join(homedir(), ".kib");

interface InitOpts {
	name?: string;
	provider?: string;
	force?: boolean;
}

export async function init(dir: string | undefined, opts: InitOpts) {
	const target = resolve(dir ?? DEFAULT_VAULT);

	log.header("initializing vault");

	try {
		// Detect provider
		const detected = detectProvider();
		const provider = opts.provider ?? detected.name;
		const model = detected.model;

		await initVault(target, {
			name: opts.name,
			provider,
			model,
			force: opts.force,
		});

		log.success(`Vault created at ${target}`);
		log.success("Created .kb/manifest.json");
		log.success("Created .kb/config.toml");
		log.success("Created raw/");
		log.success("Created wiki/");
		log.success("Created inbox/");
		log.success("Created CLAUDE.md");

		const hasKey =
			(provider === "anthropic" && !!process.env.ANTHROPIC_API_KEY) ||
			(provider === "openai" && !!process.env.OPENAI_API_KEY);

		const providerLabel =
			provider === "anthropic"
				? `anthropic (ANTHROPIC_API_KEY${hasKey ? "" : " — not set yet"})`
				: provider === "openai"
					? `openai (OPENAI_API_KEY${hasKey ? "" : " — not set yet"})`
					: `ollama (localhost:11434)`;

		log.success(`Provider: ${providerLabel}`);
		log.success(`Model: ${model}`);

		if (!hasKey && provider !== "ollama") {
			const envKey = provider === "anthropic" ? "ANTHROPIC_API_KEY" : "OPENAI_API_KEY";
			log.blank();
			log.warn(
				`Set ${envKey} to enable compile and query. Ingest, search, and read work without it.`,
			);
		}

		// Auto-configure MCP in all detected AI clients
		log.blank();
		log.header("configuring MCP clients");
		await setupMcp(target);

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
