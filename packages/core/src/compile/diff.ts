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
 * Handles: code fences, leading/trailing prose, truncated output, nested brackets in strings.
 */
function extractJson(raw: string): string {
	let text = raw.trim();

	// Strip all markdown code fences (including nested ones wrapping the whole output)
	text = text.replace(/^```(?:json)?\s*\n?/gi, "").replace(/\n?```\s*$/gi, "");
	text = text.trim();

	// Find the first top-level [ and walk to its matching ]
	const arrayStart = text.indexOf("[");
	if (arrayStart === -1) return text;

	let depth = 0;
	let inString = false;
	let escaped = false;
	let arrayEnd = -1;

	for (let i = arrayStart; i < text.length; i++) {
		const ch = text[i];

		if (escaped) {
			escaped = false;
			continue;
		}

		if (ch === "\\") {
			escaped = true;
			continue;
		}

		if (ch === '"') {
			inString = !inString;
			continue;
		}

		if (inString) continue;

		if (ch === "[" || ch === "{") depth++;
		else if (ch === "]" || ch === "}") {
			depth--;
			if (depth === 0) {
				arrayEnd = i;
				break;
			}
		}
	}

	if (arrayEnd !== -1) {
		return text.slice(arrayStart, arrayEnd + 1);
	}

	// Truncated output — try to repair by closing open structures
	if (depth > 0) {
		let repaired = text.slice(arrayStart);
		// If we're inside a string, close it
		if (inString) repaired += '"';
		// Strip any trailing incomplete key-value pair
		repaired = repaired.replace(/,\s*"[^"]*"?\s*:?\s*"?[^"]*$/, "");
		// Close remaining open structures
		// Find what's still open by re-scanning
		let s = false;
		let esc = false;
		const stack: string[] = [];
		for (const c of repaired) {
			if (esc) {
				esc = false;
				continue;
			}
			if (c === "\\") {
				esc = true;
				continue;
			}
			if (c === '"') {
				s = !s;
				continue;
			}
			if (s) continue;
			if (c === "[") stack.push("]");
			else if (c === "{") stack.push("}");
			else if (c === "]" || c === "}") stack.pop();
		}
		// Close in reverse order
		repaired += stack.reverse().join("");
		return repaired;
	}

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
