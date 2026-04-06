import { z } from "zod";
import { FileOperationSchema } from "../schemas.js";
import type { FileOperation } from "../types.js";

const FileOperationsArraySchema = z.array(FileOperationSchema);

/**
 * Parse LLM compile output into file operations.
 *
 * The LLM should return a JSON array of {op, path, content} objects.
 * This parser handles various edge cases:
 * - JSON wrapped in markdown code fences
 * - Extra text before/after the JSON
 * - Minor formatting issues
 */
export function parseCompileOutput(raw: string): FileOperation[] {
	const cleaned = extractJson(raw);

	try {
		const parsed = JSON.parse(cleaned);
		return FileOperationsArraySchema.parse(parsed);
	} catch (err) {
		throw new Error(
			`Failed to parse LLM compile output: ${err instanceof Error ? err.message : err}\n\nRaw output (first 500 chars):\n${raw.slice(0, 500)}`,
		);
	}
}

/**
 * Extract JSON array from LLM output that may contain surrounding text.
 */
function extractJson(raw: string): string {
	let text = raw.trim();

	// Strip markdown code fences
	text = text.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "");
	text = text.trim();

	// If it already starts with [, try it directly
	if (text.startsWith("[")) {
		return text;
	}

	// Try to find a JSON array in the text
	const arrayStart = text.indexOf("[");
	const arrayEnd = text.lastIndexOf("]");

	if (arrayStart !== -1 && arrayEnd !== -1 && arrayEnd > arrayStart) {
		return text.slice(arrayStart, arrayEnd + 1);
	}

	// Nothing worked, return as-is and let JSON.parse fail with a clear error
	return text;
}

/**
 * Extract YAML frontmatter from a markdown article string.
 * Returns the frontmatter fields as a Record and the body content.
 */
export function parseFrontmatter(markdown: string): {
	frontmatter: Record<string, unknown>;
	body: string;
} {
	const match = markdown.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
	if (!match) {
		return { frontmatter: {}, body: markdown };
	}

	const rawFrontmatter = match[1]!;
	const body = match[2]!;

	// Simple YAML-like parser for frontmatter (handles common cases)
	const frontmatter: Record<string, unknown> = {};

	for (const line of rawFrontmatter.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;

		// Handle continuation lines (for summary: >)
		const colonIdx = trimmed.indexOf(":");
		if (colonIdx === -1) continue;

		const key = trimmed.slice(0, colonIdx).trim();
		let value: unknown = trimmed.slice(colonIdx + 1).trim();

		// Parse arrays: [tag1, tag2]
		if (typeof value === "string" && value.startsWith("[") && value.endsWith("]")) {
			value = value
				.slice(1, -1)
				.split(",")
				.map((s) => s.trim())
				.filter(Boolean);
		}
		// Parse booleans
		else if (value === "true") value = true;
		else if (value === "false") value = false;
		// Remove quotes
		else if (typeof value === "string" && value.startsWith('"') && value.endsWith('"')) {
			value = value.slice(1, -1);
		}

		if (key) {
			frontmatter[key] = value;
		}
	}

	return { frontmatter, body: body.trim() };
}

/**
 * Extract [[wikilinks]] from markdown content.
 * Returns an array of slug strings.
 */
export function extractWikilinks(content: string): string[] {
	const matches = content.matchAll(/\[\[([^\]]+)\]\]/g);
	const links: string[] = [];
	for (const match of matches) {
		links.push(match[1]!.trim().toLowerCase().replace(/\s+/g, "-"));
	}
	return [...new Set(links)]; // deduplicate
}
