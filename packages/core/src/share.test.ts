import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getContributor, isGitRepo, isShared, mergeManifests } from "./share.js";
import type { Manifest } from "./types.js";
import { initVault } from "./vault.js";

let tempDirs: string[] = [];

afterEach(async () => {
	for (const dir of tempDirs) {
		await rm(dir, { recursive: true, force: true }).catch(() => {});
	}
	tempDirs = [];
});

async function makeTempDir() {
	const dir = await mkdtemp(join(tmpdir(), "kib-share-test-"));
	tempDirs.push(dir);
	return dir;
}

async function _makeTempVault(name = "test-vault") {
	const dir = await makeTempDir();
	await initVault(dir, { name });
	return dir;
}

// ─── mergeManifests ─────────────────────────────────────────────

describe("mergeManifests", () => {
	const baseManifest: Manifest = {
		version: "1",
		vault: {
			name: "test",
			created: "2025-01-01T00:00:00.000Z",
			lastCompiled: "2025-01-01T00:00:00.000Z",
			provider: "anthropic",
			model: "claude-sonnet-4-6",
		},
		sources: {
			src_aaa: {
				hash: "aaa",
				ingestedAt: "2025-01-01T00:00:00.000Z",
				lastCompiled: "2025-01-01T00:00:00.000Z",
				sourceType: "web",
				producedArticles: ["article-a"],
				status: "compiled",
				metadata: { wordCount: 100 },
			},
		},
		articles: {
			"article-a": {
				hash: "ha",
				createdAt: "2025-01-01T00:00:00.000Z",
				lastUpdated: "2025-01-01T00:00:00.000Z",
				derivedFrom: ["src_aaa"],
				backlinks: [],
				forwardLinks: [],
				tags: ["test"],
				summary: "Article A",
				wordCount: 100,
				category: "concept",
			},
		},
		stats: {
			totalSources: 1,
			totalArticles: 1,
			totalWords: 100,
			lastLintAt: null,
		},
	};

	test("merges non-overlapping sources from both sides", () => {
		const ours: Manifest = structuredClone(baseManifest);
		ours.sources.src_bbb = {
			hash: "bbb",
			ingestedAt: "2025-01-02T00:00:00.000Z",
			lastCompiled: null,
			sourceType: "pdf",
			producedArticles: [],
			status: "ingested",
			metadata: { wordCount: 200 },
		};

		const theirs: Manifest = structuredClone(baseManifest);
		theirs.sources.src_ccc = {
			hash: "ccc",
			ingestedAt: "2025-01-03T00:00:00.000Z",
			lastCompiled: null,
			sourceType: "youtube",
			producedArticles: [],
			status: "ingested",
			metadata: { wordCount: 300 },
		};

		const merged = mergeManifests(baseManifest, ours, theirs);

		expect(Object.keys(merged.sources)).toHaveLength(3);
		expect(merged.sources.src_aaa).toBeDefined();
		expect(merged.sources.src_bbb).toBeDefined();
		expect(merged.sources.src_ccc).toBeDefined();
		expect(merged.stats.totalSources).toBe(3);
	});

	test("merges non-overlapping articles from both sides", () => {
		const ours: Manifest = structuredClone(baseManifest);
		ours.articles["article-b"] = {
			hash: "hb",
			createdAt: "2025-01-02T00:00:00.000Z",
			lastUpdated: "2025-01-02T00:00:00.000Z",
			derivedFrom: ["src_aaa"],
			backlinks: [],
			forwardLinks: [],
			tags: [],
			summary: "Article B",
			wordCount: 200,
			category: "topic",
		};

		const theirs: Manifest = structuredClone(baseManifest);
		theirs.articles["article-c"] = {
			hash: "hc",
			createdAt: "2025-01-03T00:00:00.000Z",
			lastUpdated: "2025-01-03T00:00:00.000Z",
			derivedFrom: ["src_aaa"],
			backlinks: [],
			forwardLinks: [],
			tags: [],
			summary: "Article C",
			wordCount: 150,
			category: "reference",
		};

		const merged = mergeManifests(baseManifest, ours, theirs);

		expect(Object.keys(merged.articles)).toHaveLength(3);
		expect(merged.stats.totalArticles).toBe(3);
		expect(merged.stats.totalWords).toBe(450); // 100 + 200 + 150
	});

	test("prefers newer article on conflict", () => {
		const ours: Manifest = structuredClone(baseManifest);
		ours.articles["article-a"]!.lastUpdated = "2025-01-05T00:00:00.000Z";
		ours.articles["article-a"]!.summary = "Updated by Alice";
		ours.articles["article-a"]!.wordCount = 150;

		const theirs: Manifest = structuredClone(baseManifest);
		theirs.articles["article-a"]!.lastUpdated = "2025-01-03T00:00:00.000Z";
		theirs.articles["article-a"]!.summary = "Updated by Bob";

		const merged = mergeManifests(baseManifest, ours, theirs);

		expect(merged.articles["article-a"]!.summary).toBe("Updated by Alice");
		expect(merged.articles["article-a"]!.wordCount).toBe(150);
	});

	test("prefers theirs when theirs is newer", () => {
		const ours: Manifest = structuredClone(baseManifest);
		ours.articles["article-a"]!.lastUpdated = "2025-01-02T00:00:00.000Z";
		ours.articles["article-a"]!.summary = "Older edit";

		const theirs: Manifest = structuredClone(baseManifest);
		theirs.articles["article-a"]!.lastUpdated = "2025-01-10T00:00:00.000Z";
		theirs.articles["article-a"]!.summary = "Newer edit";

		const merged = mergeManifests(baseManifest, ours, theirs);

		expect(merged.articles["article-a"]!.summary).toBe("Newer edit");
	});

	test("prefers newer source on conflict", () => {
		const ours: Manifest = structuredClone(baseManifest);
		ours.sources.src_aaa!.ingestedAt = "2025-01-05T00:00:00.000Z";
		ours.sources.src_aaa!.status = "compiled";

		const theirs: Manifest = structuredClone(baseManifest);
		theirs.sources.src_aaa!.ingestedAt = "2025-01-02T00:00:00.000Z";

		const merged = mergeManifests(baseManifest, ours, theirs);

		expect(merged.sources.src_aaa!.ingestedAt).toBe("2025-01-05T00:00:00.000Z");
	});

	test("takes the most recent lastCompiled for vault", () => {
		const ours: Manifest = structuredClone(baseManifest);
		ours.vault.lastCompiled = "2025-01-10T00:00:00.000Z";

		const theirs: Manifest = structuredClone(baseManifest);
		theirs.vault.lastCompiled = "2025-01-15T00:00:00.000Z";

		const merged = mergeManifests(baseManifest, ours, theirs);

		expect(merged.vault.lastCompiled).toBe("2025-01-15T00:00:00.000Z");
	});

	test("preserves source when present in both sides", () => {
		const base: Manifest = structuredClone(baseManifest);
		base.sources.src_keep = {
			hash: "keep",
			ingestedAt: "2025-01-01T00:00:00.000Z",
			lastCompiled: null,
			sourceType: "file",
			producedArticles: [],
			status: "ingested",
			metadata: { wordCount: 50 },
		};

		const ours: Manifest = structuredClone(base);
		const theirs: Manifest = structuredClone(base);

		const merged = mergeManifests(base, ours, theirs);
		expect(merged.sources.src_keep).toBeDefined();
	});

	test("recomputes stats correctly after merge", () => {
		const ours: Manifest = structuredClone(baseManifest);
		ours.sources.src_new = {
			hash: "new",
			ingestedAt: "2025-02-01T00:00:00.000Z",
			lastCompiled: null,
			sourceType: "web",
			producedArticles: [],
			status: "ingested",
			metadata: { wordCount: 500 },
		};
		ours.articles["new-article"] = {
			hash: "hn",
			createdAt: "2025-02-01T00:00:00.000Z",
			lastUpdated: "2025-02-01T00:00:00.000Z",
			derivedFrom: ["src_new"],
			backlinks: [],
			forwardLinks: [],
			tags: [],
			summary: "New",
			wordCount: 300,
			category: "topic",
		};

		const merged = mergeManifests(baseManifest, ours, baseManifest);

		expect(merged.stats.totalSources).toBe(2);
		expect(merged.stats.totalArticles).toBe(2);
		expect(merged.stats.totalWords).toBe(400); // 100 + 300
	});

	test("merges lastLintAt taking the most recent", () => {
		const ours: Manifest = structuredClone(baseManifest);
		ours.stats.lastLintAt = "2025-01-05T00:00:00.000Z";

		const theirs: Manifest = structuredClone(baseManifest);
		theirs.stats.lastLintAt = "2025-01-10T00:00:00.000Z";

		const merged = mergeManifests(baseManifest, ours, theirs);
		expect(merged.stats.lastLintAt).toBe("2025-01-10T00:00:00.000Z");
	});

	test("handles both sides adding same source (dedup by key)", () => {
		const ours: Manifest = structuredClone(baseManifest);
		ours.sources.src_same = {
			hash: "same",
			ingestedAt: "2025-01-02T00:00:00.000Z",
			lastCompiled: null,
			sourceType: "web",
			producedArticles: [],
			status: "ingested",
			metadata: { wordCount: 100 },
		};

		const theirs: Manifest = structuredClone(baseManifest);
		theirs.sources.src_same = {
			hash: "same",
			ingestedAt: "2025-01-02T00:00:00.000Z",
			lastCompiled: null,
			sourceType: "web",
			producedArticles: [],
			status: "ingested",
			metadata: { wordCount: 100 },
		};

		const merged = mergeManifests(baseManifest, ours, theirs);
		expect(Object.keys(merged.sources)).toHaveLength(2); // original + one copy of same
	});

	test("handles null lastCompiled in vault", () => {
		const base: Manifest = structuredClone(baseManifest);
		base.vault.lastCompiled = null;

		const ours: Manifest = structuredClone(base);
		ours.vault.lastCompiled = null;

		const theirs: Manifest = structuredClone(base);
		theirs.vault.lastCompiled = "2025-01-15T00:00:00.000Z";

		const merged = mergeManifests(base, ours, theirs);
		expect(merged.vault.lastCompiled).toBe("2025-01-15T00:00:00.000Z");
	});

	test("handles empty manifests", () => {
		const empty: Manifest = {
			version: "1",
			vault: {
				name: "empty",
				created: "2025-01-01T00:00:00.000Z",
				lastCompiled: null,
				provider: "anthropic",
				model: "claude-sonnet-4-6",
			},
			sources: {},
			articles: {},
			stats: { totalSources: 0, totalArticles: 0, totalWords: 0, lastLintAt: null },
		};

		const merged = mergeManifests(empty, empty, empty);
		expect(Object.keys(merged.sources)).toHaveLength(0);
		expect(Object.keys(merged.articles)).toHaveLength(0);
		expect(merged.stats.totalWords).toBe(0);
	});
});

// ─── Utility Functions ──────────────────────────────────────────

describe("isGitRepo", () => {
	test("returns false for a regular directory", async () => {
		const dir = await makeTempDir();
		expect(isGitRepo(dir)).toBe(false);
	});

	test("returns false for non-existent path", () => {
		expect(isGitRepo(`/tmp/nonexistent-kib-test-${Date.now()}`)).toBe(false);
	});
});

describe("isShared", () => {
	test("returns false for non-git directory", async () => {
		const dir = await makeTempDir();
		expect(isShared(dir)).toBe(false);
	});
});

describe("getContributor", () => {
	test("returns a name and email", () => {
		const c = getContributor();
		expect(c.name).toBeTruthy();
		expect(typeof c.email).toBe("string");
	});
});
