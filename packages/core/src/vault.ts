import { existsSync } from "node:fs";
import { appendFile, mkdir, readdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import TOML from "@iarna/toml";
import {
	CACHE_DIR,
	CONFIG_FILE,
	DEFAULT_CATEGORIES,
	DEFAULTS,
	GRAPH_FILE,
	INBOX_DIR,
	INDEX_FILE,
	LOGS_DIR,
	MANIFEST_FILE,
	MANIFEST_VERSION,
	RAW_CATEGORIES,
	RAW_DIR,
	SKILLS_DIR,
	VAULT_DIR,
	WIKI_DIR,
} from "./constants.js";
import { ManifestError, VaultExistsError, VaultNotFoundError } from "./errors.js";
import { ManifestSchema, VaultConfigSchema } from "./schemas.js";
import type { Manifest, VaultConfig } from "./types.js";

const GLOBAL_VAULT = join(homedir(), ".kib");

/**
 * Find the vault root by walking up from startDir looking for .kb/
 * Falls back to ~/.kib if no local vault is found.
 */
export function resolveVaultRoot(startDir?: string): string {
	let dir = resolve(startDir ?? process.cwd());
	while (true) {
		if (existsSync(join(dir, VAULT_DIR))) {
			return dir;
		}
		const parent = dirname(dir);
		if (parent === dir) {
			// No local vault found — try global ~/.kib
			if (existsSync(join(GLOBAL_VAULT, VAULT_DIR))) {
				return GLOBAL_VAULT;
			}
			throw new VaultNotFoundError(startDir);
		}
		dir = parent;
	}
}

/**
 * Initialize a new vault at the given path.
 */
export async function initVault(
	rootDir: string,
	opts: { name?: string; provider?: string; model?: string; force?: boolean } = {},
): Promise<{ root: string; manifest: Manifest; config: VaultConfig }> {
	const root = resolve(rootDir);
	const kbDir = join(root, VAULT_DIR);

	if (existsSync(kbDir) && !opts.force) {
		throw new VaultExistsError(root);
	}

	// Create directory structure
	const dirs = [
		kbDir,
		join(kbDir, CACHE_DIR),
		join(kbDir, CACHE_DIR, "responses"),
		join(kbDir, SKILLS_DIR),
		join(kbDir, LOGS_DIR),
		join(root, INBOX_DIR),
		join(root, WIKI_DIR),
		...DEFAULT_CATEGORIES.map((c) => join(root, WIKI_DIR, c)),
		join(root, RAW_DIR),
		...RAW_CATEGORIES.map((c) => join(root, RAW_DIR, c)),
	];

	await Promise.all(dirs.map((d) => mkdir(d, { recursive: true })));

	const now = new Date().toISOString();
	const provider = opts.provider ?? DEFAULTS.provider;
	const model = opts.model ?? DEFAULTS.model;
	const name = opts.name ?? basename(root);

	const manifest: Manifest = {
		version: MANIFEST_VERSION,
		vault: {
			name,
			created: now,
			lastCompiled: null,
			provider,
			model,
		},
		sources: {},
		articles: {},
		stats: {
			totalSources: 0,
			totalArticles: 0,
			totalWords: 0,
			lastLintAt: null,
		},
	};

	const config: VaultConfig = VaultConfigSchema.parse({
		provider: { default: provider, model, fast_model: DEFAULTS.fastModel },
		compile: {},
		ingest: {},
		watch: {},
		search: {},
		query: {},
		cache: {},
	});

	await saveManifest(root, manifest);
	await saveConfig(root, config);
	await writeFile(join(root, "CLAUDE.md"), generateClaudeMd(name, provider, model));

	return { root, manifest, config };
}

function generateClaudeMd(name: string, provider: string, model: string): string {
	const envKey =
		provider === "anthropic"
			? "ANTHROPIC_API_KEY"
			: provider === "openai"
				? "OPENAI_API_KEY"
				: null;

	const apiKeySection = envKey
		? `
## API Key Required

kib uses its own LLM API key for compile and query (MCP tools cannot use the host LLM).
To enable full functionality, the user must set \`${envKey}\`:

\`\`\`bash
# Option 1: environment variable
export ${envKey}=sk-...

# Option 2: credentials file (persists across sessions)
echo "${envKey}=sk-..." >> ~/.config/kib/credentials
\`\`\`

Or use the \`kib_config\` tool to change provider: \`kib_config(key="provider.default", value="openai")\`
`
		: "";

	return `# ${name} — kib vault

This directory is a [kib](https://github.com/keeganthomp/kib) vault — an AI-compiled knowledge base.
kib ingests sources (URLs, PDFs, YouTube, GitHub repos, files, images) and compiles them into a structured, searchable wiki.

**First step:** Call the \`kib_status\` tool to check vault state and whether the LLM provider is ready.

## MCP Tools Available

**Work immediately (no API key needed):**
- \`kib_status\` — vault state, provider status, and setup instructions
- \`kib_search\` — full-text BM25 search across all articles
- \`kib_list\` — list wiki articles or raw sources
- \`kib_read\` — read a specific article or source
- \`kib_ingest\` — ingest URLs, files, PDFs, YouTube, repos, images (saves to raw/)
- \`kib_export\` — export wiki as markdown or HTML
- \`kib_lint\` — health checks on the wiki
- \`kib_config\` — get/set vault configuration

**Require an LLM API key:**
- \`kib_compile\` — compile raw sources into wiki articles via LLM
- \`kib_query\` — ask questions with RAG (retrieval-augmented generation)
- \`kib_skill\` — run skills (summarize, flashcards, connections, etc.)

Note: \`kib_ingest\` auto-compiles after ingesting if a provider is configured. Without a key, sources are saved but not compiled.
${apiKeySection}
## Vault Layout

- \`raw/\` — ingested source material (articles, papers, repos, images, transcripts)
- \`wiki/\` — compiled articles with \`INDEX.md\` and \`GRAPH.md\`
- \`inbox/\` — drop files here for auto-ingestion (via \`kib watch\` daemon)
- \`.kb/\` — config, manifest, cache, logs

## Provider

${provider} (${model})
`;
}

// ─── Manifest Operations ─────────────────────────────────────────

export async function loadManifest(root: string): Promise<Manifest> {
	const path = join(root, VAULT_DIR, MANIFEST_FILE);
	try {
		const raw = await readFile(path, "utf-8");
		const data = JSON.parse(raw);
		return ManifestSchema.parse(data);
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === "ENOENT") {
			throw new VaultNotFoundError(root);
		}
		throw new ManifestError(`Failed to load manifest: ${err}`);
	}
}

