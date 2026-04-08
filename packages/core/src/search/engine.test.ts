import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initVault, writeWiki } from "../vault.js";
import { editDistance1, highlightSnippet, parseQuery, SearchIndex } from "./engine.js";

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

// ─── Fuzzy Matching ─────────────────────────────────────────────

describe("editDistance1", () => {
	test("returns true for single substitution", () => {
		expect(editDistance1("cat", "bat")).toBe(true);
		expect(editDistance1("hello", "hallo")).toBe(true);
	});

	test("returns true for single insertion", () => {
		expect(editDistance1("cat", "cart")).toBe(true);
		expect(editDistance1("test", "teset")).toBe(true);
	});

	test("returns true for single deletion", () => {
		expect(editDistance1("cart", "cat")).toBe(true);
		expect(editDistance1("hello", "helo")).toBe(true);
	});

	test("returns false for identical strings", () => {
		expect(editDistance1("same", "same")).toBe(false);
	});

	test("returns false for distance > 1", () => {
		expect(editDistance1("cat", "dog")).toBe(false);
		expect(editDistance1("hello", "world")).toBe(false);
		expect(editDistance1("abc", "abcde")).toBe(false);
	});

	test("returns false for empty vs 2+ chars", () => {
		expect(editDistance1("", "ab")).toBe(false);
	});

	test("handles single char edge cases", () => {
		expect(editDistance1("a", "b")).toBe(true); // substitution
		expect(editDistance1("a", "ab")).toBe(true); // insertion
		expect(editDistance1("ab", "a")).toBe(true); // deletion
	});
});

describe("fuzzy search", () => {
	test("finds results with typos (edit distance 1)", async () => {
		const root = await makeTempVault();
		await writeWiki(
			root,
			"concepts/transformer.md",
			articleMd(
				"Transformer Architecture",
				"The transformer is a neural network architecture based on self-attention mechanisms.",
			),
		);

		const index = new SearchIndex();
		await index.build(root, "wiki");

		// "transfomer" is a common typo (missing 'r')
		const results = index.search("transfomer");
		expect(results.length).toBeGreaterThan(0);
		expect(results[0]!.title).toBe("Transformer Architecture");
	});

	test("does not fuzzy match short tokens (< 4 chars)", async () => {
		const root = await makeTempVault();
		await writeWiki(
			root,
			"concepts/ai.md",
			articleMd("AI Basics", "AI is artificial intelligence."),
		);

		const index = new SearchIndex();
		await index.build(root, "wiki");

		// "ax" is short — should not fuzzy-match "ai"
		const results = index.search("ax");
		expect(results).toHaveLength(0);
	});
});

// ─── Phrase Search ──────────────────────────────────────────────

describe("parseQuery", () => {
	test("extracts quoted phrases", () => {
		const result = parseQuery('"attention mechanism" transformer');
		expect(result.phrases).toEqual(["attention mechanism"]);
		expect(result.terms).toEqual(["transformer"]);
	});

	test("handles multiple quoted phrases", () => {
		const result = parseQuery('"hello world" foo "bar baz"');
		expect(result.phrases).toEqual(["hello world", "bar baz"]);
		expect(result.terms).toEqual(["foo"]);
	});

	test("handles no quotes", () => {
		const result = parseQuery("simple search query");
		expect(result.phrases).toEqual([]);
		expect(result.terms).toEqual(["simple", "search", "query"]);
	});

	test("handles only quotes", () => {
		const result = parseQuery('"exact phrase"');
		expect(result.phrases).toEqual(["exact phrase"]);
		expect(result.terms).toEqual([]);
	});

	test("handles empty query", () => {
		const result = parseQuery("");
		expect(result.phrases).toEqual([]);
		expect(result.terms).toEqual([]);
	});
});

