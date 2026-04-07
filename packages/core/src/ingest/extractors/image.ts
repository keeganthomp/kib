import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import type { LLMProvider } from "../../types.js";
import type { ExtractOptions, Extractor, ExtractResult } from "./interface.js";

const SUPPORTED_EXTENSIONS = new Set([
	".png",
	".jpg",
	".jpeg",
	".gif",
	".webp",
	".svg",
	".bmp",
	".tiff",
]);

const VISION_PROMPT = `Analyze this image and produce a detailed markdown description. Follow these rules:

1. Start with a concise title (one line) describing what the image shows.
2. Write a structured description covering:
   - What the image depicts (objects, people, scenes, text, diagrams, code, etc.)
   - Any text visible in the image (transcribe it accurately)
   - Layout and structure (if it's a diagram, chart, screenshot, whiteboard, etc.)
   - Key details, labels, and annotations
3. If it's a diagram or flowchart, describe the relationships and flow.
4. If it's a screenshot, extract the visible UI elements and any text content.
5. If it's a whiteboard or handwritten notes, transcribe and organize the content.
6. Use markdown formatting (headings, lists, code blocks) to structure the output.

Return ONLY the markdown content, no preamble.`;

/**
 * Detect MIME type from file extension.
 */
export function mimeTypeFromExt(ext: string): string {
	switch (ext.toLowerCase()) {
		case ".png":
			return "image/png";
		case ".jpg":
		case ".jpeg":
			return "image/jpeg";
		case ".gif":
			return "image/gif";
		case ".webp":
			return "image/webp";
		case ".svg":
			return "image/svg+xml";
		case ".bmp":
			return "image/bmp";
		case ".tiff":
			return "image/tiff";
		default:
			return "image/png";
	}
}

/**
 * Read an image from a local file path or URL into a Buffer.
 */
async function readImage(input: string): Promise<{ buffer: Buffer; ext: string }> {
	if (input.startsWith("http://") || input.startsWith("https://")) {
		const response = await fetch(input);
		if (!response.ok) {
			throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
		}
		const arrayBuf = await response.arrayBuffer();
		// Extract extension from URL path
		const url = new URL(input);
		const ext = extname(url.pathname).toLowerCase() || ".png";
		return { buffer: Buffer.from(arrayBuf), ext };
	}

	const ext = extname(input).toLowerCase();
	if (!SUPPORTED_EXTENSIONS.has(ext)) {
		throw new Error(
			`Unsupported image format: ${ext}. Supported: ${[...SUPPORTED_EXTENSIONS].join(", ")}`,
		);
	}

	const buffer = await readFile(input);
	return { buffer: Buffer.from(buffer), ext };
}

/**
 * Create an image extractor that uses an LLM vision model to describe images.
 */
export function createImageExtractor(provider: LLMProvider): Extractor {
	if (!provider.vision) {
		throw new Error(
			`LLM provider "${provider.name}" does not support vision. Use Anthropic or OpenAI with a vision-capable model.`,
		);
	}

	return {
		type: "image",

		async extract(input: string, options?: ExtractOptions): Promise<ExtractResult> {
			const { buffer, ext } = await readImage(input);
			const name = basename(input, ext);
			const mimeType = mimeTypeFromExt(ext);

			// Send to vision model
			const description = await provider.vision!({
				image: buffer,
				prompt: VISION_PROMPT,
				mimeType,
			});

			// Extract title from the first line of the description, or use filename
			const firstLine = description.split("\n").find((l) => l.trim().length > 0) ?? "";
			const titleFromDescription = firstLine.replace(/^#+\s*/, "").trim();
			const title = options?.title ?? (titleFromDescription || formatTitle(name));

			const content = `# ${title}\n\n**Source image:** \`${basename(input)}\`\n**Format:** ${mimeType}\n\n${description}`;

			return {
				title,
				content,
				metadata: {
					fileType: ext,
					mimeType,
					originalFile: basename(input),
					imageSize: buffer.length,
				},
			};
		},
	};
}

function formatTitle(filename: string): string {
	return filename.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
