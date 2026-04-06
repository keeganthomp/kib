import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initVault, writeWiki } from "../vault.js";
import { computeStats, generateIndexMd } from "./index-manager.js";

let tempDir: string;

afterEach(async () => {
	if (tempDir) await rm(tempDir, { recursive: true, force: true });
});

async function makeTempVault() {
	tempDir = await mkdtemp(join(tmpdir(), "kib-index-test-"));
	await initVault(tempDir, { name: "test" });
	return tempDir;
}

function articleMd(opts: {
	title: string;
	slug: string;
	category: string;
	tags?: string[];
	summary?: string;
	body?: string;
}) {
	const tags = opts.tags ? `[${opts.tags.join(", ")}]` : "[]";
	return `---
title: ${opts.title}
slug: ${opts.slug}
category: ${opts.category}
tags: ${tags}
summary: ${opts.summary ?? ""}
---

# ${opts.title}

${opts.body ?? "Some content here for the article."}`;
}

describe("generateIndexMd", () => {
	test("generates index with articles grouped by category", async () => {
		const root = await makeTempVault();

		await writeWiki(
			root,
			"concepts/transformers.md",
			articleMd({
				title: "Transformer Architecture",
				slug: "transformer-architecture",
				category: "concept",
				tags: ["deep-learning", "nlp"],
				summary: "The transformer replaces recurrence with self-attention.",
			}),
		);

		await writeWiki(
			root,
			"topics/scaling-laws.md",
			articleMd({
				title: "Scaling Laws",
				slug: "scaling-laws",
				category: "topic",
				tags: ["training"],
				summary: "Power-law relationships between compute and loss.",
			}),
		);

		await writeWiki(
			root,
			"references/vaswani.md",
			articleMd({
				title: "Vaswani et al.",
				slug: "vaswani-et-al",
				category: "reference",
				summary: "Authors of the original transformer paper.",
			}),
		);

		const index = await generateIndexMd(root);

		expect(index).toContain("# Knowledge Base Index");
		expect(index).toContain("3 articles");

		// Categories
		expect(index).toContain("## Concepts");
		expect(index).toContain("## Topics");
		expect(index).toContain("## References");

		// Articles
		expect(index).toContain("[Transformer Architecture]");
		expect(index).toContain("[Scaling Laws]");
		expect(index).toContain("[Vaswani et al.]");

		// Tags
		expect(index).toContain("`#deep-learning`");
		expect(index).toContain("`#nlp`");

		// Summaries
		expect(index).toContain("replaces recurrence with self-attention");
	});

	test("handles empty wiki", async () => {
		const root = await makeTempVault();
		const index = await generateIndexMd(root);
		expect(index).toContain("0 articles");
	});

	test("sorts articles alphabetically within categories", async () => {
		const root = await makeTempVault();

		await writeWiki(
			root,
			"concepts/zebra.md",
			articleMd({
				title: "Zebra Concept",
				slug: "zebra",
				category: "concept",
			}),
		);
		await writeWiki(
			root,
			"concepts/alpha.md",
			articleMd({
				title: "Alpha Concept",
				slug: "alpha",
				category: "concept",
			}),
		);
		await writeWiki(
			root,
			"concepts/mid.md",
			articleMd({
				title: "Mid Concept",
				slug: "mid",
				category: "concept",
			}),
		);

		const index = await generateIndexMd(root);
		const _conceptsIdx = index.indexOf("## Concepts");
		const alphaIdx = index.indexOf("Alpha Concept");
		const midIdx = index.indexOf("Mid Concept");
		const zebraIdx = index.indexOf("Zebra Concept");

		expect(alphaIdx).toBeLessThan(midIdx);
		expect(midIdx).toBeLessThan(zebraIdx);
	});

	test("skips INDEX.md and GRAPH.md from listing", async () => {
		const root = await makeTempVault();

		await writeWiki(root, "INDEX.md", "# Index\nOld index.");
		await writeWiki(root, "GRAPH.md", "# Graph\nOld graph.");
		await writeWiki(
			root,
			"concepts/test.md",
			articleMd({
				title: "Test",
				slug: "test",
				category: "concept",
			}),
		);

		const index = await generateIndexMd(root);
		expect(index).toContain("1 articles"); // Only the actual article, not INDEX/GRAPH
	});

	test("only includes sections that have articles", async () => {
		const root = await makeTempVault();

		await writeWiki(
			root,
			"concepts/test.md",
			articleMd({
				title: "Test",
				slug: "test",
				category: "concept",
			}),
		);

		const index = await generateIndexMd(root);
		expect(index).toContain("## Concepts");
		expect(index).not.toContain("## Topics");
		expect(index).not.toContain("## References");
		expect(index).not.toContain("## Outputs");
	});
});

describe("computeStats", () => {
	test("computes article count and word count", async () => {
		const root = await makeTempVault();

		await writeWiki(
			root,
			"concepts/a.md",
			articleMd({
				title: "A",
				slug: "a",
				category: "concept",
				body: "one two three four five",
			}),
		);
		await writeWiki(
			root,
			"concepts/b.md",
			articleMd({
				title: "B",
				slug: "b",
				category: "concept",
				body: "six seven eight nine ten",
			}),
		);

		const stats = await computeStats(root);
		expect(stats.totalArticles).toBe(2);
		expect(stats.totalWords).toBeGreaterThan(0);
	});

	test("returns zero for empty wiki", async () => {
		const root = await makeTempVault();
		const stats = await computeStats(root);
		expect(stats.totalArticles).toBe(0);
		expect(stats.totalWords).toBe(0);
	});
});
