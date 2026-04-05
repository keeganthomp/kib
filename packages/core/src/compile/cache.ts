import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { CACHE_DIR, VAULT_DIR } from "../constants.js";
import { hash } from "../hash.js";

interface CacheEntry {
	content: string;
	usage: { inputTokens: number; outputTokens: number };
	cachedAt: string;
	ttlHours: number;
}

/**
 * LLM response cache.
 * Keys are xxhash of (system + user content + model + temperature).
 * Values are stored as JSON files in .kb/cache/responses/.
 */
export class CompileCache {
	private cacheDir: string;
	private ttlHours: number;
	private enabled: boolean;

	constructor(root: string, opts: { enabled?: boolean; ttlHours?: number } = {}) {
		this.cacheDir = join(root, VAULT_DIR, CACHE_DIR, "responses");
		this.ttlHours = opts.ttlHours ?? 168; // 7 days
		this.enabled = opts.enabled ?? true;
	}

	/**
	 * Generate a cache key from prompt parameters.
	 */
	async key(system: string, user: string, model?: string, temperature?: number): Promise<string> {
		const input = `${system}\n---\n${user}\n---\n${model ?? ""}\n---\n${temperature ?? 0}`;
		return hash(input);
	}

	/**
	 * Get a cached response if it exists and isn't expired.
	 */
	async get(cacheKey: string): Promise<CacheEntry | null> {
		if (!this.enabled) return null;

		const filePath = join(this.cacheDir, `${cacheKey}.json`);
		if (!existsSync(filePath)) return null;

		try {
			const raw = await readFile(filePath, "utf-8");
			const entry = JSON.parse(raw) as CacheEntry;

			// Check TTL
			const cachedAt = new Date(entry.cachedAt);
			const expiresAt = new Date(cachedAt.getTime() + entry.ttlHours * 60 * 60 * 1000);
			if (new Date() > expiresAt) {
				// Expired — delete it
				await rm(filePath, { force: true });
				return null;
			}

			return entry;
		} catch {
			return null;
		}
	}

	/**
	 * Store a response in the cache.
	 */
	async set(
		cacheKey: string,
		content: string,
		usage: { inputTokens: number; outputTokens: number },
	): Promise<void> {
		if (!this.enabled) return;

		await mkdir(this.cacheDir, { recursive: true });

		const entry: CacheEntry = {
			content,
			usage,
			cachedAt: new Date().toISOString(),
			ttlHours: this.ttlHours,
		};

		await writeFile(
			join(this.cacheDir, `${cacheKey}.json`),
			JSON.stringify(entry, null, 2),
			"utf-8",
		);
	}

	/**
	 * Clear all cached responses.
	 */
	async clear(): Promise<number> {
		if (!existsSync(this.cacheDir)) return 0;

		const files = await readdir(this.cacheDir);
		const jsonFiles = files.filter((f) => f.endsWith(".json"));

		for (const file of jsonFiles) {
			await rm(join(this.cacheDir, file), { force: true });
		}

		return jsonFiles.length;
	}

	/**
	 * Get cache statistics.
	 */
	async stats(): Promise<{ entries: number; sizeBytes: number }> {
		if (!existsSync(this.cacheDir)) return { entries: 0, sizeBytes: 0 };

		const files = await readdir(this.cacheDir);
		const jsonFiles = files.filter((f) => f.endsWith(".json"));

		let sizeBytes = 0;
		for (const file of jsonFiles) {
			const s = await stat(join(this.cacheDir, file));
			sizeBytes += s.size;
		}

		return { entries: jsonFiles.length, sizeBytes };
	}
}
