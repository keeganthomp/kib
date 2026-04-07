import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LLMProvider } from "../../types.js";
import { createImageExtractor, mimeTypeFromExt } from "./image.js";

let tempDir: string;

afterEach(async () => {
	if (tempDir) await rm(tempDir, { recursive: true, force: true });
});

async function makeTempDir() {
	tempDir = await mkdtemp(join(tmpdir(), "kib-image-test-"));
	return tempDir;
}

/** Create a minimal 1x1 PNG buffer (valid PNG file). */
function createTestPng(): Buffer {
	// Minimal valid PNG: 8-byte signature + IHDR + IDAT + IEND
	return Buffer.from(
		"89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489" +
			"0000000a49444154789c626000000002000198e195280000000049454e44ae426082",
		"hex",
	);
}

function createMockProvider(response: string): LLMProvider {
	return {
		name: "mock",
		async complete() {
			return {
				content: response,
				usage: { inputTokens: 0, outputTokens: 0 },
				stopReason: "end_turn" as const,
			};
		},
		async *stream() {
			yield { type: "text" as const, text: response };
		},
		async vision(_params: { image: Buffer; prompt: string; mimeType?: string }) {
			return response;
		},
	};
}

describe("image extractor", () => {
	test("extracts image with vision model", async () => {
		const dir = await makeTempDir();
		const path = join(dir, "diagram.png");
		await writeFile(path, createTestPng());

		const provider = createMockProvider(
			"# Architecture Diagram\n\nA system architecture showing three microservices.",
		);
		const extractor = createImageExtractor(provider);

		const result = await extractor.extract(path);
		expect(result.title).toBe("Architecture Diagram");
		expect(result.content).toContain("Architecture Diagram");
		expect(result.content).toContain("three microservices");
		expect(result.content).toContain("diagram.png");
		expect(result.metadata.fileType).toBe(".png");
		expect(result.metadata.mimeType).toBe("image/png");
	});

	test("uses custom title from options", async () => {
		const dir = await makeTempDir();
		const path = join(dir, "photo.jpg");
		await writeFile(path, createTestPng()); // content doesn't matter for mock

		const provider = createMockProvider("# Some Description\n\nDetails.");
		const extractor = createImageExtractor(provider);

		const result = await extractor.extract(path, { title: "My Custom Photo" });
		expect(result.title).toBe("My Custom Photo");
	});

	test("detects JPEG mime type", async () => {
		const dir = await makeTempDir();
		const path = join(dir, "photo.jpg");
		await writeFile(path, createTestPng());

		const provider = createMockProvider("# Photo\n\nA photo.");
		const extractor = createImageExtractor(provider);

		const result = await extractor.extract(path);
		expect(result.metadata.mimeType).toBe("image/jpeg");
	});

	test("detects WebP mime type", async () => {
		const dir = await makeTempDir();
		const path = join(dir, "image.webp");
		await writeFile(path, createTestPng());

		const provider = createMockProvider("# WebP Image\n\nContent.");
		const extractor = createImageExtractor(provider);

		const result = await extractor.extract(path);
		expect(result.metadata.mimeType).toBe("image/webp");
	});

	test("falls back to filename when description has no title", async () => {
		const dir = await makeTempDir();
		const path = join(dir, "my-screenshot.png");
		await writeFile(path, createTestPng());

		const provider = createMockProvider("Just some text without a heading.");
		const extractor = createImageExtractor(provider);

		const result = await extractor.extract(path);
		// First line is used as title since there's no heading
		expect(result.title).toBe("Just some text without a heading.");
	});

	test("falls back to formatted filename when description is empty", async () => {
		const dir = await makeTempDir();
		const path = join(dir, "cool-diagram.png");
		await writeFile(path, createTestPng());

		const provider = createMockProvider("");
		const extractor = createImageExtractor(provider);

		const result = await extractor.extract(path);
		expect(result.title).toBe("Cool Diagram");
	});

	test("throws for unsupported image format", async () => {
		const dir = await makeTempDir();
		const path = join(dir, "image.ico");
		await writeFile(path, Buffer.from("fake"));

		const provider = createMockProvider("anything");
		const extractor = createImageExtractor(provider);

		expect(extractor.extract(path)).rejects.toThrow("Unsupported image format");
	});

	test("throws when provider lacks vision support", () => {
		const provider: LLMProvider = {
			name: "no-vision",
			async complete() {
				return {
					content: "",
					usage: { inputTokens: 0, outputTokens: 0 },
					stopReason: "end_turn" as const,
				};
			},
			async *stream() {},
		};

		expect(() => createImageExtractor(provider)).toThrow("does not support vision");
	});

	test("includes imageBuffer in metadata for asset storage", async () => {
		const dir = await makeTempDir();
		const path = join(dir, "test.png");
		const pngBuffer = createTestPng();
		await writeFile(path, pngBuffer);

		const provider = createMockProvider("# Test\n\nContent.");
		const extractor = createImageExtractor(provider);

		const result = await extractor.extract(path);
		expect(result.metadata.imageBuffer).toBeInstanceOf(Buffer);
		expect((result.metadata.imageBuffer as Buffer).length).toBe(pngBuffer.length);
	});

	test("includes image size in metadata", async () => {
		const dir = await makeTempDir();
		const path = join(dir, "test.png");
		const pngBuffer = createTestPng();
		await writeFile(path, pngBuffer);

		const provider = createMockProvider("# Test\n\nContent.");
		const extractor = createImageExtractor(provider);

		const result = await extractor.extract(path);
		expect(result.metadata.imageSize).toBe(pngBuffer.length);
	});

	test("passes mimeType to vision provider", async () => {
		const dir = await makeTempDir();
		const path = join(dir, "photo.jpeg");
		await writeFile(path, createTestPng());

		let receivedMimeType: string | undefined;
		const provider: LLMProvider = {
			name: "spy",
			async complete() {
				return {
					content: "",
					usage: { inputTokens: 0, outputTokens: 0 },
					stopReason: "end_turn" as const,
				};
			},
			async *stream() {},
			async vision(params) {
				receivedMimeType = params.mimeType;
				return "# Photo\n\nA photo.";
			},
		};

		const extractor = createImageExtractor(provider);
		await extractor.extract(path);
		expect(receivedMimeType).toBe("image/jpeg");
	});
});

describe("mimeTypeFromExt", () => {
	test("maps common extensions", () => {
		expect(mimeTypeFromExt(".png")).toBe("image/png");
		expect(mimeTypeFromExt(".jpg")).toBe("image/jpeg");
		expect(mimeTypeFromExt(".jpeg")).toBe("image/jpeg");
		expect(mimeTypeFromExt(".gif")).toBe("image/gif");
		expect(mimeTypeFromExt(".webp")).toBe("image/webp");
		expect(mimeTypeFromExt(".svg")).toBe("image/svg+xml");
		expect(mimeTypeFromExt(".bmp")).toBe("image/bmp");
		expect(mimeTypeFromExt(".tiff")).toBe("image/tiff");
	});

	test("defaults to image/png for unknown extension", () => {
		expect(mimeTypeFromExt(".xyz")).toBe("image/png");
	});

	test("is case insensitive", () => {
		expect(mimeTypeFromExt(".PNG")).toBe("image/png");
		expect(mimeTypeFromExt(".JPG")).toBe("image/jpeg");
	});
});
