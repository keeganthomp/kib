import { describe, expect, test } from "bun:test";
import type { Manifest } from "../types.js";
import {
	extractSourceTopics,
	generateTopicMap,
	selectRelevantArticles,
	shouldUseFastModel,
} from "./context.js";

const mockManifest: Manifest = {
	version: "1" as const,
	vault: {
		name: "test",
		created: "2026-01-01T00:00:00.000Z",
		lastCompiled: null,
		provider: "anthropic",
		model: "test",
	},
	sources: {},
	articles: {
		"transformer-architecture": {
			hash: "h1",
			createdAt: "2026-01-01T00:00:00.000Z",
			lastUpdated: "2026-01-01T00:00:00.000Z",
			derivedFrom: ["raw/articles/test.md"],
			backlinks: [],
			forwardLinks: ["attention-mechanism"],
			tags: ["deep-learning", "nlp", "transformer"],
			summary: "The Transformer architecture.",
			wordCount: 500,
			category: "concept",
		},
		"attention-mechanism": {
			hash: "h2",
			createdAt: "2026-01-01T00:00:00.000Z",
			lastUpdated: "2026-01-01T00:00:00.000Z",
			derivedFrom: ["raw/articles/test.md"],
			backlinks: ["transformer-architecture"],
			forwardLinks: [],
			tags: ["deep-learning", "nlp", "math"],
			summary: "Attention in neural networks.",
			wordCount: 300,
			category: "concept",
		},
		"rest-api": {
			hash: "h3",
			createdAt: "2026-01-01T00:00:00.000Z",
			lastUpdated: "2026-01-01T00:00:00.000Z",
			derivedFrom: ["raw/articles/rest.md"],
			backlinks: [],
			forwardLinks: [],
			tags: ["api", "web", "http"],
			summary: "REST API patterns.",
			wordCount: 400,
			category: "reference",
		},
	},
	stats: { totalSources: 0, totalArticles: 3, totalWords: 1200, lastLintAt: null },
};

describe("generateTopicMap", () => {
	test("produces compact representation", () => {
		const map = generateTopicMap(mockManifest);
		expect(map).toContain("TOPIC MAP (3 articles)");
		expect(map).toContain("concept:");
		expect(map).toContain("reference:");
		expect(map).toContain("transformer-architecture[");
	});

	test("empty manifest returns first compilation message", () => {
		const empty: Manifest = {
			...mockManifest,
			articles: {},
			stats: { ...mockManifest.stats, totalArticles: 0 },
		};
		expect(generateTopicMap(empty)).toBe("(empty — first compilation)");
	});

	test("is significantly shorter than full INDEX.md", () => {
		// A typical INDEX.md for 3 articles would be ~500+ chars
		// Topic map should be ~200 chars
		const map = generateTopicMap(mockManifest);
		expect(map.length).toBeLessThan(300);
	});
});

describe("extractSourceTopics", () => {
	test("extracts tags from frontmatter", () => {
		const content = `---
tags: [deep-learning, transformer, nlp]
---
# Some Article`;
		const topics = extractSourceTopics(content);
		expect(topics.has("deep-learning")).toBe(true);
		expect(topics.has("transformer")).toBe(true);
		expect(topics.has("nlp")).toBe(true); // extracted from frontmatter tags
	});

	test("extracts from headings", () => {
		const content = `# Introduction to Transformer Architecture
## Self-Attention Mechanism
### Multi-Head Attention`;
		const topics = extractSourceTopics(content);
		expect(topics.has("introduction")).toBe(true);
		expect(topics.has("transformer")).toBe(true);
		expect(topics.has("architecture")).toBe(true);
	});

	test("extracts hyphenated terms", () => {
		const content = "The self-attention mechanism uses multi-head attention for deep-learning.";
		const topics = extractSourceTopics(content);
		expect(topics.has("self-attention")).toBe(true);
		expect(topics.has("multi-head")).toBe(true);
		expect(topics.has("deep-learning")).toBe(true);
	});
});

describe("selectRelevantArticles", () => {
	test("always includes produced articles", () => {
		const topics = new Set<string>();
		const produced = ["transformer-architecture"];
		const result = selectRelevantArticles(mockManifest, topics, produced);
		expect(result).toContain("transformer-architecture");
	});

	test("selects articles with overlapping tags", () => {
		const topics = new Set(["deep-learning", "transformer"]);
		const result = selectRelevantArticles(mockManifest, topics, []);
		// Should include transformer-architecture and attention-mechanism (shared deep-learning tag)
		expect(result).toContain("transformer-architecture");
		expect(result).toContain("attention-mechanism");
		// Should NOT include rest-api (no tag overlap)
		expect(result).not.toContain("rest-api");
	});

	test("respects max articles limit", () => {
		const topics = new Set(["deep-learning", "transformer", "nlp"]);
		const result = selectRelevantArticles(mockManifest, topics, [], 1);
		expect(result.length).toBe(1);
	});
});

describe("shouldUseFastModel", () => {
	test("short simple content uses fast model", () => {
		const content = "# Simple Article\n\nThis is a short article about a simple topic.";
		expect(shouldUseFastModel(content, 10)).toBe(true);
	});

	test("long content uses full model", () => {
		const content = "x ".repeat(3000);
		expect(shouldUseFastModel(content, 3000)).toBe(false);
	});

	test("code-heavy content uses full model", () => {
		const content = "```js\ncode\n```\n```py\ncode\n```\n```rs\ncode\n```\n```go\ncode\n```";
		expect(shouldUseFastModel(content, 100)).toBe(false);
	});

	test("content with many headings uses full model", () => {
		const headings = Array.from({ length: 12 }, (_, i) => `## Heading ${i}`).join("\n\n");
		expect(shouldUseFastModel(headings, 200)).toBe(false);
	});

	test("content with tables uses full model", () => {
		const content = "| col1 | col2 |\n|---|---|\n| a | b |";
		expect(shouldUseFastModel(content, 50)).toBe(false);
	});
});