export async function saveManifest(root: string, manifest: Manifest): Promise<void> {
	const path = join(root, VAULT_DIR, MANIFEST_FILE);
	const tmp = `${path}.tmp`;
	await writeFile(tmp, JSON.stringify(manifest, null, 2), "utf-8");
	await rename(tmp, path);
}

// ─── Config Operations ───────────────────────────────────────────

export async function loadConfig(root: string): Promise<VaultConfig> {
	const path = join(root, VAULT_DIR, CONFIG_FILE);
	try {
		const raw = await readFile(path, "utf-8");
		const data = TOML.parse(raw);
		return VaultConfigSchema.parse(data);
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === "ENOENT") {
			throw new VaultNotFoundError(root);
		}
		throw new ManifestError(`Failed to load config: ${err}`);
	}
}

export async function saveConfig(root: string, config: VaultConfig): Promise<void> {
	const path = join(root, VAULT_DIR, CONFIG_FILE);
	const tmp = `${path}.tmp`;
	await writeFile(tmp, TOML.stringify(config as unknown as TOML.JsonMap), "utf-8");
	await rename(tmp, path);
}

// ─── Raw File Operations ─────────────────────────────────────────

export async function writeRaw(
	root: string,
	relativePath: string,
	content: string,
): Promise<string> {
	const fullPath = join(root, RAW_DIR, relativePath);
	await mkdir(dirname(fullPath), { recursive: true });
	const tmp = `${fullPath}.tmp`;
	await writeFile(tmp, content, "utf-8");
	await rename(tmp, fullPath);
	return fullPath;
}

