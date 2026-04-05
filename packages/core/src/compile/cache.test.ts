import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initVault } from "../vault.js";
import { CompileCache } from "./cache.js";

let tempDir: string;

afterEach(async () => {
	if (tempDir) await rm(tempDir, { recursive: true, force: true });
});

async function makeTempVault() {
	tempDir = await mkdtemp(join(tmpdir(), "kib-cache-test-"));
	await initVault(tempDir, { name: "test" });
	return tempDir;
}

describe("CompileCache", () => {
	test("set and get round-trip", async () => {
		const root = await makeTempVault();
		const cache = new CompileCache(root);

		const key = await cache.key("system prompt", "user content");
		await cache.set(key, "LLM response content", { inputTokens: 100, outputTokens: 200 });

		const entry = await cache.get(key);
		expect(entry).not.toBeNull();
		expect(entry!.content).toBe("LLM response content");
		expect(entry!.usage.inputTokens).toBe(100);
		expect(entry!.usage.outputTokens).toBe(200);
	});

	test("returns null for missing key", async () => {
		const root = await makeTempVault();
		const cache = new CompileCache(root);

		const entry = await cache.get("nonexistent-key");
		expect(entry).toBeNull();
	});

	test("returns null when disabled", async () => {
		const root = await makeTempVault();
		const cache = new CompileCache(root, { enabled: false });

		const key = await cache.key("system", "user");
		await cache.set(key, "content", { inputTokens: 0, outputTokens: 0 });

		const entry = await cache.get(key);
		expect(entry).toBeNull();
	});

	test("same inputs produce same key", async () => {
		const root = await makeTempVault();
		const cache = new CompileCache(root);

		const key1 = await cache.key("system", "user", "model", 0);
		const key2 = await cache.key("system", "user", "model", 0);
		expect(key1).toBe(key2);
	});

	test("different inputs produce different keys", async () => {
		const root = await makeTempVault();
		const cache = new CompileCache(root);

		const key1 = await cache.key("system", "user A");
		const key2 = await cache.key("system", "user B");
		expect(key1).not.toBe(key2);
	});

	test("expires old entries", async () => {
		const root = await makeTempVault();
		const cache = new CompileCache(root, { ttlHours: 0 }); // Expire immediately

		const key = await cache.key("system", "user");
		await cache.set(key, "content", { inputTokens: 0, outputTokens: 0 });

		// Wait a tiny bit for the TTL to expire
		await new Promise((r) => setTimeout(r, 10));

		const entry = await cache.get(key);
		expect(entry).toBeNull();
	});

	test("clear removes all entries", async () => {
		const root = await makeTempVault();
		const cache = new CompileCache(root);

		const key1 = await cache.key("system", "user1");
		const key2 = await cache.key("system", "user2");
		await cache.set(key1, "content1", { inputTokens: 0, outputTokens: 0 });
		await cache.set(key2, "content2", { inputTokens: 0, outputTokens: 0 });

		const cleared = await cache.clear();
		expect(cleared).toBe(2);

		const entry1 = await cache.get(key1);
		const entry2 = await cache.get(key2);
		expect(entry1).toBeNull();
		expect(entry2).toBeNull();
	});

	test("stats returns correct counts", async () => {
		const root = await makeTempVault();
		const cache = new CompileCache(root);

		const key1 = await cache.key("system", "user1");
		const key2 = await cache.key("system", "user2");
		await cache.set(key1, "content1", { inputTokens: 0, outputTokens: 0 });
		await cache.set(key2, "content2", { inputTokens: 0, outputTokens: 0 });

		const s = await cache.stats();
		expect(s.entries).toBe(2);
		expect(s.sizeBytes).toBeGreaterThan(0);
	});

	test("stats returns zeros for empty cache", async () => {
		const root = await makeTempVault();
		const cache = new CompileCache(root);

		const s = await cache.stats();
		expect(s.entries).toBe(0);
		expect(s.sizeBytes).toBe(0);
	});
});
