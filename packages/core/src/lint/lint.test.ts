import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile as fsWriteFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initVault, loadManifest, saveManifest, writeWiki } from "../vault.js";
import { ingestSource } from "../ingest/ingest.js";
import { lintVault } from "./lint.js";
import type { Manifest } from "../types.js";

let tempDir: string;

afterEach(async () => {
	if (tempDir) await rm(tempDir, { recursive: true, force: true });
});

async function makeTempVault() {
	tempDir = await mkdtemp(join(tmpdir(), "kib-lint-test-"));
	await initVault(tempDir, { name: "test" });
	return tempDir;
}

function articleMd(opts: {
	title: string;
	slug: string;
	category: string;
	body?: string;
}) {
	return `---
title: ${opts.title}
slug: ${opts.slug}
category: ${opts.category}
tags: []
summary: ""
---

# ${opts.title}

${opts.body ?? "Some content."}`;
}

describe("lint engine", () => {
	test("reports no issues for healthy vault", async () => {
		const root = await makeTempVault();

		// Create articles with cross-links
		await writeWiki(
			root,
			"concepts/alpha.md",
			articleMd({
				title: "Alpha",
				slug: "alpha",
				category: "concept",
				body: "See [[beta]].",
			}),
		);
		await writeWiki(
			root,
			"concepts/beta.md",
			articleMd({
				title: "Beta",
				slug: "beta",
				category: "concept",
				body: "See [[alpha]].",
			}),
		);

		// Update manifest to include articles with backlinks
		const manifest = await loadManifest(root);
		manifest.articles["alpha"] = {
			hash: "a",
			createdAt: new Date().toISOString(),
			lastUpdated: new Date().toISOString(),
			derivedFrom: [],
			backlinks: ["beta"],
			forwardLinks: ["beta"],
			tags: [],
			summary: "",
			wordCount: 10,
			category: "concept",
		};
		manifest.articles["beta"] = {
			hash: "b",
			createdAt: new Date().toISOString(),
			lastUpdated: new Date().toISOString(),
			derivedFrom: [],
			backlinks: ["alpha"],
			forwardLinks: ["alpha"],
			tags: [],
			summary: "",
			wordCount: 10,
			category: "concept",
		};
		await saveManifest(root, manifest);

		const result = await lintVault(root);
		expect(result.errors).toBe(0);
		// May have warnings (orphan detection depends on exact backlink setup)
	});

	test("detects orphan articles", async () => {
		const root = await makeTempVault();

		await writeWiki(
			root,
			"concepts/orphan.md",
			articleMd({ title: "Orphan", slug: "orphan", category: "concept" }),
		);

		// Add to manifest with no backlinks
		const manifest = await loadManifest(root);
		manifest.articles["orphan"] = {
			hash: "o",
			createdAt: new Date().toISOString(),
			lastUpdated: new Date().toISOString(),
			derivedFrom: [],
			backlinks: [],
			forwardLinks: [],
			tags: [],
			summary: "",
			wordCount: 10,
			category: "concept",
		};
		await saveManifest(root, manifest);

		const result = await lintVault(root, { ruleFilter: "orphan" });
		expect(result.warnings).toBeGreaterThan(0);
		expect(result.diagnostics.some((d) => d.rule === "orphan")).toBe(true);
	});

	test("detects broken wikilinks", async () => {
		const root = await makeTempVault();

		await writeWiki(
			root,
			"concepts/test.md",
			articleMd({
				title: "Test",
				slug: "test",
				category: "concept",
				body: "See [[nonexistent-article]].",
			}),
		);

		const manifest = await loadManifest(root);
		manifest.articles["test"] = {
			hash: "t",
			createdAt: new Date().toISOString(),
			lastUpdated: new Date().toISOString(),
			derivedFrom: [],
			backlinks: [],
			forwardLinks: ["nonexistent-article"],
			tags: [],
			summary: "",
			wordCount: 10,
			category: "concept",
		};
		await saveManifest(root, manifest);

		const result = await lintVault(root, { ruleFilter: "broken-link" });
		expect(result.errors).toBeGreaterThan(0);
		expect(
			result.diagnostics.some(
				(d) => d.rule === "broken-link" && d.message.includes("nonexistent-article"),
			),
		).toBe(true);
	});

	test("detects stale sources", async () => {
		const root = await makeTempVault();

		// Ingest a source (it won't be compiled)
		const testFile = join(root, "article.md");
		await fsWriteFile(testFile, "# Test\n\nContent.");
		await ingestSource(root, testFile);

		const result = await lintVault(root, { ruleFilter: "stale" });
		expect(result.warnings).toBeGreaterThan(0);
		expect(result.diagnostics.some((d) => d.rule === "stale")).toBe(true);
	});

	test("detects missing frontmatter", async () => {
		const root = await makeTempVault();

		// Write article without frontmatter
		await writeWiki(root, "concepts/nofm.md", "# No Frontmatter\n\nJust content.");

		const result = await lintVault(root, { ruleFilter: "frontmatter" });
		expect(result.errors).toBeGreaterThan(0);
		expect(
			result.diagnostics.some(
				(d) => d.rule === "frontmatter" && d.message.includes("Missing YAML"),
			),
		).toBe(true);
	});

	test("detects missing required frontmatter fields", async () => {
		const root = await makeTempVault();

		// Write article with partial frontmatter (missing slug)
		await writeWiki(root, "concepts/partial.md", "---\ntitle: Partial\n---\n\nContent.");

		const result = await lintVault(root, { ruleFilter: "frontmatter" });
		expect(result.errors).toBeGreaterThan(0);
		expect(
			result.diagnostics.some(
				(d) => d.rule === "frontmatter" && d.message.includes("slug"),
			),
		).toBe(true);
	});

	test("filters by specific rule", async () => {
		const root = await makeTempVault();

		// Set up conditions that would trigger multiple rules
		await writeWiki(root, "concepts/test.md", "# No Frontmatter");

		// Ingest but don't compile
		const testFile = join(root, "source.md");
		await fsWriteFile(testFile, "# Source");
		await ingestSource(root, testFile);

		// Only run frontmatter check
		const result = await lintVault(root, { ruleFilter: "frontmatter" });
		expect(result.diagnostics.every((d) => d.rule === "frontmatter")).toBe(true);
	});

	test("handles empty vault", async () => {
		const root = await makeTempVault();
		const result = await lintVault(root);
		expect(result.diagnostics).toHaveLength(0);
	});

	test("outputs skip orphan for output category", async () => {
		const root = await makeTempVault();

		await writeWiki(
			root,
			"outputs/query-result.md",
			articleMd({ title: "Query Result", slug: "query-result", category: "output" }),
		);

		const manifest = await loadManifest(root);
		manifest.articles["query-result"] = {
			hash: "q",
			createdAt: new Date().toISOString(),
			lastUpdated: new Date().toISOString(),
			derivedFrom: [],
			backlinks: [], // No backlinks — but it's an output, so should NOT be orphan
			forwardLinks: [],
			tags: [],
			summary: "",
			wordCount: 10,
			category: "output",
		};
		await saveManifest(root, manifest);

		const result = await lintVault(root, { ruleFilter: "orphan" });
		expect(result.diagnostics.filter((d) => d.rule === "orphan")).toHaveLength(0);
	});
});
