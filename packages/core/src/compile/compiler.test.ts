import { afterEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ingestSource } from "../ingest/ingest.js";
import type { CompletionParams, CompletionResult, LLMProvider, StreamChunk } from "../types.js";
import { initVault, loadManifest, readWiki } from "../vault.js";
import { compileVault } from "./compiler.js";

let tempDir: string;

afterEach(async () => {
	if (tempDir) await rm(tempDir, { recursive: true, force: true });
});

async function makeTempVault() {
	tempDir = await mkdtemp(join(tmpdir(), "kib-compile-test-"));
	await initVault(tempDir, { name: "test" });
	return tempDir;
}

/**
 * Create a mock LLM provider that returns canned responses.
 */
function createMockProvider(responses: string[]): LLMProvider {
	let callIndex = 0;
	return {
		name: "mock",
		async complete(_params: CompletionParams): Promise<CompletionResult> {
			const content = responses[callIndex] ?? "[]";
			callIndex++;
			return {
				content,
				usage: { inputTokens: 100, outputTokens: 200 },
				stopReason: "end_turn",
			};
		},
		async *stream(): AsyncIterable<StreamChunk> {
			yield { type: "text", text: "stream not used in tests" };
		},
	};
}

describe("compileVault", () => {
	test("compiles a single source into articles", async () => {
		const root = await makeTempVault();

		// Ingest a test file
		const testFile = join(root, "source.md");
		await writeFile(
			testFile,
			"# Transformer Architecture\n\nThe transformer is a neural network architecture.\n\nIt uses self-attention mechanisms.",
		);
		await ingestSource(root, testFile);

		// Mock provider returns a compile result
		const mockResponse = JSON.stringify([
			{
				op: "create",
				path: "wiki/concepts/transformer-architecture.md",
				content: `---
title: Transformer Architecture
slug: transformer-architecture
category: concept
tags: [deep-learning, nlp]
sources:
  - raw/articles/transformer-architecture.md
created: 2026-04-05
updated: 2026-04-05
summary: The transformer replaces recurrence with self-attention.
---

# Transformer Architecture

The transformer is a neural network architecture that replaces recurrence with self-attention mechanisms, enabling parallel training and superior sequence modeling.

## Key Features

- **Self-Attention**: Allows the model to weigh the importance of different positions
- **Parallelizable**: Unlike RNNs, transformers can process all positions simultaneously
- **Scalable**: Performance improves predictably with more compute

See also: [[attention-mechanisms]], [[positional-encoding]]`,
			},
		]);

		const provider = createMockProvider([mockResponse]);
		const config = (await import("../vault.js")).loadConfig;
		const vaultConfig = await config(root);

		const result = await compileVault(root, provider, vaultConfig);

		expect(result.sourcesCompiled).toBe(1);
		expect(result.articlesCreated).toBe(1);
		expect(result.articlesUpdated).toBe(0);

		// Verify the article was written
		const article = await readWiki(root, "concepts/transformer-architecture.md");
		expect(article).toContain("Transformer Architecture");
		expect(article).toContain("self-attention");

		// Verify manifest was updated
		const manifest = await loadManifest(root);
		expect(manifest.vault.lastCompiled).not.toBeNull();
		expect(manifest.stats.totalArticles).toBeGreaterThan(0);
		expect(manifest.articles["transformer-architecture"]).toBeDefined();
		expect(manifest.articles["transformer-architecture"]!.category).toBe("concept");
		expect(manifest.articles["transformer-architecture"]!.forwardLinks).toContain(
			"attention-mechanisms",
		);

		// Verify INDEX.md was generated
		expect(existsSync(join(root, "wiki", "INDEX.md"))).toBe(true);
		const index = await readWiki(root, "INDEX.md");
		expect(index).toContain("Transformer Architecture");
		expect(index).toContain("## Concepts");

		// Verify GRAPH.md was generated
		expect(existsSync(join(root, "wiki", "GRAPH.md"))).toBe(true);
		const graph = await readWiki(root, "GRAPH.md");
		expect(graph).toContain("transformer-architecture");
	});

	test("skips already-compiled sources", async () => {
		const root = await makeTempVault();

		const testFile = join(root, "source.md");
		await writeFile(testFile, "# Test\n\nContent.");
		await ingestSource(root, testFile);

		// First compile
		const mockResponse = JSON.stringify([
			{
				op: "create",
				path: "wiki/concepts/test.md",
				content:
					"---\ntitle: Test\nslug: test\ncategory: concept\ntags: []\nsummary: A test.\n---\n\n# Test\n\nContent.",
			},
		]);
		const provider1 = createMockProvider([mockResponse]);
		const vaultConfig = await (await import("../vault.js")).loadConfig(root);
		await compileVault(root, provider1, vaultConfig);

		// Second compile — should skip (no new sources)
		const provider2 = createMockProvider([]);
		const result = await compileVault(root, provider2, vaultConfig);
		expect(result.sourcesCompiled).toBe(0);
	});

	test("recompiles when force is true", async () => {
		const root = await makeTempVault();

		const testFile = join(root, "source.md");
		await writeFile(testFile, "# Test\n\nContent.");
		await ingestSource(root, testFile);

		// First compile
		const mockResponse = JSON.stringify([
			{
				op: "create",
				path: "wiki/concepts/test.md",
				content:
					"---\ntitle: Test\nslug: test\ncategory: concept\ntags: []\nsummary: A test.\n---\n\n# Test\n\nContent.",
			},
		]);
		const provider1 = createMockProvider([mockResponse]);
		const vaultConfig = await (await import("../vault.js")).loadConfig(root);
		await compileVault(root, provider1, vaultConfig);

		// Force recompile
		const provider2 = createMockProvider([
			JSON.stringify([
				{
					op: "update",
					path: "wiki/concepts/test.md",
					content:
						"---\ntitle: Test\nslug: test\ncategory: concept\ntags: []\nsummary: Updated.\n---\n\n# Test\n\nUpdated content.",
				},
			]),
		]);
		const result = await compileVault(root, provider2, vaultConfig, {
			force: true,
		});
		expect(result.sourcesCompiled).toBe(1);
		expect(result.articlesUpdated).toBe(1);
	});

	test("dry run does not write files", async () => {
		const root = await makeTempVault();

		const testFile = join(root, "source.md");
		await writeFile(testFile, "# Test\n\nContent.");
		await ingestSource(root, testFile);

		const mockResponse = JSON.stringify([
			{
				op: "create",
				path: "wiki/concepts/test.md",
				content: "---\ntitle: Test\nslug: test\ncategory: concept\n---\n\n# Test",
			},
		]);
		const provider = createMockProvider([mockResponse]);
		const vaultConfig = await (await import("../vault.js")).loadConfig(root);

		const result = await compileVault(root, provider, vaultConfig, {
			dryRun: true,
		});

		expect(result.sourcesCompiled).toBe(1);
		expect(result.articlesCreated).toBe(1);

		// File should NOT exist
		expect(existsSync(join(root, "wiki", "concepts", "test.md"))).toBe(false);
	});

	test("handles empty response from LLM", async () => {
		const root = await makeTempVault();

		const testFile = join(root, "source.md");
		await writeFile(testFile, "# Test\n\nContent.");
		await ingestSource(root, testFile);

		const provider = createMockProvider(["[]"]);
		const vaultConfig = await (await import("../vault.js")).loadConfig(root);

		const result = await compileVault(root, provider, vaultConfig);
		expect(result.sourcesCompiled).toBe(1);
		expect(result.articlesCreated).toBe(0);
	});

	test("handles no pending sources", async () => {
		const root = await makeTempVault();
		const provider = createMockProvider([]);
		const vaultConfig = await (await import("../vault.js")).loadConfig(root);

		const result = await compileVault(root, provider, vaultConfig);
		expect(result.sourcesCompiled).toBe(0);
	});

	test("returns token usage in compile result", async () => {
		const root = await makeTempVault();

		const testFile = join(root, "source.md");
		await writeFile(testFile, "# Test\n\nContent about tokens.");
		await ingestSource(root, testFile);

		const mockResponse = JSON.stringify([
			{
				op: "create",
				path: "wiki/concepts/test.md",
				content:
					"---\ntitle: Test\nslug: test\ncategory: concept\ntags: []\nsummary: A test.\n---\n\n# Test\n\nContent.",
			},
		]);
		const provider = createMockProvider([mockResponse]);
		const vaultConfig = await (await import("../vault.js")).loadConfig(root);

		const result = await compileVault(root, provider, vaultConfig);
		expect(result.tokenUsage).toBeDefined();
		expect(result.tokenUsage!.totalInputTokens).toBe(100);
		expect(result.tokenUsage!.totalOutputTokens).toBe(200);
		expect(result.tokenUsage!.perSource).toHaveLength(1);
		expect(result.tokenUsage!.perSource[0]!.sourceId).toBeDefined();
		expect(result.tokenUsage!.perSource[0]!.cached).toBe(false);
	});

	test("uses compile cache on second run with force", async () => {
		const root = await makeTempVault();

		const testFile = join(root, "source.md");
		await writeFile(testFile, "# Cached Test\n\nContent for caching.");
		await ingestSource(root, testFile);

		// LLM returns empty array so no articles are produced, keeping prompt stable
		const emptyResponse = "[]";

		// First compile — populates cache
		const provider1 = createMockProvider([emptyResponse]);
		const vaultConfig = await (await import("../vault.js")).loadConfig(root);
		vaultConfig.compile.auto_index = false;
		vaultConfig.compile.auto_graph = false;
		await compileVault(root, provider1, vaultConfig);

		// Second compile with force — should hit cache
		const provider2 = createMockProvider([]); // empty — should never be called
		const result = await compileVault(root, provider2, vaultConfig, { force: true });
		expect(result.sourcesCompiled).toBe(1);
		expect(result.tokenUsage!.perSource[0]!.cached).toBe(true);
	});

	test("retries on malformed LLM output", async () => {
		const root = await makeTempVault();

		const testFile = join(root, "source.md");
		await writeFile(testFile, "# Retry Test\n\nContent.");
		await ingestSource(root, testFile);

		let callCount = 0;
		const provider: LLMProvider = {
			name: "mock-retry",
			async complete(_params: CompletionParams): Promise<CompletionResult> {
				callCount++;
				if (callCount === 1) {
					// First call returns malformed output
					return {
						content: "Here is the result: not valid json at all",
						usage: { inputTokens: 50, outputTokens: 30 },
						stopReason: "end_turn",
					};
				}
				// Second call returns valid output
				return {
					content: JSON.stringify([
						{
							op: "create",
							path: "wiki/concepts/retry-test.md",
							content:
								"---\ntitle: Retry Test\nslug: retry-test\ncategory: concept\ntags: []\nsummary: Retry.\n---\n\n# Retry Test\n\nRetried.",
						},
					]),
					usage: { inputTokens: 60, outputTokens: 40 },
					stopReason: "end_turn",
				};
			},
			async *stream(): AsyncIterable<StreamChunk> {
				yield { type: "text", text: "" };
			},
		};

		const vaultConfig = await (await import("../vault.js")).loadConfig(root);
		const result = await compileVault(root, provider, vaultConfig);

		expect(result.sourcesCompiled).toBe(1);
		expect(result.articlesCreated).toBe(1);
		expect(callCount).toBe(2); // first call failed, second succeeded
	});

	test("compiles sources in parallel when configured", async () => {
		const root = await makeTempVault();

		const file1 = join(root, "parallel1.md");
		const file2 = join(root, "parallel2.md");
		await writeFile(file1, "# Parallel One\n\nFirst parallel content.");
		await writeFile(file2, "# Parallel Two\n\nSecond parallel content.");
		await ingestSource(root, file1);
		await ingestSource(root, file2);

		const provider = createMockProvider([
			JSON.stringify([
				{
					op: "create",
					path: "wiki/concepts/parallel-one.md",
					content:
						"---\ntitle: Parallel One\nslug: parallel-one\ncategory: concept\ntags: []\nsummary: First.\n---\n\n# Parallel One\n\nFirst.",
				},
			]),
			JSON.stringify([
				{
					op: "create",
					path: "wiki/concepts/parallel-two.md",
					content:
						"---\ntitle: Parallel Two\nslug: parallel-two\ncategory: concept\ntags: []\nsummary: Second.\n---\n\n# Parallel Two\n\nSecond.",
				},
			]),
		]);

		const vaultConfig = await (await import("../vault.js")).loadConfig(root);
		// Enable parallel compilation
		vaultConfig.compile.parallel = true;
		vaultConfig.compile.max_parallel = 2;

		const result = await compileVault(root, provider, vaultConfig);
		expect(result.sourcesCompiled).toBe(2);
		expect(result.articlesCreated).toBe(2);
	});

	test("compiles multiple sources", async () => {
		const root = await makeTempVault();

		const file1 = join(root, "article1.md");
		const file2 = join(root, "article2.md");
		await writeFile(file1, "# Article One\n\nFirst article content.");
		await writeFile(file2, "# Article Two\n\nSecond article content.");
		await ingestSource(root, file1);
		await ingestSource(root, file2);

		const provider = createMockProvider([
			JSON.stringify([
				{
					op: "create",
					path: "wiki/concepts/article-one.md",
					content:
						"---\ntitle: Article One\nslug: article-one\ncategory: concept\ntags: []\nsummary: First.\n---\n\n# Article One\n\nCompiled first.",
				},
			]),
			JSON.stringify([
				{
					op: "create",
					path: "wiki/concepts/article-two.md",
					content:
						"---\ntitle: Article Two\nslug: article-two\ncategory: concept\ntags: []\nsummary: Second.\n---\n\n# Article Two\n\nCompiled second.",
				},
			]),
		]);
		const vaultConfig = await (await import("../vault.js")).loadConfig(root);

		const result = await compileVault(root, provider, vaultConfig);
		expect(result.sourcesCompiled).toBe(2);
		expect(result.articlesCreated).toBe(2);

		const manifest = await loadManifest(root);
		expect(manifest.stats.totalArticles).toBe(2);
	});
});
