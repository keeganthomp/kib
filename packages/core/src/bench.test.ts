/**
 * Performance benchmarks: measure search latency, compile throughput, and cold start.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compileVault } from "./compile/compiler.js";
import { ingestSource } from "./ingest/ingest.js";
import { SearchIndex } from "./search/engine.js";
import type { CompletionParams, CompletionResult, LLMProvider, StreamChunk } from "./types.js";
import { initVault, loadConfig, loadManifest } from "./vault.js";

let tempDir: string;

afterEach(async () => {
	if (tempDir) await rm(tempDir, { recursive: true, force: true });
});

async function makeTempDir() {
	tempDir = await mkdtemp(join(tmpdir(), "kib-bench-"));
	return tempDir;
}

function createMockProvider(): LLMProvider {
	return {
		name: "mock",
		async complete(_params: CompletionParams): Promise<CompletionResult> {
			return {
				content: "[]",
				usage: { inputTokens: 100, outputTokens: 50 },
				stopReason: "end_turn",
			};
		},
		async *stream(): AsyncIterable<StreamChunk> {
			yield { type: "text", text: "" };
		},
	};
}

function generateArticle(index: number): string {
	const words = [
		"neural",
		"network",
		"attention",
		"transformer",
		"embedding",
		"gradient",
		"optimization",
		"regularization",
		"convolution",
		"recurrent",
		"encoder",
		"decoder",
		"tokenizer",
		"architecture",
		"inference",
	];
	const tags = words.slice(index % 5, (index % 5) + 3);
	const bodyWords = Array.from({ length: 200 }, (_, i) => words[(index + i) % words.length]).join(
		" ",
	);

	return `---
title: "Article ${index}"
slug: article-${index}
category: concept
tags: [${tags.join(", ")}]
sources: []
created: "2026-01-01"
updated: "2026-01-01"
summary: "Article about ${words[index % words.length]}."
---

# Article ${index}: ${words[index % words.length]}

${bodyWords}

See also: [[article-${(index + 1) % 50}]]
`;
}

describe("Performance benchmarks", () => {
	test("vault init < 50ms", async () => {
		const root = await makeTempDir();
		const start = performance.now();
		await initVault(root, { name: "bench" });
		const elapsed = performance.now() - start;

		expect(elapsed).toBeLessThan(50);
		console.log(`  vault init: ${elapsed.toFixed(1)}ms`);
	});

	test("manifest load < 10ms", async () => {
		const root = await makeTempDir();
		await initVault(root, { name: "bench" });

		const start = performance.now();
		await loadManifest(root);
		const elapsed = performance.now() - start;

		expect(elapsed).toBeLessThan(10);
		console.log(`  manifest load: ${elapsed.toFixed(1)}ms`);
	});

	test("search index build + query < 100ms for 50 articles", async () => {
		const root = await makeTempDir();
		await initVault(root, { name: "bench" });

		// Write 50 articles to wiki
		for (let i = 0; i < 50; i++) {
			const { writeWiki } = await import("./vault.js");
			await writeWiki(root, `concepts/article-${i}.md`, generateArticle(i));
		}

		// Build search index
		const index = new SearchIndex();
		const buildStart = performance.now();
		await index.build(root);
		const buildElapsed = performance.now() - buildStart;

		expect(buildElapsed).toBeLessThan(100);
		console.log(`  search index build (50 articles): ${buildElapsed.toFixed(1)}ms`);

		// Search queries
		const queries = ["attention mechanism", "transformer encoder", "gradient optimization"];
		const queryTimes: number[] = [];

		for (const q of queries) {
			const start = performance.now();
			const results = index.search(q);
			const elapsed = performance.now() - start;
			queryTimes.push(elapsed);
			expect(results.length).toBeGreaterThan(0);
		}

		const avgQuery = queryTimes.reduce((a, b) => a + b, 0) / queryTimes.length;
		expect(avgQuery).toBeLessThan(10);
		console.log(`  search query avg (50 articles): ${avgQuery.toFixed(2)}ms`);
	});

	test("ingest 10 files < 500ms", async () => {
		const root = await makeTempDir();
		await initVault(root, { name: "bench" });

		// Create 10 test files
		const files: string[] = [];
		for (let i = 0; i < 10; i++) {
			const path = join(root, `source-${i}.md`);
			await writeFile(
				path,
				`# Source ${i}\n\nContent for source ${i}. This has enough words to be meaningful.`,
			);
			files.push(path);
		}

		const start = performance.now();
		for (const file of files) {
			await ingestSource(root, file);
		}
		const elapsed = performance.now() - start;

		expect(elapsed).toBeLessThan(500);
		console.log(`  ingest 10 files: ${elapsed.toFixed(1)}ms`);

		const manifest = await loadManifest(root);
		expect(manifest.stats.totalSources).toBe(10);
	});

	test("compile no-op < 20ms (no pending sources)", async () => {
		const root = await makeTempDir();
		await initVault(root, { name: "bench" });
		const config = await loadConfig(root);
		const provider = createMockProvider();

		const start = performance.now();
		const result = await compileVault(root, provider, config);
		const elapsed = performance.now() - start;

		expect(result.sourcesCompiled).toBe(0);
		expect(elapsed).toBeLessThan(20);
		console.log(`  compile no-op: ${elapsed.toFixed(1)}ms`);
	});
});
