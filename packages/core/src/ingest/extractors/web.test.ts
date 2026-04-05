import { describe, expect, test } from "bun:test";
import { extractFromHtml } from "./web.js";

describe("web extractor", () => {
	describe("extractFromHtml", () => {
		test("extracts title from <title> tag", () => {
			const html = `
				<html>
					<head><title>Test Article - Example Blog</title></head>
					<body><article><p>Content here.</p></article></body>
				</html>
			`;
			const result = extractFromHtml(html, "https://example.com");
			expect(result.title).toBe("Test Article");
		});

		test("prefers og:title over <title>", () => {
			const html = `
				<html>
					<head>
						<title>Fallback Title</title>
						<meta property="og:title" content="OG Title">
					</head>
					<body><article><p>Some long content that makes this valid content for extraction.</p></article></body>
				</html>
			`;
			const result = extractFromHtml(html, "https://example.com");
			expect(result.title).toBe("OG Title");
		});

		test("uses custom title from options", () => {
			const html = `<html><head><title>Original</title></head><body><p>Content.</p></body></html>`;
			const result = extractFromHtml(html, "https://example.com", {
				title: "Custom Title",
			});
			expect(result.title).toBe("Custom Title");
		});

		test("extracts content from <article> tag", () => {
			const html = `
				<html><body>
					<nav>Navigation stuff that should be removed</nav>
					<article>
						<h1>Main Article</h1>
						<p>This is the important article content that we want to extract from the page.</p>
					</article>
					<footer>Footer stuff that should be removed</footer>
				</body></html>
			`;
			const result = extractFromHtml(html, "https://example.com");
			expect(result.content).toContain("Main Article");
			expect(result.content).toContain("important article content");
			expect(result.content).not.toContain("Navigation stuff");
			expect(result.content).not.toContain("Footer stuff");
		});

		test("falls back to <main> when no <article>", () => {
			const html = `
				<html><body>
					<nav>Skip this</nav>
					<main>
						<h1>Main Content</h1>
						<p>This is the main content area with enough text to pass the threshold for extraction.</p>
					</main>
				</body></html>
			`;
			const result = extractFromHtml(html, "https://example.com");
			expect(result.content).toContain("Main Content");
			expect(result.content).not.toContain("Skip this");
		});

		test("falls back to body when no semantic elements", () => {
			const html = `
				<html><body>
					<div>
						<h1>Simple Page</h1>
						<p>Just a simple page with some content.</p>
					</div>
				</body></html>
			`;
			const result = extractFromHtml(html, "https://example.com");
			expect(result.content).toContain("Simple Page");
		});

		test("removes script and style tags", () => {
			const html = `
				<html><body>
					<script>alert('xss')</script>
					<style>.foo { color: red; }</style>
					<article><p>Clean content that should be extracted without any script or style artifacts.</p></article>
				</body></html>
			`;
			const result = extractFromHtml(html, "https://example.com");
			expect(result.content).not.toContain("alert");
			expect(result.content).not.toContain("color: red");
			expect(result.content).toContain("Clean content");
		});

		test("converts HTML headings to markdown", () => {
			const html = `
				<html><body><article>
					<h1>Heading 1</h1>
					<h2>Heading 2</h2>
					<p>Paragraph text underneath the headings with enough length to be valid content for extraction.</p>
				</article></body></html>
			`;
			const result = extractFromHtml(html, "https://example.com");
			expect(result.content).toContain("# Heading 1");
			expect(result.content).toContain("## Heading 2");
		});

		test("converts HTML lists to markdown", () => {
			const html = `
				<html><body><article>
					<ul>
						<li>Item one</li>
						<li>Item two</li>
						<li>Item three</li>
					</ul>
					<p>Some additional content to make this a valid extraction with enough length.</p>
				</article></body></html>
			`;
			const result = extractFromHtml(html, "https://example.com");
			expect(result.content).toContain("Item one");
			expect(result.content).toContain("Item two");
			// Turndown uses "-" bullet markers
			expect(result.content).toMatch(/-\s+Item one/);
		});

		test("converts code blocks to fenced markdown", () => {
			const html = `
				<html><body><article>
					<p>Here is some code that demonstrates the concept with enough context for extraction:</p>
					<pre><code>const x = 1;
const y = 2;</code></pre>
				</article></body></html>
			`;
			const result = extractFromHtml(html, "https://example.com");
			expect(result.content).toContain("```");
			expect(result.content).toContain("const x = 1;");
		});

		test("replaces images with alt text description", () => {
			const html = `
				<html><body><article>
					<p>Content about diagrams and explanations with enough text for extraction threshold.</p>
					<img src="diagram.png" alt="Architecture diagram showing the system layout">
				</article></body></html>
			`;
			const result = extractFromHtml(html, "https://example.com");
			expect(result.content).toContain("[Image: Architecture diagram");
			expect(result.content).not.toContain("diagram.png");
		});

		test("extracts author metadata", () => {
			const html = `
				<html>
					<head><meta name="author" content="Jane Doe"></head>
					<body><article><p>Article content with enough words for extraction threshold to be met.</p></article></body>
				</html>
			`;
			const result = extractFromHtml(html, "https://example.com");
			expect(result.metadata.author).toBe("Jane Doe");
		});

		test("extracts date metadata", () => {
			const html = `
				<html>
					<head><meta property="article:published_time" content="2024-03-15"></head>
					<body><article><p>Article content with enough words for extraction.</p></article></body>
				</html>
			`;
			const result = extractFromHtml(html, "https://example.com");
			expect(result.metadata.date).toBe("2024-03-15");
		});

		test("extracts date from time element", () => {
			const html = `
				<html><body><article>
					<time datetime="2024-06-01">June 1, 2024</time>
					<p>Article content with enough words for extraction threshold to be met by the extractor.</p>
				</article></body></html>
			`;
			const result = extractFromHtml(html, "https://example.com");
			expect(result.metadata.date).toBe("2024-06-01");
		});

		test("preserves URL in metadata", () => {
			const result = extractFromHtml(
				"<html><body><p>Content.</p></body></html>",
				"https://example.com/article",
			);
			expect(result.metadata.url).toBe("https://example.com/article");
		});

		test("strips common title suffixes", () => {
			const html = `<html><head><title>Article Title | My Blog</title></head><body><p>C</p></body></html>`;
			const result = extractFromHtml(html, "https://example.com");
			expect(result.title).toBe("Article Title");
		});

		test("strips title suffix with dash separator", () => {
			const html = `<html><head><title>Great Post - The Newsletter</title></head><body><p>C</p></body></html>`;
			const result = extractFromHtml(html, "https://example.com");
			expect(result.title).toBe("Great Post");
		});

		test("handles title that is only a suffix pattern", () => {
			const html = `<html><head><title></title></head><body><p>Content.</p></body></html>`;
			const result = extractFromHtml(html, "https://example.com");
			expect(result.title).toBe("Untitled");
		});

		test("removes ad-related elements", () => {
			const html = `
				<html><body>
					<article>
						<p>Real content that we want to keep in the extraction with enough words to matter.</p>
						<div class="ad">Buy our product!</div>
						<div class="advertisement">Sponsor content</div>
					</article>
				</body></html>
			`;
			const result = extractFromHtml(html, "https://example.com");
			expect(result.content).toContain("Real content");
			expect(result.content).not.toContain("Buy our product");
			expect(result.content).not.toContain("Sponsor content");
		});

		test("removes cookie banners", () => {
			const html = `
				<html><body>
					<div class="cookie-banner">Accept cookies?</div>
					<article><p>The actual interesting content of the page that we want to extract properly.</p></article>
				</body></html>
			`;
			const result = extractFromHtml(html, "https://example.com");
			expect(result.content).not.toContain("cookie");
			expect(result.content).toContain("actual interesting content");
		});
	});
});