describe("phrase search", () => {
	test("exact phrase matches rank and filter correctly", async () => {
		const root = await makeTempVault();
		await writeWiki(
			root,
			"concepts/attention.md",
			articleMd(
				"Attention Mechanisms",
				"Self-attention mechanisms compute weighted sums. Attention is all you need.",
			),
		);
		await writeWiki(
			root,
			"concepts/rnn.md",
			articleMd(
				"Recurrent Networks",
				"RNNs process sequences. Some use attention over hidden states.",
			),
		);

		const index = new SearchIndex();
		await index.build(root, "wiki");

		// Phrase search should only match articles containing the exact phrase
		const results = index.search('"attention is all you need"');
		expect(results.length).toBe(1);
		expect(results[0]!.title).toBe("Attention Mechanisms");
	});

	test("phrase search with additional terms", async () => {
		const root = await makeTempVault();
		await writeWiki(
			root,
			"concepts/transformer.md",
			articleMd("Transformer", "The transformer uses self-attention mechanisms for processing."),
		);
		await writeWiki(
			root,
			"concepts/cnn.md",
			articleMd("CNN", "CNNs use convolutional layers for self-attention on images. Not really."),
		);

		const index = new SearchIndex();
		await index.build(root, "wiki");

		// Only the transformer article has "self-attention mechanisms" as a phrase
		const results = index.search('"self-attention mechanisms" transformer');
		expect(results.length).toBe(1);
		expect(results[0]!.title).toBe("Transformer");
	});
});

// ─── Tag Filtering ──────────────────────────────────────────────

describe("tag filtering", () => {
	function taggedArticle(title: string, tags: string[], content: string): string {
		return `---\ntitle: ${title}\nslug: ${title.toLowerCase().replace(/\s+/g, "-")}\ntags: [${tags.join(", ")}]\n---\n\n# ${title}\n\n${content}`;
	}

	test("filters results by single tag", async () => {
		const root = await makeTempVault();
		await writeWiki(
			root,
			"concepts/transformer.md",
			taggedArticle("Transformer", ["deep-learning", "nlp"], "Neural network architecture."),
		);
		await writeWiki(
			root,
			"concepts/cnn.md",
			taggedArticle("CNN", ["deep-learning", "vision"], "Convolutional neural network."),
		);
		await writeWiki(
			root,
			"concepts/bert.md",
			taggedArticle("BERT", ["nlp"], "Bidirectional encoder from transformers. A neural network."),
		);

		const index = new SearchIndex();
		await index.build(root, "wiki");

		const results = index.search("neural network", { tag: "nlp" });
		// Only transformer and BERT have the nlp tag
		expect(results.every((r) => r.title === "Transformer" || r.title === "BERT")).toBe(true);
		expect(results.some((r) => r.title === "CNN")).toBe(false);
	});

	test("filters results by multiple tags (AND logic)", async () => {
		const root = await makeTempVault();
		await writeWiki(
			root,
			"concepts/transformer.md",
			taggedArticle("Transformer", ["deep-learning", "nlp"], "A neural architecture."),
		);
		await writeWiki(
			root,
			"concepts/bert.md",
			taggedArticle("BERT", ["nlp"], "Bidirectional encoder. A neural architecture."),
		);

		const index = new SearchIndex();
		await index.build(root, "wiki");

		const results = index.search("neural", { tag: ["deep-learning", "nlp"] });
		// Only transformer has both tags
		expect(results.length).toBe(1);
		expect(results[0]!.title).toBe("Transformer");
	});

	test("returns empty when no docs match tag", async () => {
		const root = await makeTempVault();
		await writeWiki(
			root,
			"concepts/test.md",
			taggedArticle("Test", ["misc"], "Some content about testing."),
		);

		const index = new SearchIndex();
		await index.build(root, "wiki");

		const results = index.search("test", { tag: "nonexistent" });
		expect(results).toHaveLength(0);
	});
});

// ─── Date Filtering ─────────────────────────────────────────────

