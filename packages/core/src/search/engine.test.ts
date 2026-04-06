import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initVault, writeWiki } from "../vault.js";
import { SearchIndex } from "./engine.js";

let tempDir: string;

afterEach(async () => {
	if (tempDir) await rm(tempDir, { recursive: true, force: true });
});

async function makeTempVault() {
	tempDir = await mkdtemp(join(tmpdir(), "kib-search-test-"));
	await initVault(tempDir, { name: "test" });
	return tempDir;
}

function articleMd(title: string, content: string): string {
	return `---\ntitle: ${title}\nslug: ${title.toLowerCase().replace(/\s+/g, "-")}\n---\n\n# ${title}\n\n${content}`;
}

describe("SearchIndex", () => {
	test("builds index from wiki files", async () => {
		const root = await makeTempVault();
		await writeWiki(
			root,
			"concepts/transformers.md",
			articleMd(
				"Transformer Architecture",
				"The transformer is a neural network architecture based on self-attention mechanisms used in deep learning.",
			),
		);
		await writeWiki(
			root,
			"topics/scaling.md",
			articleMd(
				"Scaling Laws",
				"Scaling laws describe power-law relationships between compute, data, and model performance in neural networks.",
			),
		);

		const index = new SearchIndex();
		await index.build(root, "wiki");

		expect(index.documentCount).toBe(2);
	});

	test("returns relevant results for a query", async () => {
		const root = await makeTempVault();
		await writeWiki(
			root,
			"concepts/transformers.md",
			articleMd(
				"Transformer Architecture",
				"The transformer is a neural network architecture based on self-attention mechanisms. It was introduced in 2017 by Vaswani et al.",
			),
		);
		await writeWiki(
			root,
			"concepts/attention.md",
			articleMd(
				"Attention Mechanisms",
				"Attention mechanisms compute weighted sums over value vectors using query-key compatibility scores. Self-attention is a special case.",
			),
		);
		await writeWiki(
			root,
			"topics/cnn.md",
			articleMd(
				"Convolutional Neural Networks",
				"CNNs use convolutional layers to detect spatial patterns in images and other grid-structured data. They are unrelated to attention.",
			),
		);

		const index = new SearchIndex();
		await index.build(root, "wiki");

		const results = index.search("self-attention transformer");
		expect(results.length).toBeGreaterThan(0);

		// Transformer article should rank highest (has both terms)
		expect(results[0]!.title).toBe("Transformer Architecture");

		// Attention article should also appear
		expect(results.some((r) => r.title === "Attention Mechanisms")).toBe(true);
	});

	test("returns empty results for unmatched query", async () => {
		const root = await makeTempVault();
		await writeWiki(root, "concepts/test.md", articleMd("Test", "Some content about testing."));

		const index = new SearchIndex();
		await index.build(root, "wiki");

		const results = index.search("quantum computing blockchain");
		expect(results).toHaveLength(0);
	});

	test("respects limit parameter", async () => {
		const root = await makeTempVault();

		// Create many articles that all match "neural"
		for (let i = 0; i < 10; i++) {
			await writeWiki(
				root,
				`concepts/article-${i}.md`,
				articleMd(`Neural Network ${i}`, `Article ${i} about neural networks and deep learning.`),
			);
		}

		const index = new SearchIndex();
		await index.build(root, "wiki");

		const results = index.search("neural", { limit: 3 });
		expect(results).toHaveLength(3);
	});

	test("returns results with scores and snippets", async () => {
		const root = await makeTempVault();
		await writeWiki(
			root,
			"concepts/test.md",
			articleMd("Test Article", "This is a test article about knowledge compilation."),
		);

		const index = new SearchIndex();
		await index.build(root, "wiki");

		const results = index.search("knowledge compilation");
		expect(results.length).toBeGreaterThan(0);
		expect(results[0]!.score).toBeGreaterThan(0);
		expect(results[0]!.snippet).toBeTruthy();
		expect(results[0]!.path).toContain("test.md");
	});

	test("handles empty index gracefully", async () => {
		const root = await makeTempVault();
		const index = new SearchIndex();
		await index.build(root, "wiki");

		const results = index.search("anything");
		expect(results).toHaveLength(0);
	});

	test("handles empty query gracefully", async () => {
		const root = await makeTempVault();
		await writeWiki(root, "concepts/test.md", articleMd("Test", "Content."));

		const index = new SearchIndex();
		await index.build(root, "wiki");

		const results = index.search("");
		expect(results).toHaveLength(0);
	});

	test("save and load round-trip preserves search ability", async () => {
		const root = await makeTempVault();
		await writeWiki(
			root,
			"concepts/ai.md",
			articleMd(
				"Artificial Intelligence",
				"AI is the simulation of human intelligence by machines.",
			),
		);

		const index1 = new SearchIndex();
		await index1.build(root, "wiki");
		await index1.save(root);

		const index2 = new SearchIndex();
		const loaded = await index2.load(root);
		expect(loaded).toBe(true);
		expect(index2.documentCount).toBe(1);

		const results = index2.search("artificial intelligence");
		expect(results.length).toBeGreaterThan(0);
		expect(results[0]!.title).toBe("Artificial Intelligence");
	});

	test("load returns false for missing index", async () => {
		const root = await makeTempVault();
		const index = new SearchIndex();
		const loaded = await index.load(root);
		expect(loaded).toBe(false);
	});

	test("skips INDEX.md and GRAPH.md", async () => {
		const root = await makeTempVault();
		await writeWiki(root, "INDEX.md", "# Index\nindex content");
		await writeWiki(root, "GRAPH.md", "# Graph\ngraph content");
		await writeWiki(root, "concepts/real.md", articleMd("Real Article", "Actual content."));

		const index = new SearchIndex();
		await index.build(root, "wiki");

		expect(index.documentCount).toBe(1);
	});

	test("title gets boosted in ranking", async () => {
		const root = await makeTempVault();

		// Article with "transformer" in title
		await writeWiki(
			root,
			"concepts/transformer.md",
			articleMd("Transformer", "A neural network architecture."),
		);

		// Article with "transformer" only in body
		await writeWiki(
			root,
			"concepts/overview.md",
			articleMd(
				"Deep Learning Overview",
				"Various architectures include the transformer and others.",
			),
		);

		const index = new SearchIndex();
		await index.build(root, "wiki");

		const results = index.search("transformer");
		expect(results.length).toBe(2);
		// Title match should rank higher
		expect(results[0]!.title).toBe("Transformer");
	});
});
