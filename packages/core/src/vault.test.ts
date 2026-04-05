import { afterEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	initVault,
	loadConfig,
	loadManifest,
	readRaw,
	resolveVaultRoot,
	writeRaw,
	writeWiki,
	listWiki,
	readWiki,
} from "./vault.js";

let tempDir: string;

afterEach(async () => {
	if (tempDir) {
		await rm(tempDir, { recursive: true, force: true });
	}
});

async function makeTempDir() {
	tempDir = await mkdtemp(join(tmpdir(), "kib-test-"));
	return tempDir;
}

describe("initVault", () => {
	test("creates vault directory structure", async () => {
		const dir = await makeTempDir();
		const { root, manifest, config } = await initVault(dir, { name: "test-vault" });

		expect(root).toBe(dir);
		expect(existsSync(join(dir, ".kb"))).toBe(true);
		expect(existsSync(join(dir, ".kb", "manifest.json"))).toBe(true);
		expect(existsSync(join(dir, ".kb", "config.toml"))).toBe(true);
		expect(existsSync(join(dir, "raw"))).toBe(true);
		expect(existsSync(join(dir, "wiki"))).toBe(true);
		expect(existsSync(join(dir, "wiki", "concepts"))).toBe(true);
		expect(existsSync(join(dir, "wiki", "topics"))).toBe(true);
		expect(existsSync(join(dir, "wiki", "references"))).toBe(true);
		expect(existsSync(join(dir, "wiki", "outputs"))).toBe(true);
		expect(existsSync(join(dir, "inbox"))).toBe(true);

		expect(manifest.vault.name).toBe("test-vault");
		expect(manifest.version).toBe("1");
		expect(config.provider.default).toBe("anthropic");
	});

	test("throws if vault already exists", async () => {
		const dir = await makeTempDir();
		await initVault(dir);
		expect(initVault(dir)).rejects.toThrow("already exists");
	});

	test("allows reinit with force", async () => {
		const dir = await makeTempDir();
		await initVault(dir, { name: "first" });
		const { manifest } = await initVault(dir, { name: "second", force: true });
		expect(manifest.vault.name).toBe("second");
	});
});

describe("resolveVaultRoot", () => {
	test("finds vault root from subdirectory", async () => {
		const dir = await makeTempDir();
		await initVault(dir);
		const subdir = join(dir, "wiki", "concepts");
		expect(resolveVaultRoot(subdir)).toBe(dir);
	});

	test("throws if no vault found", async () => {
		const dir = await makeTempDir();
		expect(() => resolveVaultRoot(dir)).toThrow("No vault found");
	});
});

describe("manifest operations", () => {
	test("loadManifest round-trips through saveManifest", async () => {
		const dir = await makeTempDir();
		await initVault(dir, { name: "roundtrip-test" });
		const manifest = await loadManifest(dir);
		expect(manifest.vault.name).toBe("roundtrip-test");
		expect(manifest.sources).toEqual({});
		expect(manifest.articles).toEqual({});
	});
});

describe("config operations", () => {
	test("loadConfig returns valid config", async () => {
		const dir = await makeTempDir();
		await initVault(dir);
		const config = await loadConfig(dir);
		expect(config.provider.default).toBe("anthropic");
		expect(config.compile.auto_index).toBe(true);
		expect(config.cache.enabled).toBe(true);
	});
});

describe("raw file operations", () => {
	test("writeRaw and readRaw round-trip", async () => {
		const dir = await makeTempDir();
		await initVault(dir);
		const content = "# Test Article\n\nSome content here.";
		await writeRaw(dir, "articles/test.md", content);
		const read = await readRaw(dir, "articles/test.md");
		expect(read).toBe(content);
	});

	test("writeRaw creates subdirectories", async () => {
		const dir = await makeTempDir();
		await initVault(dir);
		await writeRaw(dir, "papers/deep/nested/file.md", "content");
		expect(existsSync(join(dir, "raw", "papers", "deep", "nested", "file.md"))).toBe(true);
	});
});

describe("wiki file operations", () => {
	test("writeWiki and readWiki round-trip", async () => {
		const dir = await makeTempDir();
		await initVault(dir);
		const content = "---\ntitle: Test\n---\n\n# Test\n\nContent.";
		await writeWiki(dir, "concepts/test.md", content);
		const read = await readWiki(dir, "concepts/test.md");
		expect(read).toBe(content);
	});

	test("listWiki returns markdown files", async () => {
		const dir = await makeTempDir();
		await initVault(dir);
		await writeWiki(dir, "concepts/a.md", "# A");
		await writeWiki(dir, "topics/b.md", "# B");
		const files = await listWiki(dir);
		expect(files.length).toBe(2);
		expect(files.some((f) => f.endsWith("a.md"))).toBe(true);
		expect(files.some((f) => f.endsWith("b.md"))).toBe(true);
	});
});
