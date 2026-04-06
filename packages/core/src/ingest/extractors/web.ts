import * as cheerio from "cheerio";
import TurndownService from "turndown";
import type { ExtractOptions, Extractor, ExtractResult } from "./interface.js";

const REMOVE_SELECTORS = [
	"script",
	"style",
	"noscript",
	"iframe",
	"nav",
	"footer",
	"header:not(article header)",
	"aside",
	".sidebar",
	".nav",
	".navigation",
	".menu",
	".footer",
	".header",
	".ad",
	".ads",
	".advertisement",
	".cookie-banner",
	".popup",
	".modal",
	".comments",
	".comment-section",
	"[role='navigation']",
	"[role='banner']",
	"[role='contentinfo']",
	"[role='complementary']",
].join(", ");

const CONTENT_SELECTORS = [
	"article",
	"[role='main']",
	"main",
	".post-content",
	".article-content",
	".entry-content",
	".content",
	"#content",
	".post",
	".article",
	".blog-post",
];

export function createWebExtractor(): Extractor {
	return {
		type: "web",

		async extract(url: string, options?: ExtractOptions): Promise<ExtractResult> {
			const response = await fetch(url, {
				headers: {
					"User-Agent": "Mozilla/5.0 (compatible; kib/0.1; +https://github.com/kib-cli/kib)",
					Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
				},
				redirect: "follow",
			});

			if (!response.ok) {
				throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
			}

			const html = await response.text();
			return extractFromHtml(html, url, options);
		},
	};
}

/**
 * Extract content from raw HTML. Exported for testing without network.
 */
export function extractFromHtml(
	html: string,
	url: string,
	options?: ExtractOptions,
): ExtractResult {
	const $ = cheerio.load(html);

	// Extract metadata before removing elements
	const title =
		options?.title ??
		$('meta[property="og:title"]').attr("content") ??
		$("title").first().text().trim() ??
		$("h1").first().text().trim() ??
		"Untitled";

	const author =
		$('meta[name="author"]').attr("content") ??
		$('meta[property="article:author"]').attr("content") ??
		($('[rel="author"]').first().text().trim() || undefined);

	const date =
		$('meta[property="article:published_time"]').attr("content") ??
		$("time[datetime]").first().attr("datetime") ??
		$('meta[name="date"]').attr("content") ??
		undefined;

	const description =
		$('meta[property="og:description"]').attr("content") ??
		$('meta[name="description"]').attr("content") ??
		undefined;

	// Remove unwanted elements
	$(REMOVE_SELECTORS).remove();

	// Find main content
	let contentHtml = "";
	for (const selector of CONTENT_SELECTORS) {
		const el = $(selector).first();
		if (el.length && el.text().trim().length > 100) {
			contentHtml = el.html() ?? "";
			break;
		}
	}

	// Fallback to body
	if (!contentHtml) {
		contentHtml = $("body").html() ?? $.html();
	}

	// Convert to markdown
	const turndown = new TurndownService({
		headingStyle: "atx",
		codeBlockStyle: "fenced",
		bulletListMarker: "-",
	});

	// Remove image tags by default (they'd be broken links)
	turndown.addRule("images", {
		filter: "img",
		replacement: (_content, node) => {
			const alt = (node as HTMLElement).getAttribute("alt");
			if (alt && alt.length > 5) {
				return `[Image: ${alt}]`;
			}
			return "";
		},
	});

	const markdown = turndown.turndown(contentHtml);

	return {
		title: cleanTitle(title),
		content: markdown,
		metadata: {
			author,
			date,
			description,
			url,
		},
	};
}

function cleanTitle(title: string): string {
	return (
		title
			// Remove common suffixes like "| Site Name" or "- Blog Name"
			.replace(/\s*[|–—-]\s*[^|–—-]+$/, "")
			.trim() || "Untitled"
	);
}
