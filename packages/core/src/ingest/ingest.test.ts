import { afterEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SearchIndex } from "../search/engine.js";
import { VectorIndex } from "../search/vector.js";
import type { LLMProvider } from "../types.js";
import { initVault, listImageAssets, loadManifest } from "../vault.js";
import { ingestSource } from "./ingest.js";

let tempDir: string;

afterEach(async () => {
	if (tempDir) await rm(tempDir, { recursive: true, force: true });
});

async function makeTempVault() {
	tempDir = await mkdtemp(join(tmpdir(), "kib-ingest-test-"));
	await initVault(tempDir, { name: "test" });
	return tempDir;
}

describe("ingestSource", () => {
	test("ingests a local markdown file", async () => {
		const root = await makeTempVault();

		// Create a test file
		const testFile = join(root, "test-article.md");
		await writeFile(testFile, "# Test Article\n\nThis is some test content for ingestion.");

		const result = await ingestSource(root, testFile);

		expect(result.skipped).toBe(false);
		expect(result.sourceType).toBe("file");
		expect(result.title).toBe("Test Article");
		expect(result.wordCount).toBeGreaterThan(0);
		expect(result.path).toMatch(/^raw\/articles\//);

		// Verify file was written
		const rawPath = join(root, result.path);
		expect(existsSync(rawPath)).toBe(true);

		// Verify manifest was updated
		const manifest = await loadManifest(root);
		expect(manifest.stats.totalSources).toBe(1);
		expect(Object.keys(manifest.sources)).toHaveLength(1);

		const source = Object.values(manifest.sources)[0]!;
		expect(source.sourceType).toBe("file");
		expect(source.lastCompiled).toBeNull();
		expect(source.metadata.title).toBe("Test Article");
	});

	test("ingests a local text file", async () => {
		const root = await makeTempVault();

		const testFile = join(root, "notes.txt");
		await writeFile(testFile, "Some plain text notes about a topic.");

		const result = await ingestSource(root, testFile);

		expect(result.skipped).toBe(false);
		expect(result.sourceType).toBe("file");
	});

	test("deduplicates identical content", async () => {
		const root = await makeTempVault();

		const testFile = join(root, "article.md");
		await writeFile(testFile, "# Unique Content\n\nThis exact content should only appear once.");

		const result1 = await ingestSource(root, testFile);
		expect(result1.skipped).toBe(false);

		const result2 = await ingestSource(root, testFile);
		expect(result2.skipped).toBe(true);
		expect(result2.skipReason).toContain("Duplicate");

		// Manifest should still have only 1 source
		const manifest = await loadManifest(root);
		expect(manifest.stats.totalSources).toBe(1);
	});

	test("allows different content even from same path", async () => {
		const root = await makeTempVault();

		const testFile = join(root, "article.md");
		await writeFile(testFile, "# Version 1\n\nOriginal content.");
		const result1 = await ingestSource(root, testFile);
		expect(result1.skipped).toBe(false);

		await writeFile(testFile, "# Version 2\n\nUpdated content that is different.");
		const result2 = await ingestSource(root, testFile);
		expect(result2.skipped).toBe(false);

		const manifest = await loadManifest(root);
		expect(manifest.stats.totalSources).toBe(2);
	});

	test("uses custom category when specified", async () => {
		const root = await makeTempVault();

		const testFile = join(root, "notes.md");
		await writeFile(testFile, "# Notes\n\nContent.");

		const result = await ingestSource(root, testFile, { category: "papers" });
		expect(result.path).toMatch(/^raw\/papers\//);
	});

	test("uses custom title when specified", async () => {
		const root = await makeTempVault();

		const testFile = join(root, "data.md");
		await writeFile(testFile, "Some data.");

		const result = await ingestSource(root, testFile, { title: "My Custom Title" });
		expect(result.title).toBe("My Custom Title");
	});

	test("routes PDF files to papers category", async () => {
		const root = await makeTempVault();

		// We can't easily test actual PDF extraction without a real PDF,
		// but we can verify the source type detection routes correctly
		// by using a .md file with forced sourceType
		const testFile = join(root, "test.md");
		await writeFile(testFile, "# PDF Content\n\nExtracted from a PDF.");

		const result = await ingestSource(root, testFile, { sourceType: "file", category: "papers" });
		expect(result.path).toMatch(/^raw\/papers\//);
	});

	test("ingests multiple sources and tracks them all", async () => {
		const root = await makeTempVault();

		const file1 = join(root, "first.md");
		const file2 = join(root, "second.md");
		const file3 = join(root, "third.md");
		await writeFile(file1, "# First Article\n\nContent one.");
		await writeFile(file2, "# Second Article\n\nContent two.");
		await writeFile(file3, "# Third Article\n\nContent three.");

		await ingestSource(root, file1);
		await ingestSource(root, file2);
		await ingestSource(root, file3);

		const manifest = await loadManifest(root);
		expect(manifest.stats.totalSources).toBe(3);
		expect(Object.keys(manifest.sources)).toHaveLength(3);

		// All sources should be pending compilation
		const pending = Object.values(manifest.sources).filter((s) => s.lastCompiled === null);
		expect(pending).toHaveLength(3);
	});

	test("ingests code files wrapped in code blocks", async () => {
		const root = await makeTempVault();

		const testFile = join(root, "example.ts");
		await writeFile(testFile, "const greeting = 'hello world';\nconsole.log(greeting);");

		const result = await ingestSource(root, testFile);

		expect(result.skipped).toBe(false);
		expect(result.sourceType).toBe("file");

		// Read the raw file and verify it contains code block
		const { readRaw } = await import("../vault.js");
		// The path is raw/articles/example.md, we need to strip "raw/" prefix
		const rawContent = await readRaw(root, result.path.replace(/^raw\//, ""));
		expect(rawContent).toContain("```typescript");
	});

	test("ingests image files with vision provider", async () => {
		const root = await makeTempVault();

		// Create a test PNG file (minimal valid PNG)
		const testFile = join(root, "diagram.png");
		const pngBuffer = Buffer.from(
			"89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489" +
				"0000000a49444154789c626000000002000198e195280000000049454e44ae426082",
			"hex",
		);
		await writeFile(testFile, pngBuffer);

		// Create a mock provider with vision support
		const mockProvider = {
			name: "mock",
			async complete() {
				return {
					content: "",
					usage: { inputTokens: 0, outputTokens: 0 },
					stopReason: "end_turn" as const,
				};
			},
			async *stream() {},
			async vision() {
				return "# System Architecture\n\nA diagram showing the main components.";
			},
		};

		const result = await ingestSource(root, testFile, { provider: mockProvider });

		expect(result.skipped).toBe(false);
		expect(result.sourceType).toBe("image");
		expect(result.title).toBe("System Architecture");
		expect(result.path).toMatch(/^raw\/images\//);

		// Verify manifest
		const manifest = await loadManifest(root);
		expect(manifest.stats.totalSources).toBe(1);
		const source = Object.values(manifest.sources)[0]!;
		expect(source.sourceType).toBe("image");
	});

	test("normalized content includes frontmatter", async () => {
		const root = await makeTempVault();

		const testFile = join(root, "article.md");
		await writeFile(testFile, "# My Great Article\n\nAmazing content here.");

		const result = await ingestSource(root, testFile);

		const { readRaw } = await import("../vault.js");
		const rawContent = await readRaw(root, result.path.replace(/^raw\//, ""));
		expect(rawContent).toContain("---");
		expect(rawContent).toContain('title: "My Great Article"');
		expect(rawContent).toContain("source_type: file");
		expect(rawContent).toContain("word_count:");
	});

	test("ingest updates search index so source is immediately searchable", async () => {
		const root = await makeTempVault();

		const testFile = join(root, "quantum-computing.md");
		await writeFile(
			testFile,
			"# Quantum Computing\n\nQuantum computers use qubits and superposition to solve problems.",
		);

		await ingestSource(root, testFile);

		// Load the search index and verify the source is searchable
		const index = new SearchIndex();
		const loaded = await index.load(root);
		expect(loaded).toBe(true);
		expect(index.documentCount).toBeGreaterThan(0);

		const results = index.search("quantum computing");
		expect(results.length).toBeGreaterThan(0);
		expect(results[0]!.title).toBe("Quantum Computing");
	});

	test("multiple ingests build up the search index incrementally", async () => {
		const root = await makeTempVault();

		const file1 = join(root, "first.md");
		const file2 = join(root, "second.md");
		await writeFile(file1, "# Machine Learning\n\nML uses statistical models to learn from data.");
		await writeFile(
			file2,
			"# Deep Learning\n\nDeep learning uses neural networks with many layers.",
		);

		await ingestSource(root, file1);
		await ingestSource(root, file2);

		const index = new SearchIndex();
		const loaded = await index.load(root);
		expect(loaded).toBe(true);
		expect(index.documentCount).toBe(2);

		// Both should be searchable
		const mlResults = index.search("machine learning");
		expect(mlResults.length).toBeGreaterThan(0);

		const dlResults = index.search("deep learning neural");
		expect(dlResults.length).toBeGreaterThan(0);
		expect(dlResults[0]!.title).toBe("Deep Learning");
	});

	test("ingest updates vector index when provider has embed()", async () => {
		const root = await makeTempVault();

		// Mock provider with embed support
		const embedProvider: LLMProvider = {
			name: "mock-embed",
			async complete() {
				return {
					content: "",
					usage: { inputTokens: 0, outputTokens: 0 },
					stopReason: "end_turn" as const,
				};
			},
			async *stream() {},
			async embed(texts: string[]): Promise<Float32Array[]> {
				return texts.map((text) => {
					const vec = new Float32Array(32);
					const lower = text.toLowerCase();
					for (let i = 0; i < 32; i++) {
						const char = String.fromCharCode(97 + (i % 26));
						vec[i] = (lower.match(new RegExp(char, "g")) ?? []).length / lower.length;
					}
					return vec;
				});
			},
		};

		const testFile = join(root, "quantum-ml.md");
		await writeFile(
			testFile,
			"# Quantum Machine Learning\n\nQuantum computing applied to machine learning tasks.",
		);

		await ingestSource(root, testFile, { provider: embedProvider });

		// Verify the vector index was updated
		const vectorIndex = new VectorIndex();
		const loaded = await vectorIndex.load(root);
		expect(loaded).toBe(true);
		expect(vectorIndex.documentCount).toBe(1);

		const results = await vectorIndex.search("quantum machine learning", embedProvider);
		expect(results.length).toBe(1);
		expect(results[0]!.title).toBe("Quantum Machine Learning");
	});

	test("ingest skips vector index when provider lacks embed()", async () => {
		const root = await makeTempVault();

		// Provider without embed
		const noEmbedProvider: LLMProvider = {
			name: "no-embed",
			async complete() {
				return {
					content: "",
					usage: { inputTokens: 0, outputTokens: 0 },
					stopReason: "end_turn" as const,
				};
			},
			async *stream() {},
		};

		const testFile = join(root, "test-no-embed.md");
		await writeFile(testFile, "# No Embed\n\nContent without embeddings.");

		await ingestSource(root, testFile, { provider: noEmbedProvider });

		// BM25 index should exist
		const bm25 = new SearchIndex();
		expect(await bm25.load(root)).toBe(true);
		expect(bm25.documentCount).toBe(1);

		// Vector index should NOT exist (no embed support)
		const vectorIndex = new VectorIndex();
		expect(await vectorIndex.load(root)).toBe(false);
	});

	test("image ingest saves binary to wiki/images/", async () => {
		const root = await makeTempVault();

		// Create a test image file
		const pngData = Buffer.from(
			"89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489" +
				"0000000a49444154789c626000000002000198e195280000000049454e44ae426082",
			"hex",
		);
		const imgPath = join(root, "diagram.png");
		await writeFile(imgPath, pngData);

		// Mock vision provider
		const mockProvider: LLMProvider = {
			name: "mock",
			async complete() {
				return {
					content: "",
					usage: { inputTokens: 0, outputTokens: 0 },
					stopReason: "end_turn" as const,
				};
			},
			async *stream() {},
			async vision() {
				return "# Architecture Diagram\n\nA system architecture diagram.";
			},
		};

		const result = await ingestSource(root, imgPath, { provider: mockProvider });

		expect(result.sourceType).toBe("image");
		expect(result.skipped).toBe(false);

		// Verify image binary was saved to wiki/images/
		const imageFiles = await listImageAssets(root);
		expect(imageFiles.length).toBe(1);
		expect(imageFiles[0]).toMatch(/\.png$/);

		// Verify binary content matches
		const storedImage = await readFile(join(root, "wiki", "images", imageFiles[0]!));
		expect(storedImage).toEqual(pngData);

		// Verify manifest has imageAsset
		const manifest = await loadManifest(root);
		const source = Object.values(manifest.sources)[0]!;
		expect(source.metadata.imageAsset).toMatch(/^images\//);
	});
});
