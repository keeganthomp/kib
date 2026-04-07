import { readFile } from "node:fs/promises";
import { parseFrontmatter } from "../compile/diff.js";
import { slugify } from "../ingest/normalize.js";
import { SearchIndex } from "../search/engine.js";
import { HybridSearch } from "../search/hybrid.js";
import { VectorIndex } from "../search/vector.js";
import type { CompletionResult, LLMProvider, Message, SearchResult } from "../types.js";
import { appendLog, loadConfig, readIndex, writeWiki } from "../vault.js";

export interface QueryOptions {
	/** Maximum articles to include as context */
	maxArticles?: number;
	/** Existing conversation history (for chat mode) */
	history?: Message[];
	/** Callback for streaming chunks */
	onChunk?: (text: string) => void;
	/** Auto-save answers that cite enough sources as wiki articles */
	autoFile?: boolean;
	/** Minimum sources cited to trigger auto-file (default 3) */
	autoFileThreshold?: number;
}

export interface QueryResult {
	answer: string;
	sourcePaths: string[];
	usage: { inputTokens: number; outputTokens: number };
	/** Path of the auto-filed article, if one was created */
	filedTo?: string;
}

const QUERY_SYSTEM_PROMPT = `You are a knowledge assistant for a personal wiki. Answer questions using ONLY the information provided in the articles below.

RULES:
- Base your answer strictly on the provided articles
- Cite sources using [Article Title] notation when referencing specific information
- If the answer is not in the provided articles, say so clearly
- Be concise and direct
- Use markdown formatting for readability`;

/**
 * Query the knowledge base using RAG:
 * 1. Search for relevant articles
 * 2. Load top articles into context
 * 3. Send to LLM with query
 * 4. Return answer with citations
 */
export async function queryVault(
	root: string,
	question: string,
	provider: LLMProvider,
	options: QueryOptions = {},
): Promise<QueryResult> {
	const maxArticles = options.maxArticles ?? 5;

	// Determine search engine from vault config
	let searchEngine: "builtin" | "vector" | "hybrid" = "builtin";
	try {
		const config = await loadConfig(root);
		searchEngine = config.search.engine;
	} catch {
		// Default to builtin
	}

	// Search for relevant articles
	let searchResults: SearchResult[];

	if (searchEngine === "hybrid" || searchEngine === "vector") {
		const bm25 = new SearchIndex();
		const vector = new VectorIndex();
		const hybrid = new HybridSearch(bm25, vector);
		const loaded = await hybrid.load(root);
		if (!loaded.bm25) {
			await hybrid.build(root, provider, "wiki");
			await hybrid.save(root);
		}
		searchResults = await hybrid.search(question, provider, { limit: maxArticles });
	} else {
		const index = new SearchIndex();
		const loaded = await index.load(root);
		if (!loaded) {
			await index.build(root, "wiki");
		}
		searchResults = index.search(question, { limit: maxArticles });
	}

	// Load the full articles
	const articles: { title: string; path: string; content: string }[] = [];

	for (const result of searchResults) {
		try {
			const content = await readFile(result.path, "utf-8");
			const { frontmatter, body } = parseFrontmatter(content);
			articles.push({
				title: (frontmatter.title as string) ?? result.title ?? result.path,
				path: result.path,
				content: body,
			});
		} catch {
			// File might have been deleted
		}
	}

	// If no articles found, try using INDEX.md as fallback context
	if (articles.length === 0) {
		const indexContent = await readIndex(root);
		if (indexContent) {
			articles.push({
				title: "Knowledge Base Index",
				path: "wiki/INDEX.md",
				content: indexContent,
			});
		}
	}

	// Build context from articles
	const articleContext = articles
		.map((a) => `--- ${a.title} (${a.path}) ---\n${a.content}`)
		.join("\n\n");

	const userMessage =
		articles.length > 0
			? `RELEVANT ARTICLES:\n\n${articleContext}\n\n---\n\nQUESTION: ${question}`
			: `No relevant articles found in the knowledge base.\n\nQUESTION: ${question}`;

	// Build message history
	const messages: Message[] = [...(options.history ?? []), { role: "user", content: userMessage }];

	// Call LLM
	let result: CompletionResult;

	if (options.onChunk) {
		// Streaming mode
		let fullContent = "";
		let usage = { inputTokens: 0, outputTokens: 0 };

		for await (const chunk of provider.stream({
			system: QUERY_SYSTEM_PROMPT,
			messages,
		})) {
			if (chunk.type === "text" && chunk.text) {
				fullContent += chunk.text;
				options.onChunk(chunk.text);
			}
			if (chunk.type === "usage" && chunk.usage) {
				usage = chunk.usage;
			}
		}

		result = {
			content: fullContent,
			usage,
			stopReason: "end_turn",
		};
	} else {
		result = await provider.complete({
			system: QUERY_SYSTEM_PROMPT,
			messages,
		});
	}

	const sourcePaths = articles.map((a) => a.path);
	let filedTo: string | undefined;

	// Auto-file if enough sources were cited
	const threshold = options.autoFileThreshold ?? 3;
	if (options.autoFile && sourcePaths.length >= threshold) {
		try {
			const slug = slugify(question).slice(0, 60);
			const now = new Date().toISOString().split("T")[0];
			const sourcesList = sourcePaths.map((p) => `  - ${p}`).join("\n");

			const article = `---
title: "${question}"
slug: "${slug}"
category: output
tags: [query]
sources:
${sourcesList}
created: ${now}
updated: ${now}
summary: >
  Auto-filed query result citing ${sourcePaths.length} sources.
---

# ${question}

${result.content}

---
*Sources: ${sourcePaths.join(", ")}*
`;

			const filePath = `outputs/${slug}.md`;
			await writeWiki(root, filePath, article);
			await appendLog(root, "query-file", `"${question}" → wiki/${filePath}`);
			filedTo = `wiki/${filePath}`;
		} catch {
			// Auto-file failed — not critical
		}
	}

	return {
		answer: result.content,
		sourcePaths,
		usage: result.usage,
		filedTo,
	};
}
