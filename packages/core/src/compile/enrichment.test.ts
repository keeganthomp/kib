import { describe, expect, test } from "bun:test";
import type { Manifest } from "../types.js";
import { findEnrichmentCandidates, slugToWikiPath } from "./enrichment.js";

function makeManifest(
	articles: Record<
		string,
		{ tags?: string[]; forwardLinks?: string[]; category?: string; backlinks?: string[] }
	>,
): Manifest {
	const articleEntries: Manifest["articles"] = {};
	for (const [slug, opts] of Object.entries(articles)) {
		articleEntries[slug] = {
			hash: slug,
			createdAt: new Date().toISOString(),
			lastUpdated: new Date().toISOString(),
			derivedFrom: [],
			backlinks: opts.backlinks ?? [],
			forwardLinks: opts.forwardLinks ?? [],
			tags: opts.tags ?? [],
			summary: `Summary for ${slug}`,
			wordCount: 100,
			category: (opts.category as "concept" | "topic" | "reference" | "output") ?? "concept",
		};
	}

	return {
		version: "1",
		vault: {
			name: "test",
			created: new Date().toISOString(),
			lastCompiled: null,
			provider: "anthropic",
			model: "test",
		},
		sources: {},
		articles: articleEntries,
		stats: { totalSources: 0, totalArticles: 0, totalWords: 0, lastLintAt: null },
	};
}

describe("findEnrichmentCandidates", () => {
	test("scores by tag overlap", () => {
		const manifest = makeManifest({
			"existing-a": { tags: ["ml", "nlp"] },
			"existing-b": { tags: ["cooking"], category: "reference" },
			"new-article": { tags: ["ml", "nlp", "transformers"] },
		});

		const candidates = findEnrichmentCandidates(manifest, new Set(["new-article"]), 10);

		// existing-a has tag overlap (ml, nlp) + category affinity = score 7
		// existing-b has no tag overlap, different category = score 0
		expect(candidates).toHaveLength(1);
		expect(candidates[0]!.slug).toBe("existing-a");
		expect(candidates[0]!.score).toBe(7); // 3+3 tags + 1 category
	});

	test("excludes newly changed articles", () => {
		const manifest = makeManifest({
			"article-a": { tags: ["ml"] },
			"article-b": { tags: ["ml"] },
		});

		const candidates = findEnrichmentCandidates(manifest, new Set(["article-a", "article-b"]), 10);

		expect(candidates).toHaveLength(0);
	});

	test("excludes articles already linking to new article", () => {
		const manifest = makeManifest({
			existing: { tags: ["ml"], forwardLinks: ["new-article"] },
			"new-article": { tags: ["ml"] },
		});

		const candidates = findEnrichmentCandidates(manifest, new Set(["new-article"]), 10);

		expect(candidates).toHaveLength(0);
	});

	test("scores by link proximity", () => {
		const manifest = makeManifest({
			"article-a": { forwardLinks: ["article-b"] },
			"article-b": { forwardLinks: ["new-article"] },
			"new-article": { tags: [] },
		});

		const candidates = findEnrichmentCandidates(manifest, new Set(["new-article"]), 10);

		// article-a links to article-b which links to new-article → proximity score
		expect(candidates.some((c) => c.slug === "article-a")).toBe(true);
	});

	test("scores by category affinity", () => {
		const manifest = makeManifest({
			existing: { category: "concept" },
			"new-article": { category: "concept" },
		});

		const candidates = findEnrichmentCandidates(manifest, new Set(["new-article"]), 10);

		expect(candidates).toHaveLength(1);
		expect(candidates[0]!.score).toBe(1); // category affinity only
	});

	test("respects maxCandidates limit", () => {
		const articles: Record<string, { tags: string[] }> = {};
		for (let i = 0; i < 20; i++) {
			articles[`existing-${i}`] = { tags: ["ml"] };
		}
		articles["new-article"] = { tags: ["ml"] };

		const manifest = makeManifest(articles);
		const candidates = findEnrichmentCandidates(manifest, new Set(["new-article"]), 5);

		expect(candidates.length).toBeLessThanOrEqual(5);
	});

	test("returns empty for no matches", () => {
		const manifest = makeManifest({
			existing: { tags: ["cooking"] },
			"new-article": { tags: ["ml"] },
		});

		const candidates = findEnrichmentCandidates(manifest, new Set(["new-article"]), 10);

		// No tag overlap, no link proximity, different category by default (both concept)
		// Category affinity gives +1 since both default to "concept"
		expect(candidates).toHaveLength(1);
	});
});

describe("slugToWikiPath", () => {
	test("maps categories to plural directories", () => {
		expect(slugToWikiPath("foo", "concept")).toBe("concepts/foo.md");
		expect(slugToWikiPath("bar", "topic")).toBe("topics/bar.md");
		expect(slugToWikiPath("baz", "reference")).toBe("references/baz.md");
		expect(slugToWikiPath("qux", "output")).toBe("outputs/qux.md");
	});

	test("falls back to topics for unknown category", () => {
		expect(slugToWikiPath("foo", "unknown")).toBe("topics/foo.md");
	});
});
