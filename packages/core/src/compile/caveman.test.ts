import { describe, expect, test } from "bun:test";
import { cavemanCompress, compressContext, compressSource, estimateSavings } from "./caveman.js";

describe("cavemanCompress", () => {
	// ── Article stripping ──────────────────────────────────

	test("strips articles (a, an, the)", () => {
		const { text } = cavemanCompress(
			"The transformer is a model. A neural network uses an attention mechanism.",
		);
		expect(text).not.toContain("The transformer");
		expect(text).not.toContain("A neural");
		expect(text).not.toContain("an attention");
		// Technical content preserved
		expect(text).toContain("transformer");
		expect(text).toContain("neural network");
		expect(text).toContain("attention mechanism");
	});

	// ── Filler word stripping ──────────────────────────────

	test("strips filler words", () => {
		const { text } = cavemanCompress(
			"This is basically just a very simple example that essentially demonstrates the concept.",
		);
		expect(text).not.toContain("basically");
		expect(text).not.toContain("just");
		expect(text).not.toContain("very");
		expect(text).not.toContain("essentially");
		expect(text).toContain("simple");
		expect(text).toContain("example");
		expect(text).toContain("concept");
	});

	// ── Hedging removal ────────────────────────────────────

	test("strips hedging phrases", () => {
		const { text } = cavemanCompress(
			"It is worth noting that the algorithm converges. It seems that this approach works.",
		);
		expect(text).not.toContain("It is worth noting that");
		expect(text).not.toContain("It seems that");
		expect(text).toContain("algorithm converges");
		expect(text).toContain("approach works");
	});

	// ── Connector compression ──────────────────────────────

	test("shortens verbose connectors", () => {
		const { text } = cavemanCompress(
			"However, the model fails. Furthermore, it is slow. For example, training takes hours.",
		);
		expect(text).toContain("but");
		expect(text).toContain("also");
		expect(text).toContain("e.g.");
		expect(text).not.toContain("However");
		expect(text).not.toContain("Furthermore");
		expect(text).not.toContain("For example");
	});

	// ── Weak verb compression ──────────────────────────────

	test("strengthens weak verbs", () => {
		const { text } = cavemanCompress(
			"The module is able to handle requests. It is responsible for routing.",
		);
		expect(text).toContain("can");
		expect(text).toContain("handles");
		expect(text).not.toContain("is able to");
		expect(text).not.toContain("is responsible for");
	});

	// ── Redundant phrase compression ───────────────────────

	test("compresses redundant phrases", () => {
		const { text } = cavemanCompress(
			"First and foremost, due to the fact that the system has the ability to scale.",
		);
		expect(text).toContain("first");
		expect(text).toContain("because");
		expect(text).toContain("can");
		expect(text).not.toContain("First and foremost");
		expect(text).not.toContain("due to the fact that");
		expect(text).not.toContain("has the ability to");
	});

	// ── Protected regions ──────────────────────────────────

	test("preserves code blocks", () => {
		const input = "The function is basically:\n```js\nconst a = the + an;\n```\nIt is very simple.";
		const { text } = cavemanCompress(input);
		expect(text).toContain("```js\nconst a = the + an;\n```");
		expect(text).not.toContain("basically");
	});

	test("preserves inline code", () => {
		const input = "The `the_variable` is a very important value.";
		const { text } = cavemanCompress(input);
		expect(text).toContain("`the_variable`");
	});

	test("preserves URLs", () => {
		const input = "The API is at https://api.example.com/the/endpoint and it is very fast.";
		const { text } = cavemanCompress(input);
		expect(text).toContain("https://api.example.com/the/endpoint");
	});

	test("preserves YAML frontmatter", () => {
		const input = `---
title: The Important Article
slug: the-article
tags: [a, an, the]
---

The article is basically about a very important topic.`;
		const { text } = cavemanCompress(input);
		// Frontmatter preserved exactly
		expect(text).toContain("title: The Important Article");
		expect(text).toContain("tags: [a, an, the]");
		// Body compressed
		expect(text).not.toMatch(/\barticle is basically\b/);
	});

	test("preserves wikilinks", () => {
		const input = "The concept uses [[the-attention-mechanism]] for a better result.";
		const { text } = cavemanCompress(input);
		expect(text).toContain("[[the-attention-mechanism]]");
	});

	test("preserves markdown links", () => {
		const input = "See [the documentation](https://docs.example.com) for a comprehensive overview.";
		const { text } = cavemanCompress(input);
		expect(text).toContain("[the documentation](https://docs.example.com)");
	});

	// ── Whitespace cleanup ─────────────────────────────────

	test("collapses multiple spaces", () => {
		const { text } = cavemanCompress("The   word  has   spaces.");
		expect(text).not.toMatch(/ {2}/);
	});

	test("collapses excessive blank lines", () => {
		const { text } = cavemanCompress("Line one.\n\n\n\nLine two.");
		expect(text).not.toContain("\n\n\n");
	});

	// ── Savings measurement ────────────────────────────────

	test("returns positive savedChars for compressible text", () => {
		const { savedChars } = cavemanCompress(
			"The algorithm is basically a very simple implementation that essentially just handles the data. However, it is worth noting that the system is able to process a large number of requests. Furthermore, this is responsible for managing the entire lifecycle.",
		);
		expect(savedChars).toBeGreaterThan(50);
	});

	test("returns zero savedChars for purely technical content", () => {
		const { savedChars } = cavemanCompress("```\nfoo(bar, baz)\n```");
		expect(savedChars).toBe(0);
	});

	// ── Real-world source compression ──────────────────────

	test("compresses a realistic article meaningfully", () => {
		const article = `---
title: REST API Design
slug: rest-api-design
category: reference
tags: [api, web, http, rest]
sources:
  - raw/articles/rest-tutorial.md
created: 2026-04-01
updated: 2026-04-01
summary: REST API design principles and best practices.
---

# REST API Design

The REST (Representational State Transfer) architectural style is a very popular approach for building web APIs. It was first introduced by Roy Fielding in his doctoral dissertation.

## Core Principles

There are basically six core constraints that define a RESTful architecture:

1. **Client-Server**: The client and the server should be separated. This is important because it allows the client and the server to evolve independently.
2. **Stateless**: Each request from the client to the server must contain all the information needed to understand the request. The server should not store any client context between requests.
3. **Cacheable**: Responses should be explicitly marked as cacheable or non-cacheable. This is essential for the performance of the system.

Furthermore, it is worth noting that REST APIs should use standard HTTP methods. The most commonly used methods are essentially GET, POST, PUT, and DELETE.

However, it is important to note that REST is not a protocol — it is an architectural style. Consequently, there are a large number of different implementations and interpretations.`;

		const { text, ratio } = compressSource(article);
		// Should achieve meaningful compression on this prose-heavy article
		expect(ratio).toBeGreaterThan(0.1); // At least 10% reduction
		// Frontmatter untouched
		expect(text).toContain("title: REST API Design");
		expect(text).toContain("tags: [api, web, http, rest]");
		// Technical terms preserved
		expect(text).toContain("REST");
		expect(text).toContain("Representational State Transfer");
		expect(text).toContain("Roy Fielding");
		expect(text).toContain("HTTP");
		expect(text).toContain("GET, POST, PUT");
		// Filler removed
		expect(text).not.toContain("basically");
		expect(text).not.toContain("essentially");
		expect(text).not.toContain("it is worth noting that");
	});
});

