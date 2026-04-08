/**
 * End-to-end test: full init -> ingest -> compile -> search -> query -> lint lifecycle.
 * Uses a mock LLM provider so no API keys are needed.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compileVault } from "./compile/compiler.js";
import { ingestSource } from "./ingest/ingest.js";
import { validateManifestIntegrity } from "./integrity.js";
import { lintVault } from "./lint/lint.js";
import { queryVault } from "./query/query.js";
import { SearchIndex } from "./search/engine.js";
import type { CompletionParams, CompletionResult, LLMProvider, StreamChunk } from "./types.js";
import { initVault, loadConfig, loadManifest, readWiki } from "./vault.js";

let tempDir: string;

afterEach(async () => {
	if (tempDir) await rm(tempDir, { recursive: true, force: true });
});

async function makeTempDir() {
	tempDir = await mkdtemp(join(tmpdir(), "kib-e2e-"));
	return tempDir;
}

// ─── Mock LLM provider ─────────────────────────────────────────

function createMockProvider(responseMap: Record<string, string>): LLMProvider {
	const defaultResponse = "No relevant information found.";
	return {
		name: "mock",
		async complete(params: CompletionParams): Promise<CompletionResult> {
			// Check if any key in responseMap matches part of the user message
			const userMsg = params.messages[params.messages.length - 1]?.content ?? "";
			let content = defaultResponse;
			for (const [key, value] of Object.entries(responseMap)) {
				if (userMsg.includes(key) || params.system.includes(key)) {
					content = value;
					break;
				}
			}
			return {
				content,
				usage: { inputTokens: 100, outputTokens: 200 },
				stopReason: "end_turn",
			};
		},
		async *stream(params: CompletionParams): AsyncIterable<StreamChunk> {
			const result = await this.complete(params);
			yield { type: "text", text: result.content };
			yield { type: "usage", usage: result.usage };
		},
	};
}

// ─── Mock article responses ────────────────────────────────────

const ARTICLE_ATTENTION = `---
title: "Attention Mechanism"
slug: attention-mechanism
category: concept
tags: [deep-learning, nlp, attention]
sources: []
created: "2026-01-01"
updated: "2026-01-01"
summary: "Core attention mechanism enabling models to focus on relevant input parts."
---

# Attention Mechanism

The attention mechanism allows neural networks to focus on relevant parts of the input when producing output. It computes weighted sums of value vectors, where weights are derived from query-key compatibility.

## Types

- **Self-attention**: queries, keys, and values all come from the same sequence
- **Cross-attention**: queries from one sequence, keys/values from another

## See Also

- [[transformer-architecture]]`;

const ARTICLE_TRANSFORMER = `---
title: "Transformer Architecture"
slug: transformer-architecture
category: concept
tags: [deep-learning, nlp, transformer]
sources: []
created: "2026-01-01"
updated: "2026-01-01"
summary: "Neural network architecture based on self-attention, replacing recurrence."
---

# Transformer Architecture

The transformer architecture replaces recurrent layers with self-attention, enabling parallel training and superior sequence modeling.

## Components

- Multi-head [[attention-mechanism]]
- Positional encoding
- Feed-forward layers
- Layer normalization

## See Also

- [[attention-mechanism]]`;

const COMPILE_RESPONSE_1 = JSON.stringify([
	{
		op: "create",
		path: "wiki/concepts/attention-mechanism.md",
		content: ARTICLE_ATTENTION,
	},
]);

const COMPILE_RESPONSE_2 = JSON.stringify([
	{
		op: "create",
		path: "wiki/concepts/transformer-architecture.md",
		content: ARTICLE_TRANSFORMER,
	},
]);

const QUERY_RESPONSE =
	"The attention mechanism computes weighted sums of value vectors using query-key compatibility scores. It enables models to focus on relevant parts of the input sequence. [Source: attention-mechanism]";

const ENRICHMENT_RESPONSE = JSON.stringify([]);

// ─── E2E Tests ─────────────────────────────────────────────────

describe("E2E: full vault lifecycle", () => {
	test("init -> ingest -> compile -> search -> query -> lint", async () => {
		const root = await makeTempDir();

		// ── Step 1: Init ──────────────────────────────────────
		const { manifest, config } = await initVault(root, { name: "e2e-test" });
		expect(manifest.vault.name).toBe("e2e-test");
		expect(manifest.version).toBe("1");
		expect(existsSync(join(root, ".kb"))).toBe(true);
		expect(existsSync(join(root, "raw"))).toBe(true);
		expect(existsSync(join(root, "wiki"))).toBe(true);
		expect(existsSync(join(root, "inbox"))).toBe(true);

		// ── Step 2: Ingest two sources ────────────────────────
		const file1 = join(root, "attention.md");
		await writeFile(
			file1,
			"# Attention Mechanism\n\nThe attention mechanism allows models to focus on relevant parts of the input.",
		);

		const file2 = join(root, "transformers.md");
		await writeFile(
			file2,
			"# Transformer Architecture\n\nThe transformer uses self-attention to process sequences in parallel.",
		);

		const ingest1 = await ingestSource(root, file1);
		expect(ingest1.skipped).toBe(false);
		expect(ingest1.sourceType).toBe("file");
		expect(ingest1.path).toContain("raw/");

		const ingest2 = await ingestSource(root, file2);
		expect(ingest2.skipped).toBe(false);

		// Verify manifest updated
		const postIngestManifest = await loadManifest(root);
		expect(postIngestManifest.stats.totalSources).toBe(2);

		// Dedup: re-ingesting same content should skip
		const dup = await ingestSource(root, file1);
		expect(dup.skipped).toBe(true);
		expect(dup.skipReason).toContain("Duplicate");

		// ── Step 3: Compile ───────────────────────────────────
		const provider = createMockProvider({
			"Attention Mechanism": COMPILE_RESPONSE_1,
			"Transformer Architecture": COMPILE_RESPONSE_2,
			enrich: ENRICHMENT_RESPONSE,
		});

		const compileResult = await compileVault(root, provider, config);
		expect(compileResult.sourcesCompiled).toBe(2);
		expect(compileResult.articlesCreated).toBe(2);

		// Verify articles on disk
		const article1 = await readWiki(root, "concepts/attention-mechanism.md");
		expect(article1).toContain("Attention Mechanism");
		expect(article1).toContain("Self-attention");

		const article2 = await readWiki(root, "concepts/transformer-architecture.md");
		expect(article2).toContain("Transformer Architecture");
		expect(article2).toContain("[[attention-mechanism]]");

		// Verify INDEX.md and GRAPH.md
		expect(existsSync(join(root, "wiki", "INDEX.md"))).toBe(true);
		expect(existsSync(join(root, "wiki", "GRAPH.md"))).toBe(true);

		const index = await readWiki(root, "INDEX.md");
		expect(index).toContain("Attention Mechanism");
		expect(index).toContain("Transformer Architecture");

		// Verify manifest stats
		const postCompileManifest = await loadManifest(root);
		expect(postCompileManifest.stats.totalArticles).toBe(2);
		expect(postCompileManifest.vault.lastCompiled).not.toBeNull();
		expect(postCompileManifest.articles["attention-mechanism"]).toBeDefined();
		expect(postCompileManifest.articles["transformer-architecture"]).toBeDefined();

		// Verify token usage tracked
		expect(compileResult.tokenUsage).toBeDefined();
		expect(compileResult.tokenUsage!.totalInputTokens).toBeGreaterThan(0);

		// ── Step 4: Incremental compile (no-op) ───────────────
		const noopResult = await compileVault(root, provider, config);
		expect(noopResult.sourcesCompiled).toBe(0);

		// ── Step 5: Search ────────────────────────────────────
		const searchIndex = new SearchIndex();
		await searchIndex.build(root);

		const searchResults = searchIndex.search("attention mechanism");
		expect(searchResults.length).toBeGreaterThan(0);
		expect(searchResults[0]!.title).toContain("Attention");

		// Phrase search
		const phraseResults = searchIndex.search('"self-attention"');
		expect(phraseResults.length).toBeGreaterThan(0);

		// Unrelated term should score lower than relevant term
		const weakResults = searchIndex.search("zygomorphic paleontology");
		expect(weakResults.length).toBeLessThanOrEqual(searchResults.length);

		// ── Step 6: Query (RAG) ───────────────────────────────
		const queryProvider = createMockProvider({
			"": QUERY_RESPONSE,
		});

		const queryResult = await queryVault(root, "How does attention work?", queryProvider, config);
		expect(queryResult.answer).toContain("attention");

		// ── Step 7: Lint ──────────────────────────────────────
		const lintResult = await lintVault(root);
		// Should find missing articles for wikilinks (transformer-architecture links to attention-mechanism and vice versa)
		// Both exist, so no "missing" issues for those
		expect(lintResult.diagnostics).toBeDefined();

		// ── Step 8: Manifest integrity ────────────────────────
		const finalManifest = await loadManifest(root);
		const integrityIssues = await validateManifestIntegrity(root, finalManifest);
		// Stats might be slightly off due to INDEX.md/GRAPH.md not being in articles
		const errors = integrityIssues.filter((i) => i.severity === "error");
		expect(errors.length).toBe(0); // No missing files
	});

	test("dry-run ingest and compile do not modify vault", async () => {
		const root = await makeTempDir();
		await initVault(root, { name: "dry-run-test" });

		const file = join(root, "test.md");
		await writeFile(file, "# Test\n\nSome content.");

		// Dry-run ingest
		const dryIngest = await ingestSource(root, file, { dryRun: true });
		expect(dryIngest.skipped).toBe(false);
		expect(dryIngest.path).toContain("raw/");

		// Manifest should still have 0 sources
		const manifest = await loadManifest(root);
		expect(manifest.stats.totalSources).toBe(0);

		// Real ingest
		await ingestSource(root, file);
		const manifest2 = await loadManifest(root);
		expect(manifest2.stats.totalSources).toBe(1);

		// Dry-run compile
		const provider = createMockProvider({
			"": JSON.stringify([
				{
					op: "create",
					path: "wiki/concepts/test.md",
					content:
						'---\ntitle: Test\nslug: test\ncategory: concept\ntags: []\nsources: []\ncreated: "2026-01-01"\nupdated: "2026-01-01"\nsummary: A test.\n---\n\n# Test\n\nContent.',
				},
			]),
		});

		const config = await loadConfig(root);
		const dryCompile = await compileVault(root, provider, config, { dryRun: true });
		expect(dryCompile.sourcesCompiled).toBe(1);
		expect(dryCompile.articlesCreated).toBe(1);

		// But no article on disk
		expect(existsSync(join(root, "wiki", "concepts", "test.md"))).toBe(false);

		// Manifest not updated
		const manifest3 = await loadManifest(root);
		expect(manifest3.vault.lastCompiled).toBeNull();
	});

	test("force compile creates backup", async () => {
		const root = await makeTempDir();
		await initVault(root, { name: "backup-test" });

		const file = join(root, "test.md");
		await writeFile(file, "# Test\n\nContent.");
		await ingestSource(root, file);

		const provider = createMockProvider({
			"": JSON.stringify([
				{
					op: "create",
					path: "wiki/concepts/test.md",
					content:
						'---\ntitle: Test\nslug: test\ncategory: concept\ntags: []\nsources: []\ncreated: "2026-01-01"\nupdated: "2026-01-01"\nsummary: A test.\n---\n\n# Test\n\nContent.',
				},
			]),
		});

		const config = await loadConfig(root);

		// First compile
		await compileVault(root, provider, config);

		// Force recompile — should create backup
		await compileVault(root, provider, config, { force: true });

		// Check backup exists
		expect(existsSync(join(root, ".kb", "backups"))).toBe(true);
		const { listBackups } = await import("./backup.js");
		const backups = await listBackups(root);
		expect(backups.length).toBeGreaterThan(0);
	});
});
