import { describe, expect, test } from "bun:test";
import { extractWikilinks, parseCompileOutput, parseFrontmatter } from "./diff.js";

describe("parseCompileOutput", () => {
	test("parses clean JSON array", () => {
		const input = JSON.stringify([
			{
				op: "create",
				path: "wiki/concepts/test.md",
				content: "# Test\n\nContent.",
			},
		]);
		const result = parseCompileOutput(input);
		expect(result).toHaveLength(1);
		expect(result[0]!.op).toBe("create");
		expect(result[0]!.path).toBe("wiki/concepts/test.md");
	});

	test("strips markdown code fences", () => {
		const input = '```json\n[{"op":"create","path":"wiki/test.md","content":"# Test"}]\n```';
		const result = parseCompileOutput(input);
		expect(result).toHaveLength(1);
		expect(result[0]!.op).toBe("create");
	});

	test("strips plain code fences", () => {
		const input = '```\n[{"op":"create","path":"wiki/test.md","content":"x"}]\n```';
		const result = parseCompileOutput(input);
		expect(result).toHaveLength(1);
	});

	test("extracts JSON from surrounding text", () => {
		const input =
			'Here are the file operations:\n\n[{"op":"create","path":"wiki/test.md","content":"x"}]\n\nHope that helps!';
		const result = parseCompileOutput(input);
		expect(result).toHaveLength(1);
	});

	test("parses multiple operations", () => {
		const input = JSON.stringify([
			{ op: "create", path: "wiki/concepts/a.md", content: "# A" },
			{ op: "update", path: "wiki/topics/b.md", content: "# B updated" },
			{ op: "delete", path: "wiki/references/c.md" },
		]);
		const result = parseCompileOutput(input);
		expect(result).toHaveLength(3);
		expect(result[0]!.op).toBe("create");
		expect(result[1]!.op).toBe("update");
		expect(result[2]!.op).toBe("delete");
	});

	test("parses empty array", () => {
		const result = parseCompileOutput("[]");
		expect(result).toHaveLength(0);
	});

	test("throws on invalid JSON", () => {
		expect(() => parseCompileOutput("not json at all")).toThrow("Failed to parse");
	});

	test("throws on wrong structure", () => {
		expect(() => parseCompileOutput('{"not": "an array"}')).toThrow();
	});

	test("throws on invalid operation type", () => {
		expect(() => parseCompileOutput('[{"op":"rename","path":"x","content":"y"}]')).toThrow();
	});

	test("handles whitespace around JSON", () => {
		const input = '  \n\n  [{"op":"create","path":"wiki/test.md","content":"x"}]  \n\n  ';
		const result = parseCompileOutput(input);
		expect(result).toHaveLength(1);
	});

	test("delete operation doesn't require content", () => {
		const input = '[{"op":"delete","path":"wiki/old.md"}]';
		const result = parseCompileOutput(input);
		expect(result).toHaveLength(1);
		expect(result[0]!.content).toBeUndefined();
	});
});

describe("parseFrontmatter", () => {
	test("parses standard frontmatter", () => {
		const md = `---
title: Test Article
slug: test-article
category: concept
tags: [deep-learning, nlp]
created: 2026-04-05
updated: 2026-04-05
summary: A test article about testing.
---

# Test Article

Content here.`;

		const { frontmatter, body } = parseFrontmatter(md);
		expect(frontmatter.title).toBe("Test Article");
		expect(frontmatter.slug).toBe("test-article");
		expect(frontmatter.category).toBe("concept");
		expect(frontmatter.tags).toEqual(["deep-learning", "nlp"]);
		expect(frontmatter.created).toBe("2026-04-05");
		expect(body).toContain("# Test Article");
		expect(body).toContain("Content here.");
	});

	test("returns empty frontmatter when none exists", () => {
		const { frontmatter, body } = parseFrontmatter("# Just Content\n\nNo frontmatter.");
		expect(frontmatter).toEqual({});
		expect(body).toBe("# Just Content\n\nNo frontmatter.");
	});

	test("handles quoted values", () => {
		const md = '---\ntitle: "Quoted Title"\n---\n\nBody.';
		const { frontmatter } = parseFrontmatter(md);
		expect(frontmatter.title).toBe("Quoted Title");
	});

	test("handles boolean values", () => {
		const md = "---\ndraft: true\npublished: false\n---\n\nBody.";
		const { frontmatter } = parseFrontmatter(md);
		expect(frontmatter.draft).toBe(true);
		expect(frontmatter.published).toBe(false);
	});

	test("handles empty tags array", () => {
		const md = "---\ntags: []\n---\n\nBody.";
		const { frontmatter } = parseFrontmatter(md);
		expect(frontmatter.tags).toEqual([]);
	});
});

describe("extractWikilinks", () => {
	test("extracts single wikilink", () => {
		const content = "This relates to [[transformer-architecture]].";
		expect(extractWikilinks(content)).toEqual(["transformer-architecture"]);
	});

	test("extracts multiple wikilinks", () => {
		const content = "See [[attention-mechanisms]] and [[positional-encoding]] for details.";
		expect(extractWikilinks(content)).toEqual(["attention-mechanisms", "positional-encoding"]);
	});

	test("deduplicates wikilinks", () => {
		const content = "The [[transformer]] is great. More about [[transformer]] here.";
		expect(extractWikilinks(content)).toEqual(["transformer"]);
	});

	test("normalizes to kebab-case", () => {
		const content = "See [[Transformer Architecture]] for details.";
		expect(extractWikilinks(content)).toEqual(["transformer-architecture"]);
	});

	test("returns empty array when no links", () => {
		expect(extractWikilinks("No links here.")).toEqual([]);
	});

	test("handles links with spaces around them", () => {
		const content = "See [[ attention mechanisms ]] here.";
		expect(extractWikilinks(content)).toEqual(["attention-mechanisms"]);
	});
});
