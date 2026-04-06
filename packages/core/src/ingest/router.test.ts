import { describe, expect, test } from "bun:test";
import { detectSourceType } from "./router.js";

describe("detectSourceType", () => {
	describe("web URLs", () => {
		test("generic https URL → web", () => {
			expect(detectSourceType("https://example.com/article")).toBe("web");
		});

		test("http URL → web", () => {
			expect(detectSourceType("http://blog.example.com/post")).toBe("web");
		});

		test("URL with query params → web", () => {
			expect(detectSourceType("https://example.com/page?id=123")).toBe("web");
		});

		test("URL with fragment → web", () => {
			expect(detectSourceType("https://docs.example.com/guide#section")).toBe("web");
		});
	});

	describe("YouTube URLs", () => {
		test("youtube.com/watch → youtube", () => {
			expect(detectSourceType("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("youtube");
		});

		test("youtu.be short URL → youtube", () => {
			expect(detectSourceType("https://youtu.be/dQw4w9WgXcQ")).toBe("youtube");
		});

		test("m.youtube.com → youtube", () => {
			expect(detectSourceType("https://m.youtube.com/watch?v=abc123")).toBe("youtube");
		});

		test("youtube.com without www → youtube", () => {
			expect(detectSourceType("https://youtube.com/watch?v=abc123")).toBe("youtube");
		});

		test("youtube playlist → youtube", () => {
			expect(detectSourceType("https://www.youtube.com/playlist?list=PLrAXtmErZgOe")).toBe(
				"youtube",
			);
		});
	});

	describe("GitHub URLs", () => {
		test("github.com repo → github", () => {
			expect(detectSourceType("https://github.com/anthropics/claude-code")).toBe("github");
		});

		test("github.com repo with path → github", () => {
			expect(detectSourceType("https://github.com/anthropics/claude-code/tree/main/src")).toBe(
				"github",
			);
		});

		test("github.com profile only (1 part) → web", () => {
			expect(detectSourceType("https://github.com/anthropics")).toBe("web");
		});

		test("github.com root → web", () => {
			expect(detectSourceType("https://github.com")).toBe("web");
		});
	});

	describe("PDF URLs", () => {
		test("URL ending in .pdf → pdf", () => {
			expect(detectSourceType("https://example.com/paper.pdf")).toBe("pdf");
		});

		test("arxiv PDF URL → pdf", () => {
			expect(detectSourceType("https://arxiv.org/pdf/1706.03762")).toBe("pdf");
		});

		test("arxiv abstract (not PDF) → web", () => {
			expect(detectSourceType("https://arxiv.org/abs/1706.03762")).toBe("web");
		});
	});

	describe("image URLs", () => {
		test("URL ending in .png → image", () => {
			expect(detectSourceType("https://example.com/diagram.png")).toBe("image");
		});

		test("URL ending in .jpg → image", () => {
			expect(detectSourceType("https://example.com/photo.jpg")).toBe("image");
		});

		test("URL ending in .webp → image", () => {
			expect(detectSourceType("https://example.com/hero.webp")).toBe("image");
		});
	});

	describe("local file paths", () => {
		test(".md → file", () => {
			expect(detectSourceType("./notes/paper.md")).toBe("file");
		});

		test(".txt → file", () => {
			expect(detectSourceType("/home/user/doc.txt")).toBe("file");
		});

		test(".pdf → pdf", () => {
			expect(detectSourceType("./papers/attention.pdf")).toBe("pdf");
		});

		test(".png → image", () => {
			expect(detectSourceType("/tmp/whiteboard.png")).toBe("image");
		});

		test(".jpg → image", () => {
			expect(detectSourceType("photo.jpg")).toBe("image");
		});

		test(".ts → file", () => {
			expect(detectSourceType("./src/index.ts")).toBe("file");
		});

		test(".py → file", () => {
			expect(detectSourceType("script.py")).toBe("file");
		});

		test(".html → file", () => {
			expect(detectSourceType("page.html")).toBe("file");
		});

		test(".json → file", () => {
			expect(detectSourceType("data.json")).toBe("file");
		});

		test("no extension → file", () => {
			expect(detectSourceType("Makefile")).toBe("file");
		});

		test("unknown extension → file", () => {
			expect(detectSourceType("data.xyz")).toBe("file");
		});
	});

	describe("edge cases", () => {
		test("trims whitespace", () => {
			expect(detectSourceType("  https://example.com  ")).toBe("web");
		});

		test("case insensitive for file extensions", () => {
			expect(detectSourceType("PAPER.PDF")).toBe("pdf");
		});

		test("case insensitive for image extensions", () => {
			expect(detectSourceType("PHOTO.PNG")).toBe("image");
		});
	});
});
