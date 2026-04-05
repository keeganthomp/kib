import { describe, expect, test } from "bun:test";
import { extractVideoId } from "./youtube.js";

describe("youtube extractor", () => {
	describe("extractVideoId", () => {
		test("extracts from standard watch URL", () => {
			expect(extractVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(
				"dQw4w9WgXcQ",
			);
		});

		test("extracts from short URL", () => {
			expect(extractVideoId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
		});

		test("extracts from embed URL", () => {
			expect(extractVideoId("https://www.youtube.com/embed/dQw4w9WgXcQ")).toBe(
				"dQw4w9WgXcQ",
			);
		});

		test("extracts from URL with extra params", () => {
			expect(
				extractVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=120"),
			).toBe("dQw4w9WgXcQ");
		});

		test("extracts from URL without www", () => {
			expect(extractVideoId("https://youtube.com/watch?v=dQw4w9WgXcQ")).toBe(
				"dQw4w9WgXcQ",
			);
		});

		test("extracts from mobile URL", () => {
			expect(extractVideoId("https://m.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(
				"dQw4w9WgXcQ",
			);
		});

		test("returns null for invalid URL", () => {
			expect(extractVideoId("https://example.com")).toBeNull();
		});

		test("returns null for YouTube URL without video ID", () => {
			expect(extractVideoId("https://www.youtube.com/channel/UCxyz")).toBeNull();
		});

		test("handles whitespace", () => {
			expect(extractVideoId("  https://youtu.be/dQw4w9WgXcQ  ")).toBe("dQw4w9WgXcQ");
		});
	});
});
