import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LLMProvider } from "../types.js";
import { initVault, writeWiki } from "../vault.js";
import { VectorIndex } from "./vector.js";

let tempDir: string;

afterEach(async () => {
	if (tempDir) await rm(tempDir, { recursive: true, force: true });
});

async function makeTempVault() {
	tempDir = await mkdtemp(join(tmpdir(), "kib-vector-test-"));
	await initVault(tempDir, { name: "test" });
	return tempDir;
}

function articleMd(title: string, content: string): string {
	return `---\ntitle: ${title}\nslug: ${title.toLowerCase().replace(/\s+/g, "-")}\n---\n\n# ${title}\n\n${content}`;
}

/**
 * Create a fake embedding provider that produces deterministic embeddings
 * based on keyword overlap. This allows testing search quality without real API calls.
 */
function createMockEmbedProvider(): LLMProvider {
	// Keywords we care about for test scenarios
	const keywords = [
		"transformer",
		"attention",
		"neural",
		"network",
		"cnn",
		"convolution",
		"image",
		"language",
		"model",
		"scaling",
		"compute",
		"data",
		"training",
		"deep",
		"learning",
		"self",
		"architecture",
		"layer",
		"performance",
		"quantum",
		"photon",
		"electron",
		"wave",
		"particle",
		"physics",
		"biology",
		"cell",
		"protein",
		"dna",
		"gene",
		"machine",
		"intelligence",
	];

	function textToEmbedding(text: string): Float32Array {
		const lower = text.toLowerCase();
		const dims = 64; // Small dims for fast tests
		const vec = new Float32Array(dims);

		// Set dimensions based on keyword presence and frequency
		for (let i = 0; i < keywords.length && i < dims; i++) {
			const keyword = keywords[i]!;
			const count = (lower.match(new RegExp(keyword, "g")) ?? []).length;
			vec[i] = count > 0 ? 0.3 + Math.min(count * 0.15, 0.7) : 0;
		}

		// Fill remaining dims with character-frequency based values for differentiation
		for (let i = keywords.length; i < dims; i++) {
			const charIdx = i - keywords.length;
			const char = String.fromCharCode(97 + (charIdx % 26));
			const freq = (lower.match(new RegExp(char, "g")) ?? []).length;
			vec[i] = freq / Math.max(lower.length, 1);
		}

		return vec;
	}

	return {
		name: "mock",
		async complete() {
			return { content: "", usage: { inputTokens: 0, outputTokens: 0 }, stopReason: "end_turn" };
		},
		async *stream() {},
		async embed(texts: string[]): Promise<Float32Array[]> {
			return texts.map(textToEmbedding);
		},
	};
}

