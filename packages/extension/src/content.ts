import { Readability } from "@mozilla/readability";
import TurndownService from "turndown";

/**
 * Content script — injected on demand via chrome.scripting.executeScript.
 * Extracts page content and sends it back via chrome.runtime message.
 * If text is selected, captures only the selection.
 */
(() => {
	const url = location.href;

	// Check for text selection first
	const selection = window.getSelection()?.toString().trim();
	if (selection && selection.length > 20) {
		chrome.runtime.sendMessage({
			type: "kib-extracted",
			data: { title: document.title || "Untitled", content: selection, url },
		});
		return;
	}

	// Full page extraction via Readability
	const docClone = document.cloneNode(true) as Document;
	const reader = new Readability(docClone);
	const article = reader.parse();

	if (!article?.content) {
		// Fallback: grab body text
		const bodyText = document.body.innerText?.trim();
		chrome.runtime.sendMessage({
			type: "kib-extracted",
			data: { title: document.title || "Untitled", content: bodyText || "", url },
		});
		return;
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

	chrome.runtime.sendMessage({
		type: "kib-extracted",
		data: {
			title: article.title || document.title || "Untitled",
			content: markdown,
			url,
		},
	});
})();