export async function readRaw(root: string, relativePath: string): Promise<string> {
	const fullPath = join(root, RAW_DIR, relativePath);
	return readFile(fullPath, "utf-8");
}

export async function listRaw(root: string): Promise<string[]> {
	return listFilesRecursive(join(root, RAW_DIR));
}

// ─── Wiki File Operations ────────────────────────────────────────

export async function writeWiki(
	root: string,
	relativePath: string,
	content: string,
): Promise<string> {
	const fullPath = join(root, WIKI_DIR, relativePath);
	await mkdir(dirname(fullPath), { recursive: true });
	const tmp = `${fullPath}.tmp`;
	await writeFile(tmp, content, "utf-8");
	await rename(tmp, fullPath);
	return fullPath;
}

export async function readWiki(root: string, relativePath: string): Promise<string> {
	const fullPath = join(root, WIKI_DIR, relativePath);
	return readFile(fullPath, "utf-8");
}

export async function listWiki(root: string): Promise<string[]> {
	return listFilesRecursive(join(root, WIKI_DIR));
}

export async function readIndex(root: string): Promise<string> {
	try {
		return await readFile(join(root, WIKI_DIR, INDEX_FILE), "utf-8");
	} catch {
		return "";
	}
}

export async function readGraph(root: string): Promise<string> {
	try {
		return await readFile(join(root, WIKI_DIR, GRAPH_FILE), "utf-8");
	} catch {
		return "";
	}
}

// ─── Image Asset Operations ─────────────────────────────────────

const IMAGES_DIR = "images";

/**
 * Write an image binary to wiki/images/{filename}.
 * Returns the relative path from wiki/ (e.g. "images/diagram.png").
 */
export async function writeImageAsset(
	root: string,
	filename: string,
	data: Buffer,
): Promise<string> {
	const dir = join(root, WIKI_DIR, IMAGES_DIR);
	await mkdir(dir, { recursive: true });
	const fullPath = join(dir, filename);
	await writeFile(fullPath, data);
	return `${IMAGES_DIR}/${filename}`;
}

/**
 * List all image asset files in wiki/images/.
 * Returns filenames (e.g. ["diagram.png", "photo.jpg"]).
 */
export async function listImageAssets(root: string): Promise<string[]> {
	const dir = join(root, WIKI_DIR, IMAGES_DIR);
	try {
		const entries = await readdir(dir, { withFileTypes: true });
		return entries.filter((e) => e.isFile()).map((e) => e.name);
	} catch {
		return [];
	}
}

// ─── Log Operations ─────────────────────────────────────────────

const LOG_FILE = "LOG.md";

export async function appendLog(root: string, action: string, details: string): Promise<void> {
	const logPath = join(root, WIKI_DIR, LOG_FILE);
	const timestamp = new Date().toISOString();
	const entry = `- **${timestamp}** \`${action}\` ${details}\n`;

	try {
		await appendFile(logPath, entry, "utf-8");
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === "ENOENT") {
			await writeFile(logPath, `# Vault Log\n\n${entry}`, "utf-8");
		}
	}
}

export async function readLog(root: string): Promise<string> {
	try {
		return await readFile(join(root, WIKI_DIR, LOG_FILE), "utf-8");
	} catch {
		return "";
	}
}

// ─── Helpers ─────────────────────────────────────────────────────

async function listFilesRecursive(dir: string): Promise<string[]> {
	const results: string[] = [];
	try {
		const entries = await readdir(dir, { withFileTypes: true });
		for (const entry of entries) {
			const fullPath = join(dir, entry.name);
			if (entry.isDirectory()) {
				results.push(...(await listFilesRecursive(fullPath)));
			} else if (entry.name.endsWith(".md")) {
				results.push(fullPath);
			}
		}
	} catch {
		// Directory doesn't exist yet — that's fine
	}
	return results;
}

export async function deleteFile(path: string): Promise<void> {
	try {
		await unlink(path);
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
			throw err;
		}
	}
}