describe("date filtering", () => {
	function datedArticle(title: string, date: string, content: string): string {
		return `---\ntitle: ${title}\nslug: ${title.toLowerCase().replace(/\s+/g, "-")}\ndate: ${date}\n---\n\n# ${title}\n\n${content}`;
	}

	test("filters results by --since date", async () => {
		const root = await makeTempVault();
		await writeWiki(
			root,
			"concepts/old.md",
			datedArticle("Old Article", "2023-01-15", "Neural networks from the past."),
		);
		await writeWiki(
			root,
			"concepts/new.md",
			datedArticle("New Article", "2025-06-01", "Recent neural network research."),
		);

		const index = new SearchIndex();
		await index.build(root, "wiki");

		const results = index.search("neural", { since: "2025-01-01" });
		expect(results.length).toBe(1);
		expect(results[0]!.title).toBe("New Article");
	});

	test("includes articles on the exact --since date", async () => {
		const root = await makeTempVault();
		await writeWiki(
			root,
			"concepts/exact.md",
			datedArticle("Exact Date", "2025-03-15", "Neural network content."),
		);

		const index = new SearchIndex();
		await index.build(root, "wiki");

		const results = index.search("neural", { since: "2025-03-15" });
		expect(results.length).toBe(1);
	});

	test("includes articles with no date when using --since", async () => {
		const root = await makeTempVault();
		await writeWiki(
			root,
			"concepts/nodated.md",
			articleMd("No Date", "Neural network with no date frontmatter."),
		);

		const index = new SearchIndex();
		await index.build(root, "wiki");

		// Articles with no date should not be excluded
		const results = index.search("neural", { since: "2025-01-01" });
		expect(results.length).toBe(1);
	});
});

// ─── Highlighting ───────────────────────────────────────────────

describe("highlightSnippet", () => {
	test("bolds matched words", () => {
		const result = highlightSnippet("The transformer architecture is powerful", ["transform"]);
		expect(result).toContain("\x1b[1mtransformer\x1b[22m");
		expect(result).toContain("The");
		expect(result).toContain("is powerful");
	});

	test("highlights multiple terms", () => {
		const result = highlightSnippet("Neural networks use attention mechanisms", [
			"neural",
			"attention",
		]);
		expect(result).toContain("\x1b[1mNeural\x1b[22m");
		expect(result).toContain("\x1b[1mattention\x1b[22m");
	});

	test("returns unchanged snippet when no tokens match", () => {
		const snippet = "No matches here";
		const result = highlightSnippet(snippet, ["quantum"]);
		expect(result).toBe(snippet);
	});

	test("returns unchanged snippet with empty tokens", () => {
		const snippet = "Some text";
		expect(highlightSnippet(snippet, [])).toBe(snippet);
	});
});

// ─── Save/Load with tags and date ───────────────────────────────

describe("index serialization with metadata", () => {
	function taggedDatedArticle(
		title: string,
		tags: string[],
		date: string,
		content: string,
	): string {
		return `---\ntitle: ${title}\nslug: ${title.toLowerCase().replace(/\s+/g, "-")}\ntags: [${tags.join(", ")}]\ndate: ${date}\n---\n\n# ${title}\n\n${content}`;
	}

	test("save and load preserves tag and date filtering", async () => {
		const root = await makeTempVault();
		await writeWiki(
			root,
			"concepts/tagged.md",
			taggedDatedArticle(
				"Tagged Article",
				["ml", "nlp"],
				"2025-06-01",
				"Machine learning content.",
			),
		);
		await writeWiki(
			root,
			"concepts/other.md",
			taggedDatedArticle("Other Article", ["vision"], "2024-01-01", "Computer vision content."),
		);

		const index1 = new SearchIndex();
		await index1.build(root, "wiki");
		await index1.save(root);

		const index2 = new SearchIndex();
		const loaded = await index2.load(root);
		expect(loaded).toBe(true);

		// Tag filter should still work after load
		const tagResults = index2.search("content", { tag: "ml" });
		expect(tagResults.length).toBe(1);
		expect(tagResults[0]!.title).toBe("Tagged Article");

		// Date filter should still work after load
		const dateResults = index2.search("content", { since: "2025-01-01" });
		expect(dateResults.length).toBe(1);
		expect(dateResults[0]!.title).toBe("Tagged Article");
	});
});
