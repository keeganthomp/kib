import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import type { ExtractOptions, Extractor, ExtractResult } from "./interface.js";

type PdfParseFn = (buffer: Buffer) => Promise<{
	text: string;
	numpages: number;
	info?: { Title?: string; Author?: string };
}>;

// Lazy-load pdf-parse (it's heavy)
let pdfParse: PdfParseFn | null = null;

async function getPdfParse(): Promise<PdfParseFn> {
	if (!pdfParse) {
		const mod = await import("pdf-parse");
		// pdf-parse exports default as the function in some builds
		pdfParse = (mod.default ?? mod) as PdfParseFn;
	}
	return pdfParse;
}

export function createPdfExtractor(): Extractor {
	return {
		type: "pdf",

		async extract(input: string, options?: ExtractOptions): Promise<ExtractResult> {
			const parse = await getPdfParse();

			let buffer: Buffer;
			if (input.startsWith("http://") || input.startsWith("https://")) {
				// Fetch PDF from URL
				const response = await fetch(input, {
					headers: {
						"User-Agent": "Mozilla/5.0 (compatible; kib/0.1)",
					},
					redirect: "follow",
				});
				if (!response.ok) {
					throw new Error(
						`Failed to fetch PDF from ${input}: ${response.status} ${response.statusText}`,
					);
				}
				buffer = Buffer.from(await response.arrayBuffer());
			} else {
				// Read local PDF file
				buffer = await readFile(input);
			}

			const data = await parse(buffer);

			const title =
				options?.title ??
				data.info?.Title ??
				extractTitleFromText(data.text) ??
				formatFilename(input);

			const author = data.info?.Author ?? undefined;
			const date = data.info?.CreationDate ? parsePdfDate(data.info.CreationDate) : undefined;

			// Clean up the extracted text into readable markdown
			const content = formatPdfText(data.text, title);

			return {
				title,
				content,
				metadata: {
					author,
					date,
					pageCount: data.numpages,
					fileType: ".pdf",
				},
			};
		},
	};
}

/**
 * Try to extract a title from the first few lines of PDF text.
 * Academic papers often have the title as the first prominent line.
 */
function extractTitleFromText(text: string): string | undefined {
	const lines = text
		.split("\n")
		.map((l) => l.trim())
		.filter(Boolean);
	// First non-empty line that's between 10-200 chars and doesn't look like metadata
	for (const line of lines.slice(0, 5)) {
		if (
			line.length >= 10 &&
			line.length <= 200 &&
			!line.match(/^(abstract|introduction|page|copyright|\d)/i)
		) {
			return line;
		}
	}
	return undefined;
}

function formatFilename(input: string): string {
	if (input.startsWith("http")) {
		const url = new URL(input);
		const parts = url.pathname.split("/");
		const last = parts[parts.length - 1] ?? "document";
		return last.replace(/\.pdf$/i, "").replace(/[-_]/g, " ");
	}
	const name = basename(input, extname(input));
	return name.replace(/[-_]/g, " ");
}

function formatPdfText(text: string, title: string): string {
	// Split into paragraphs (double newline or more)
	const cleaned = text
		// Normalize whitespace
		.replace(/\r\n/g, "\n")
		// Remove form feeds and other control chars
		.replace(/[\f\v]/g, "\n")
		// Collapse 3+ newlines to 2
		.replace(/\n{3,}/g, "\n\n")
		// Remove lines that are just page numbers
		.replace(/^\s*\d+\s*$/gm, "")
		.trim();

	return `# ${title}\n\n${cleaned}`;
}

/**
 * Parse PDF date format (D:20240315120000+00'00') to ISO date string.
 */
function parsePdfDate(dateStr: string): string | undefined {
	const match = dateStr.match(/D:(\d{4})(\d{2})(\d{2})/);
	if (match) {
		return `${match[1]}-${match[2]}-${match[3]}`;
	}
	return undefined;
}
