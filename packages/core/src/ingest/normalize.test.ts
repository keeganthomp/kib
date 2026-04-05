import { describe, expect, test } from "bun:test";
import { countWords, normalizeSource, slugify } from "./normalize.js";

describe("slugify", () => {
	test("converts title to kebab-case", () => {
		expect(slugify("Transformer Architecture")).toBe("transformer-architecture");
	});

	test("strips special characters", () => {
		expect(slugify("What's New in React 19?")).toBe("whats-new-in-react-19");
	});

	test("collapses multiple dashes", () => {
		expect(slugify("foo  --  bar")).toBe("foo-bar");
	});

	test("strips leading/trailing dashes", () => {
		expect(slugify("--hello--")).toBe("hello");
	});

	test("truncates at 80 chars", () => {
		const long = "a".repeat(100);
		expect(slugify(long).length).toBeLessThanOrEqual(80);
	});

	test("handles empty string", () => {
		expect(slugify("")).toBe("");
	});

	test("handles unicode by stripping", () => {
		expect(slugify("Vaswani et al. (2017)")).toBe("vaswani-et-al-2017");
	});
});

describe("countWords", () => {
	test("counts plain text words", () => {
		expect(countWords("hello world foo bar")).toBe(4);
	});

	test("ignores code blocks", () => {
		const text = "before\n```\nconst x = 1;\n```\nafter";
		expect(countWords(text)).toBe(2); // "before" and "after"
	});

	test("ignores inline code", () => {
		expect(countWords("use `const` to declare")).toBe(3);
	});

	test("strips markdown syntax", () => {
		expect(countWords("# Hello **World**")).toBe(2);
	});

	test("handles empty string", () => {
		expect(countWords("")).toBe(0);
	});

	test("handles whitespace only", () => {
		expect(countWords("   \n\n  ")).toBe(0);
	});
});

describe("normalizeSource", () => {
	test("generates frontmatter with required fields", () => {
		const result = normalizeSource({
			title: "Test Article",
			content: "# Test\n\nSome content here with words.",
			sourceType: "web",
			originalUrl: "https://example.com",
		});

		expect(result).toContain('title: "Test Article"');
		expect(result).toContain("source_type: web");
		expect(result).toContain('url: "https://example.com"');
		expect(result).toContain("word_count:");
		expect(result).toContain("ingested:");
	});

	test("includes author and date when present", () => {
		const result = normalizeSource({
			title: "Paper",
			content: "Content.",
			sourceType: "pdf",
			metadata: { author: "John Doe", date: "2024-01-01" },
		});

		expect(result).toContain('author: "John Doe"');
		expect(result).toContain('date: "2024-01-01"');
	});

	test("escapes quotes in title", () => {
		const result = normalizeSource({
			title: 'He said "hello"',
			content: "Content.",
			sourceType: "file",
		});

		expect(result).toContain('title: "He said \\"hello\\""');
	});

	test("removes excessive blank lines", () => {
		const result = normalizeSource({
			title: "Test",
			content: "Line 1\n\n\n\n\nLine 2",
			sourceType: "file",
		});

		expect(result).not.toContain("\n\n\n");
		expect(result).toContain("Line 1\n\nLine 2");
	});

	test("normalizes CRLF to LF", () => {
		const result = normalizeSource({
			title: "Test",
			content: "Line 1\r\nLine 2",
			sourceType: "file",
		});

		expect(result).not.toContain("\r");
	});
});
