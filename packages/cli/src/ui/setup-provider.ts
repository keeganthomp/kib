import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { LLMProvider } from "@kibhq/core";
import { createProvider, loadConfig, saveConfig } from "@kibhq/core";
import chalk from "chalk";
import * as log from "./logger.js";
import { input, select } from "./prompt.js";

const CREDENTIALS_DIR = join(homedir(), ".config", "kib");
const CREDENTIALS_FILE = join(CREDENTIALS_DIR, "credentials");

const PROVIDERS = [
	{
		name: "anthropic",
		label: "Anthropic",
		hint: "Claude — recommended",
		envKey: "ANTHROPIC_API_KEY",
		keyPrefix: "sk-ant-",
		keyUrl: "https://console.anthropic.com/settings/keys",
	},
	{
		name: "openai",
		label: "OpenAI",
		hint: "GPT-4o",
		envKey: "OPENAI_API_KEY",
		keyPrefix: "sk-",
		keyUrl: "https://platform.openai.com/api-keys",
	},
	{
		name: "ollama",
		label: "Ollama",
		hint: "local models, no API key needed",
		envKey: null,
		keyPrefix: null,
		keyUrl: null,
	},
] as const;

/**
 * Interactive setup flow when no LLM provider is configured.
 * Guides user through provider selection + API key entry.
 * Returns a connected provider ready to use.
 */
export async function setupProvider(root: string): Promise<LLMProvider> {
	console.log();
	log.dim("kib needs an LLM to compile your sources into wiki articles.");
	log.dim("Let's set that up.\n");

	// 1. Select provider
	const providerIndex = await select(
		"Which provider?",
		PROVIDERS.map((p) => ({
			label: p.label,
			hint: p.hint,
		})),
	);
	const provider = PROVIDERS[providerIndex];

	console.log();

	// 2. Handle Ollama (no API key, just check if running)
	if (provider.name === "ollama") {
		return await setupOllama(root);
	}

	// 3. For API key providers, prompt for the key
	log.dim(`Get your API key at: ${chalk.underline(provider.keyUrl)}`);
	console.log();

	const key = await input(`${provider.label} API key:`, { mask: true });

	if (!key) {
		log.error("No API key entered.");
		process.exit(1);
	}

	// 4. Set in current process
	process.env[provider.envKey] = key;

	// 5. Save to credentials file
	await saveCredential(provider.envKey, key);

	// 6. Update vault config
	const config = await loadConfig(root);
	config.provider.default = provider.name;
	await saveConfig(root, config);

	// 7. Test connection
	console.log();
	try {
		const llm = await createProvider(config.provider.default, config.provider.model);
		log.success(`Connected to ${llm.name}`);
		log.success(`Saved to ${chalk.dim("~/.config/kib/credentials")}`);
		console.log();
		return llm;
	} catch {
		log.error("Could not connect — check your API key and try again.");
		process.exit(1);
	}
}

async function setupOllama(root: string): Promise<LLMProvider> {
	log.dim("Checking if Ollama is running...");
	console.log();

	try {
		const res = await fetch("http://localhost:11434/api/tags");
		if (!res.ok) throw new Error();
	} catch {
		log.error("Ollama is not running.");
		log.dim("Start it with: ollama serve");
		log.dim("Then run this command again.");
		process.exit(1);
	}

	const config = await loadConfig(root);
	config.provider.default = "ollama";
	config.provider.model = "llama3";
	config.provider.fast_model = "llama3";
	await saveConfig(root, config);

	const llm = await createProvider("ollama", "llama3");
	log.success(`Connected to ${llm.name}`);
	console.log();
	return llm;
}

// ─── Credentials persistence ────────────────────────────────────

/**
 * Save a credential to ~/.config/kib/credentials.
 * Simple KEY=value format, one per line.
 */
async function saveCredential(key: string, value: string): Promise<void> {
	await mkdir(CREDENTIALS_DIR, { recursive: true });

	let existing = "";
	try {
		existing = await readFile(CREDENTIALS_FILE, "utf-8");
	} catch {
		// File doesn't exist yet
	}

	// Parse existing lines, replace or append
	const lines = existing.split("\n").filter((l) => l.trim() && !l.startsWith("#"));
	const updated = lines.filter((l) => !l.startsWith(`${key}=`));
	updated.push(`${key}=${value}`);

	await writeFile(CREDENTIALS_FILE, `${updated.join("\n")}\n`, { mode: 0o600 });
}

/**
 * Load saved credentials from ~/.config/kib/credentials into process.env.
 * Only sets variables that aren't already set (env vars take precedence).
 */
export function loadCredentials(): void {
	const path = join(homedir(), ".config", "kib", "credentials");
	if (!existsSync(path)) return;

	try {
		const content = readFileSync(path, "utf-8");
		for (const line of content.split("\n")) {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith("#")) continue;

			const eqIndex = trimmed.indexOf("=");
			if (eqIndex === -1) continue;

			const key = trimmed.slice(0, eqIndex);
			const value = trimmed.slice(eqIndex + 1);

			// Don't override existing env vars
			if (!process.env[key]) {
				process.env[key] = value;
			}
		}
	} catch {
		// Silently ignore read errors
	}
}
