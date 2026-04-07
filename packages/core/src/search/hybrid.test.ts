import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LLMProvider } from "../types.js";
import { initVault, writeWiki } from "../vault.js";
import { SearchIndex } from "./engine.js";
import { HybridSearch } from "./hybrid.js";
import { VectorIndex } from "./vector.js";

let tempDir: string;

afterEach(async () => {
	if (tempDir) await rm(tempDir, { recursive: true, force: true });
});

async function makeTempVault() {
	tempDir = await mkdtemp(join(tmpdir(), "kib-hybrid-test-"));
	await initVault(tempDir, { name: "test" });
	return tempDir;
}

function articleMd(title: string, content: string): string {
	return `---\ntitle: ${title}\nslug: ${title.toLowerCase().replace(/\s+/g, "-")}\n---\n\n# ${title}\n\n${content}`;
}

function createMockEmbedProvider(): LLMProvider {
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
		"quantum",
		"photon",
		"physics",
		"biology",
		"cell",
		"protein",
		"machine",
		"intelligence",
	];

	function textToEmbedding(text: string): Float32Array {
		const lower = text.toLowerCase();
		const dims = 64;
		const vec = new Float32Array(dims);
		for (let i = 0; i < keywords.length && i < dims; i++) {
			const keyword = keywords[i]!;
			const count = (lower.match(new RegExp(keyword, "g")) ?? []).length;
			vec[i] = count > 0 ? 0.3 + Math.min(count * 0.15, 0.7) : 0;
		}
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

function createProviderWithoutEmbed(): LLMProvider {
	return {
		name: "no-embed",
		async complete() {
			return { content: "", usage: { inputTokens: 0, outputTokens: 0 }, stopReason: "end_turn" };
		},
		async *stream() {},
	};
}

describe("HybridSearch", () => {
	test("builds both BM25 and vector indexes", async () => {
		const root = await makeTempVault();
		const provider = createMockEmbedProvider();

		await writeWiki(
			root,
			"concepts/transformers.md",
			articleMd("Transformer Architecture", "Neural network with self-attention mechanisms."),
		);
		await writeWiki(
			root,
			"concepts/cnn.md",
			articleMd("CNN", "Convolutional neural networks for image recognition."),
		);

		const hybrid = new HybridSearch(new SearchIndex(), new VectorIndex());
		const result = await hybrid.build(root, provider, "wiki");

		expect(result.bm25Docs).toBe(2);
		expect(result.vectorDocs).toBe(2);
		expect(result.embedded).toBe(2);
	});

	test("returns fused results from both engines", async () => {
		const root = await makeTempVault();
		const provider = createMockEmbedProvider();

		await writeWiki(
			root,
			"concepts/transformers.md",
			articleMd(
				"Transformer Architecture",
				"The transformer is a neural network architecture using self-attention for deep learning language models.",
			),
		);
		await writeWiki(
			root,
			"concepts/attention.md",
			articleMd(
				"Attention Mechanisms",
				"Self-attention mechanisms are used in transformer neural networks for computing weighted representations.",
			),
		);
		await writeWiki(
			root,
			"topics/quantum.md",
			articleMd(
				"Quantum Physics",
				"Quantum physics studies photons and electrons at subatomic scales.",
			),
		);

		const hybrid = new HybridSearch(new SearchIndex(), new VectorIndex());
		await hybrid.build(root, provider, "wiki");

		const results = await hybrid.search("transformer attention neural", provider, { limit: 10 });
		expect(results.length).toBeGreaterThan(0);

		// The transformer article should be in results
		expect(results.some((r) => r.title === "Transformer Architecture")).toBe(true);
	});

	test("falls back to BM25 when provider lacks embed", async () => {
		const root = await makeTempVault();
		const provider = createProviderWithoutEmbed();

		await writeWiki(
			root,
			"concepts/test.md",
			articleMd("Test Article", "Content about neural networks and deep learning."),
		);

		const hybrid = new HybridSearch(new SearchIndex(), new VectorIndex());
		await hybrid.build(root, provider, "wiki");

		const results = await hybrid.search("neural networks", provider, { limit: 10 });
		expect(results.length).toBeGreaterThan(0);
		expect(results[0]!.title).toBe("Test Article");
	});

	test("save and load round-trip", async () => {
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

		const hybrid1 = new HybridSearch(new SearchIndex(), new VectorIndex());
		await hybrid1.build(root, provider, "wiki");
		await hybrid1.save(root);

		const hybrid2 = new HybridSearch(new SearchIndex(), new VectorIndex());
		const loaded = await hybrid2.load(root);
		expect(loaded.bm25).toBe(true);
		expect(loaded.vector).toBe(true);

		const results = await hybrid2.search("machine intelligence", provider, { limit: 5 });
		expect(results.length).toBeGreaterThan(0);
	});

	test("respects limit parameter", async () => {
		const root = await makeTempVault();
		const provider = createMockEmbedProvider();

		for (let i = 0; i < 10; i++) {
			await writeWiki(
				root,
				`concepts/article-${i}.md`,
				articleMd(`Neural Network ${i}`, `Article ${i} about neural networks and deep learning.`),
			);
		}

		const hybrid = new HybridSearch(new SearchIndex(), new VectorIndex());
		await hybrid.build(root, provider, "wiki");

		const results = await hybrid.search("neural network", provider, { limit: 3 });
		expect(results).toHaveLength(3);
	});

	test("handles empty vault", async () => {
		const root = await makeTempVault();
		const provider = createMockEmbedProvider();

		const hybrid = new HybridSearch(new SearchIndex(), new VectorIndex());
		await hybrid.build(root, provider, "wiki");

		const results = await hybrid.search("anything", provider);
		expect(results).toHaveLength(0);
	});
});
