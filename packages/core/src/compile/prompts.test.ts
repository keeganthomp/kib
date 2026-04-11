import { describe, expect, test } from "bun:test";
import { compileSystemPrompt } from "./prompts.js";

describe("compileSystemPrompt", () => {
	test("includes image reference instructions when images provided", () => {
		const prompt = compileSystemPrompt(["concepts", "topics"], {
			imageAssets: ["diagram.png", "photo.jpg"],
		});
		expect(prompt).toContain("IMAGES:");
		expect(prompt).toContain("diagram.png, photo.jpg");
		expect(prompt).toContain("![desc](images/file.ext)");
	});

	test("omits image section when no images", () => {
		const prompt = compileSystemPrompt(["concepts", "topics"]);
		expect(prompt).not.toContain("IMAGES:");
	});

	test("omits image section for empty array", () => {
		const prompt = compileSystemPrompt(["concepts"], { imageAssets: [] });
		expect(prompt).not.toContain("IMAGES:");
	});
});
