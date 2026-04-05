import type { SourceType } from "../types.js";

interface NormalizeInput {
	title: string;
	content: string;
	sourceType: SourceType;
	originalUrl?: string;
	metadata?: Record<string, unknown>;
}

/**
 * Normalize extracted content into a consistent raw markdown format with frontmatter.
 */
export function normalizeSource(input: NormalizeInput): string {
	const now = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
	const wordCount = countWords(input.content);

	const frontmatter = [
		"---",
		`title: "${escapeFrontmatter(input.title)}"`,
		`source_type: ${input.sourceType}`,
	];

	if (input.originalUrl) {
		frontmatter.push(`url: "${input.originalUrl}"`);
	}

	if (input.metadata?.author) {
		frontmatter.push(`author: "${escapeFrontmatter(String(input.metadata.author))}"`);
	}

	if (input.metadata?.date) {
		frontmatter.push(`date: "${input.metadata.date}"`);
	}

	frontmatter.push(`ingested: "${now}"`);
	frontmatter.push(`word_count: ${wordCount}`);
	frontmatter.push("---");

	return `${frontmatter.join("\n")}\n\n${cleanMarkdown(input.content)}`;
}

/**
 * Generate a filesystem-safe slug from a title.
 */
export function slugify(title: string): string {
	return title
		.toLowerCase()
		.replace(/[^a-z0-9\s-]/g, "")
		.replace(/\s+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "")
		.slice(0, 80);
}

/**
 * Count words in a string.
 */
export function countWords(text: string): number {
	return text
		.replace(/```[\s\S]*?```/g, "") // strip code blocks
		.replace(/`[^`]*`/g, "") // strip inline code
		.replace(/---[\s\S]*?---/g, "") // strip frontmatter
		.replace(/[#*_\[\]()>|]/g, " ") // strip markdown syntax
		.split(/\s+/)
		.filter((w) => w.length > 0).length;
}

function escapeFrontmatter(str: string): string {
	return str.replace(/"/g, '\\"').replace(/\n/g, " ");
}

function cleanMarkdown(content: string): string {
	return (
		content
			// Normalize line endings
			.replace(/\r\n/g, "\n")
			// Remove excessive blank lines (3+ → 2)
			.replace(/\n{3,}/g, "\n\n")
			// Trim
			.trim()
	);
}