describe("VectorIndex", () => {
	test("builds index from wiki files", async () => {
		const root = await makeTempVault();
		const provider = createMockEmbedProvider();

		await writeWiki(
			root,
			"concepts/transformers.md",
			articleMd("Transformer Architecture", "The transformer uses self-attention mechanisms."),
		);
		await writeWiki(
			root,
			"topics/scaling.md",
			articleMd("Scaling Laws", "Scaling laws for compute and data in neural networks."),
		);

		const index = new VectorIndex();
		const result = await index.build(root, provider, "wiki");

		expect(result.total).toBe(2);
		expect(result.embedded).toBe(2);
		expect(index.documentCount).toBe(2);
	});

	test("returns semantically relevant results", async () => {
		const root = await makeTempVault();
		const provider = createMockEmbedProvider();

		await writeWiki(
			root,
			"concepts/transformers.md",
			articleMd(
				"Transformer Architecture",
				"The transformer is a neural network architecture based on self-attention mechanisms used in deep learning for language models.",
			),
		);
		await writeWiki(
			root,
			"concepts/attention.md",
			articleMd(
				"Attention Mechanisms",
				"Attention mechanisms compute weighted sums for neural network layers. Self-attention is used in transformer architectures.",
			),
		);
		await writeWiki(
			root,
			"topics/quantum.md",
			articleMd(
				"Quantum Physics",
				"Quantum physics studies photons, electrons, waves and particles at the subatomic level.",
			),
		);

		const index = new VectorIndex();
		await index.build(root, provider, "wiki");

		const results = await index.search("transformer self-attention neural network", provider, {
			limit: 10,
		});
		expect(results.length).toBeGreaterThan(0);

		// Transformer and attention articles should rank above quantum physics
		const titles = results.map((r) => r.title);
		const transformerIdx = titles.indexOf("Transformer Architecture");
		const quantumIdx = titles.indexOf("Quantum Physics");
		if (quantumIdx !== -1) {
			expect(transformerIdx).toBeLessThan(quantumIdx);
		}
	});

	test("save and load round-trip preserves search ability", async () => {
		const root = await makeTempVault();
		const provider = createMockEmbedProvider();

		await writeWiki(
			root,
			"concepts/ai.md",
			articleMd(
				"Artificial Intelligence",
				"Machine intelligence and deep learning neural networks.",
			),
		);

		const index1 = new VectorIndex();
		await index1.build(root, provider, "wiki");
		await index1.save(root);

		const index2 = new VectorIndex();
		const loaded = await index2.load(root);
		expect(loaded).toBe(true);
		expect(index2.documentCount).toBe(1);

		const results = await index2.search("machine learning intelligence", provider);
		expect(results.length).toBeGreaterThan(0);
		expect(results[0]!.title).toBe("Artificial Intelligence");
	});

	test("skips re-embedding unchanged documents", async () => {
		const root = await makeTempVault();
		const provider = createMockEmbedProvider();

		await writeWiki(
			root,
			"concepts/test.md",
			articleMd("Test Article", "Content about neural networks."),
		);

		const index = new VectorIndex();
		const result1 = await index.build(root, provider, "wiki");
		expect(result1.embedded).toBe(1);
		await index.save(root);

		// Build again — should reuse cached embedding
		const index2 = new VectorIndex();
		const result2 = await index2.build(root, provider, "wiki");
		expect(result2.embedded).toBe(0);
		expect(result2.total).toBe(1);
	});

	test("re-embeds changed documents", async () => {
		const root = await makeTempVault();
		const provider = createMockEmbedProvider();

		await writeWiki(
			root,
			"concepts/test.md",
			articleMd("Test Article", "Content about neural networks."),
		);

		const index = new VectorIndex();
		await index.build(root, provider, "wiki");
		await index.save(root);

		// Modify the document
		await writeWiki(
			root,
			"concepts/test.md",
			articleMd("Test Article", "Completely different content about quantum physics."),
		);

		const index2 = new VectorIndex();
		const result = await index2.build(root, provider, "wiki");
		expect(result.embedded).toBe(1); // Should re-embed
	});

	test("handles empty index gracefully", async () => {
		const root = await makeTempVault();
		const provider = createMockEmbedProvider();

		const index = new VectorIndex();
		await index.build(root, provider, "wiki");

		const results = await index.search("anything", provider);
		expect(results).toHaveLength(0);
	});

	test("load returns false for missing index", async () => {
		const root = await makeTempVault();
		const index = new VectorIndex();
		const loaded = await index.load(root);
		expect(loaded).toBe(false);
	});

	test("respects limit parameter", async () => {
		const root = await makeTempVault();
		const provider = createMockEmbedProvider();

		for (let i = 0; i < 10; i++) {
			await writeWiki(
				root,
				`concepts/article-${i}.md`,
				articleMd(`Neural Network ${i}`, `Article ${i} about deep learning neural networks.`),
			);
		}

		const index = new VectorIndex();
		await index.build(root, provider, "wiki");

		const results = await index.search("neural network", provider, { limit: 3 });
		expect(results).toHaveLength(3);
	});

	test("skips INDEX.md and GRAPH.md", async () => {
		const root = await makeTempVault();
		const provider = createMockEmbedProvider();

		await writeWiki(root, "INDEX.md", "# Index\nindex content");
		await writeWiki(root, "GRAPH.md", "# Graph\ngraph content");
		await writeWiki(root, "concepts/real.md", articleMd("Real Article", "Actual content."));

		const index = new VectorIndex();
		const result = await index.build(root, provider, "wiki");
		expect(result.total).toBe(1);
	});

	test("addDocument adds to an empty index", async () => {
		const root = await makeTempVault();
		const provider = createMockEmbedProvider();

		const index = new VectorIndex();
		await index.addDocument(
			{
				path: join(root, "raw/articles/ml.md"),
				title: "Machine Learning",
				content: "Machine learning uses neural networks for deep learning tasks.",
			},
			provider,
		);

		expect(index.documentCount).toBe(1);
		const results = await index.search("machine learning neural", provider);
		expect(results.length).toBe(1);
		expect(results[0]!.title).toBe("Machine Learning");
	});

	test("addDocument adds to an existing built index", async () => {
		const root = await makeTempVault();
		const provider = createMockEmbedProvider();

		await writeWiki(
			root,
			"concepts/transformers.md",
			articleMd("Transformer Architecture", "The transformer uses self-attention mechanisms."),
		);

		const index = new VectorIndex();
		await index.build(root, provider, "wiki");
		expect(index.documentCount).toBe(1);

		await index.addDocument(
			{
				path: join(root, "raw/articles/attention.md"),
				title: "Attention Mechanisms",
				content: "Attention mechanisms compute weighted sums in neural network layers.",
			},
			provider,
		);

		expect(index.documentCount).toBe(2);

		const results = await index.search("attention neural", provider);
		expect(results.length).toBe(2);
		expect(results[0]!.title).toBe("Attention Mechanisms");
	});

	test("addDocument replaces existing document with same path", async () => {
		const provider = createMockEmbedProvider();
		const path = "/tmp/test/raw/articles/test.md";

		const index = new VectorIndex();
		await index.addDocument(
			{ path, title: "Old", content: "Old content about quantum physics." },
			provider,
		);
		expect(index.documentCount).toBe(1);

		await index.addDocument(
			{ path, title: "New", content: "New content about neural network deep learning." },
			provider,
		);
		expect(index.documentCount).toBe(1);

		const results = await index.search("neural network", provider);
		expect(results.length).toBe(1);
		expect(results[0]!.title).toBe("New");
	});

	test("addDocument save/load round-trip", async () => {
		const root = await makeTempVault();
		const provider = createMockEmbedProvider();

		const index1 = new VectorIndex();
		await index1.addDocument(
			{
				path: join(root, "raw/articles/test.md"),
				title: "Incremental Doc",
				content: "Neural network deep learning transformer architecture.",
			},
			provider,
		);
		await index1.save(root);

		const index2 = new VectorIndex();
		const loaded = await index2.load(root);
		expect(loaded).toBe(true);
		expect(index2.documentCount).toBe(1);

		const results = await index2.search("neural transformer", provider);
		expect(results.length).toBe(1);
		expect(results[0]!.title).toBe("Incremental Doc");
	});

	test("throws when provider lacks embed", async () => {
		const root = await makeTempVault();
		const provider: LLMProvider = {
			name: "no-embed",
			async complete() {
				return {
					content: "",
					usage: { inputTokens: 0, outputTokens: 0 },
					stopReason: "end_turn",
				};
			},
			async *stream() {},
		};

		const index = new VectorIndex();
		expect(index.build(root, provider, "wiki")).rejects.toThrow("does not support embeddings");
	});
});