describe("compressSource", () => {
	test("returns ratio between 0 and 1", () => {
		const { ratio } = compressSource("The algorithm is basically just a very simple function.");
		expect(ratio).toBeGreaterThan(0);
		expect(ratio).toBeLessThan(1);
	});

	test("returns 0 ratio for empty string", () => {
		const { ratio } = compressSource("");
		expect(ratio).toBe(0);
	});
});

describe("compressContext", () => {
	test("compresses article context", () => {
		const original =
			"The transformer architecture is a very important model. It was basically introduced in 2017.";
		const compressed = compressContext(original);
		expect(compressed.length).toBeLessThan(original.length);
		expect(compressed).toContain("transformer");
		expect(compressed).toContain("2017");
	});
});

describe("estimateSavings", () => {
	test("calculates token savings correctly", () => {
		const original = "a".repeat(400); // 100 tokens at 0.25 per char
		const compressed = "a".repeat(300); // 75 tokens
		const result = estimateSavings(original, compressed);
		expect(result.originalTokens).toBe(100);
		expect(result.compressedTokens).toBe(75);
		expect(result.saved).toBe(25);
		expect(result.percent).toBe(25);
	});

	test("handles empty strings", () => {
		const result = estimateSavings("", "");
		expect(result.percent).toBe(0);
	});
});
