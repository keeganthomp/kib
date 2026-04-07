import { Readability } from "@mozilla/readability";
import TurndownService from "turndown";

/**
 * Content script — injected on demand via chrome.scripting.executeScript.
 * Returns extracted page content as { title, content, url }.
 * If text is selected, captures only the selection.
 */
(() => {
	const url = location.href;

	// Check for text selection first
	const selection = window.getSelection()?.toString().trim();
	if (selection && selection.length > 20) {
		return {
			title: document.title || "Untitled",
			content: selection,
			url,
		};
	}

	// Full page extraction via Readability
	const docClone = document.cloneNode(true) as Document;
	const reader = new Readability(docClone);
	const article = reader.parse();

	if (!article?.content) {
		// Fallback: grab body text
		const bodyText = document.body.innerText?.trim();
		return {
			title: document.title || "Untitled",
			content: bodyText || "",
			url,
		};
	}

	// Convert HTML to markdown
	const td = new TurndownService({
		headingStyle: "atx",
		codeBlockStyle: "fenced",
		bulletListMarker: "-",
	});

	// Preserve code blocks
	td.addRule("pre", {
		filter: "pre",
		replacement(content, node) {
			const el = node as HTMLPreElement;
			const code = el.querySelector("code");
			const lang = code?.className?.match(/language-(\w+)/)?.[1] || "";
			const text = code?.textContent || el.textContent || content;
			return `\n\n\`\`\`${lang}\n${text.trim()}\n\`\`\`\n\n`;
		},
	});

	const markdown = td.turndown(article.content);

	return {
		title: article.title || document.title || "Untitled",
		content: markdown,
		url,
	};
})();
