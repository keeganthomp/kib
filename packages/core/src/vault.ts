import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
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

	return { root, manifest, config };
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
