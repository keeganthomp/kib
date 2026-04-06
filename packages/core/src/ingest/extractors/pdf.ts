import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import type { ExtractOptions, Extractor, ExtractResult } from "./interface.js";

type PdfParseFn = (buffer: Buffer) => Promise<{
	text: string;
	numpages: number;
	info?: { Title?: string; Author?: string };
	date?: string;
}>;

// Lazy-load pdf-parse (it's heavy)
let pdfParse: PdfParseFn | null = null;

async function getPdfParse(): Promise<PdfParseFn> {
	if (!pdfParse) {
		const { PDFParse } = await import("pdf-parse");
		pdfParse = async (buffer: Buffer) => {
			const parser = new PDFParse({ data: buffer });

			try {
				const textResult = await parser.getText();
				const infoResult = await parser.getInfo();

				return {
					text: textResult.text,
					numpages: textResult.total,
					info: {
						Title: getOptionalString(infoResult.info?.Title),
						Author: getOptionalString(infoResult.info?.Author),
					},
					date: formatPdfDate(infoResult.getDateNode().CreationDate),
				};
			} finally {
				await parser.destroy();
			}
		};
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
			const date = data.date;

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
 * Normalize parsed PDF dates to YYYY-MM-DD.
 */
function formatPdfDate(date: Date | null | undefined): string | undefined {
	if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
		return undefined;
	}
	return date.toISOString().slice(0, 10);
}

function getOptionalString(value: unknown): string | undefined {
	return typeof value === "string" && value.length > 0 ? value : undefined;
}
