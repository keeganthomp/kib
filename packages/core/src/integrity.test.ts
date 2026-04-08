import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateManifestIntegrity } from "./integrity.js";
import { initVault, loadManifest, saveManifest, writeRaw, writeWiki } from "./vault.js";

let tempDir: string;

afterEach(async () => {
	if (tempDir) {
		await rm(tempDir, { recursive: true, force: true });
	}
});

async function makeTempVault() {
	tempDir = await mkdtemp(join(tmpdir(), "kib-integrity-test-"));
	await initVault(tempDir, { name: "integrity-test" });
	return tempDir;
}

describe("validateManifestIntegrity", () => {
	test("returns empty for consistent empty vault", async () => {
		const dir = await makeTempVault();
		const manifest = await loadManifest(dir);
		const issues = await validateManifestIntegrity(dir, manifest);
		expect(issues).toEqual([]);
	});

	test("detects missing source file", async () => {
		const dir = await makeTempVault();
		const manifest = await loadManifest(dir);

		// Add a source entry without a file on disk
		manifest.sources.src_ghost123 = {
			hash: "abc123",
			ingestedAt: new Date().toISOString(),
			lastCompiled: null,
			sourceType: "web",
			producedArticles: [],
			metadata: { title: "Ghost Article", wordCount: 100 },
		};
		manifest.stats.totalSources = 1;
		await saveManifest(dir, manifest);

		const issues = await validateManifestIntegrity(dir, manifest);
		expect(issues.some((i) => i.category === "missing_file" && i.severity === "error")).toBe(true);
	});

	test("detects missing article file", async () => {
		const dir = await makeTempVault();
		const manifest = await loadManifest(dir);

		manifest.articles["ghost-article"] = {
			hash: "abc123",
			createdAt: new Date().toISOString(),
			lastUpdated: new Date().toISOString(),
			derivedFrom: [],
			backlinks: [],
			forwardLinks: [],
			tags: [],
			summary: "A ghost article",
			wordCount: 100,
			category: "concept",
		};
		manifest.stats.totalArticles = 1;
		manifest.stats.totalWords = 100;
		await saveManifest(dir, manifest);

		const issues = await validateManifestIntegrity(dir, manifest);
		expect(
			issues.some((i) => i.category === "missing_file" && i.message.includes("ghost-article")),
		).toBe(true);
	});

	test("detects broken source→article reference", async () => {
		const dir = await makeTempVault();
		const manifest = await loadManifest(dir);

		// Add a source that references a non-existent article
		await writeRaw(dir, "articles/real-source.md", "# Real Source");
		manifest.sources.src_real123 = {
			hash: "abc123",
			ingestedAt: new Date().toISOString(),
			lastCompiled: null,
			sourceType: "web",
			producedArticles: ["nonexistent-article"],
			metadata: { title: "Real Source", wordCount: 50 },
		};
		manifest.stats.totalSources = 1;
		await saveManifest(dir, manifest);

		const issues = await validateManifestIntegrity(dir, manifest);
		expect(
			issues.some(
				(i) => i.category === "broken_reference" && i.message.includes("nonexistent-article"),
			),
		).toBe(true);
	});

	test("detects broken article→source reference", async () => {
		const dir = await makeTempVault();
		const manifest = await loadManifest(dir);

		await writeWiki(dir, "concepts/real-article.md", "# Real Article");
		manifest.articles["real-article"] = {
			hash: "abc123",
			createdAt: new Date().toISOString(),
			lastUpdated: new Date().toISOString(),
			derivedFrom: ["src_nonexistent"],
			backlinks: [],
			forwardLinks: [],
			tags: [],
			summary: "Real article",
			wordCount: 50,
			category: "concept",
		};
		manifest.stats.totalArticles = 1;
		manifest.stats.totalWords = 50;
		await saveManifest(dir, manifest);

		const issues = await validateManifestIntegrity(dir, manifest);
		expect(
			issues.some((i) => i.category === "broken_reference" && i.message.includes("nonexistent")),
		).toBe(true);
	});

	test("detects stats mismatch", async () => {
		const dir = await makeTempVault();
		const manifest = await loadManifest(dir);

		manifest.stats.totalSources = 5;
		manifest.stats.totalArticles = 10;
		manifest.stats.totalWords = 5000;
		await saveManifest(dir, manifest);

		const issues = await validateManifestIntegrity(dir, manifest);
		const mismatches = issues.filter((i) => i.category === "stats_mismatch");
		expect(mismatches.length).toBe(3);
	});

	test("passes for consistent vault with files", async () => {
		const dir = await makeTempVault();
		const manifest = await loadManifest(dir);

		// Source with a real file — the file path is derived from title
		await writeRaw(dir, "articles/test-source.md", "# Test Source\n\nSome content here.");
		manifest.sources.src_test123 = {
			hash: "abc123",
			ingestedAt: new Date().toISOString(),
			lastCompiled: new Date().toISOString(),
			sourceType: "web",
			producedArticles: ["test-article"],
			metadata: { title: "Test Source", wordCount: 5 },
		};

		await writeWiki(dir, "concepts/test-article.md", "# Test Article\n\nCompiled content.");
		manifest.articles["test-article"] = {
			hash: "def456",
			createdAt: new Date().toISOString(),
			lastUpdated: new Date().toISOString(),
			derivedFrom: ["src_test123"],
			backlinks: [],
			forwardLinks: [],
			tags: ["test"],
			summary: "A test article",
			wordCount: 3,
			category: "concept",
		};

		manifest.stats.totalSources = 1;
		manifest.stats.totalArticles = 1;
		manifest.stats.totalWords = 3;
		await saveManifest(dir, manifest);

		const issues = await validateManifestIntegrity(dir, manifest);
		expect(issues).toEqual([]);
	});
});
