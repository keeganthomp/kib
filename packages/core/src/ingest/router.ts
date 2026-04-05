import type { SourceType } from "../types.js";

/**
 * Detect the source type from a URI string (URL or file path).
 */
export function detectSourceType(uri: string): SourceType {
	// Normalize
	const trimmed = uri.trim();

	// URL-based detection
	if (isUrl(trimmed)) {
		const url = new URL(trimmed);
		const hostname = url.hostname.toLowerCase();
		const pathname = url.pathname.toLowerCase();

		// YouTube
		if (
			hostname === "youtube.com" ||
			hostname === "www.youtube.com" ||
			hostname === "m.youtube.com" ||
			hostname === "youtu.be"
		) {
			return "youtube";
		}

		// GitHub
		if (hostname === "github.com" || hostname === "www.github.com") {
			// Only match repo URLs (owner/repo), not arbitrary github pages
			const parts = pathname.split("/").filter(Boolean);
			if (parts.length >= 2) {
				return "github";
			}
		}

		// PDF (URL ending in .pdf or common academic PDF hosts)
		if (pathname.endsWith(".pdf")) {
			return "pdf";
		}

		// ArXiv — these serve PDFs at /pdf/ paths
		if (hostname === "arxiv.org" && pathname.startsWith("/pdf/")) {
			return "pdf";
		}

		// Image URLs
		if (isImagePath(pathname)) {
			return "image";
		}

		// Default: web page
		return "web";
	}

	// Local file-based detection
	const lower = trimmed.toLowerCase();

	if (lower.endsWith(".pdf")) {
		return "pdf";
	}

	if (isImagePath(lower)) {
		return "image";
	}

	if (
		lower.endsWith(".md") ||
		lower.endsWith(".txt") ||
		lower.endsWith(".rst") ||
		lower.endsWith(".org") ||
		lower.endsWith(".html") ||
		lower.endsWith(".htm") ||
		lower.endsWith(".json") ||
		lower.endsWith(".csv") ||
		lower.endsWith(".xml") ||
		lower.endsWith(".yaml") ||
		lower.endsWith(".yml") ||
		lower.endsWith(".toml")
	) {
		return "file";
	}

	// Source code files
	if (
		lower.endsWith(".ts") ||
		lower.endsWith(".js") ||
		lower.endsWith(".py") ||
		lower.endsWith(".go") ||
		lower.endsWith(".rs") ||
		lower.endsWith(".java") ||
		lower.endsWith(".c") ||
		lower.endsWith(".cpp") ||
		lower.endsWith(".h") ||
		lower.endsWith(".rb") ||
		lower.endsWith(".sh") ||
		lower.endsWith(".sql")
	) {
		return "file";
	}

	// If no extension or unrecognized, treat as file
	return "file";
}

function isUrl(str: string): boolean {
	return str.startsWith("http://") || str.startsWith("https://");
}

function isImagePath(path: string): boolean {
	return (
		path.endsWith(".png") ||
		path.endsWith(".jpg") ||
		path.endsWith(".jpeg") ||
		path.endsWith(".gif") ||
		path.endsWith(".webp") ||
		path.endsWith(".svg") ||
		path.endsWith(".bmp") ||
		path.endsWith(".tiff")
	);
}
