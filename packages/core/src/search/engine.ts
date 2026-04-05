import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { CACHE_DIR, VAULT_DIR, WIKI_DIR } from "../constants.js";
import type { SearchResult } from "../types.js";
import { listWiki, listRaw } from "../vault.js";
import { parseFrontmatter } from "../compile/diff.js";

// ─── Stop Words ──────────────────────────────────────────────────

const STOP_WORDS = new Set([
	"a", "an", "and", "are", "as", "at", "be", "by", "for", "from",
	"has", "he", "in", "is", "it", "its", "of", "on", "or", "she",
	"that", "the", "to", "was", "were", "will", "with", "this",
	"but", "they", "have", "had", "not", "been", "can", "do", "does",
	"did", "would", "could", "should", "may", "might", "shall",
	"which", "who", "whom", "what", "when", "where", "how", "why",
	"all", "each", "every", "both", "few", "more", "most", "other",
	"some", "such", "no", "nor", "only", "own", "same", "so", "than",
	"too", "very", "just", "about", "above", "after", "again",
	"also", "am", "any", "because", "before", "being", "between",
	"during", "here", "if", "into", "itself", "me", "my", "myself",
	"once", "our", "out", "over", "then", "there", "these", "those",
	"through", "under", "until", "up", "we", "while", "you", "your",
]);

// ─── Tokenizer ───────────────────────────────────────────────────

function tokenize(text: string): string[] {
	return text
		.toLowerCase()
		.replace(/[^a-z0-9\s-]/g, " ")
		.split(/\s+/)
		.map(stem)
		.filter((t) => t.length > 1 && !STOP_WORDS.has(t));
}

/** Simple suffix stripping for English. Not a full Porter stemmer, but handles common cases. */
function stem(word: string): string {
	if (word.length < 4) return word;
	// Order matters: try longest suffixes first
	if (word.endsWith("ization")) return word.slice(0, -7) + "ize";
	if (word.endsWith("ational")) return word.slice(0, -7) + "ate";
	if (word.endsWith("iveness")) return word.slice(0, -7) + "ive";
	if (word.endsWith("fulness")) return word.slice(0, -7) + "ful";
	if (word.endsWith("ousli")) return word.slice(0, -5) + "ous";
	if (word.endsWith("ation")) return word.slice(0, -5) + "ate";
	if (word.endsWith("ness")) return word.slice(0, -4);
	if (word.endsWith("ment")) return word.slice(0, -4);
	if (word.endsWith("ting")) return word.slice(0, -3) + "e";
	if (word.endsWith("ing") && word.length > 5) return word.slice(0, -3);
	if (word.endsWith("ies") && word.length > 4) return word.slice(0, -3) + "y";
	if (word.endsWith("ied")) return word.slice(0, -3) + "y";
	if (word.endsWith("ous")) return word.slice(0, -3);
	if (word.endsWith("ful")) return word.slice(0, -3);
	if (word.endsWith("ers")) return word.slice(0, -3);
	if (word.endsWith("ed") && word.length > 4) return word.slice(0, -2);
	if (word.endsWith("ly") && word.length > 4) return word.slice(0, -2);
	if (word.endsWith("es") && word.length > 4) return word.slice(0, -2);
	if (word.endsWith("er") && word.length > 4) return word.slice(0, -2);
	if (word.endsWith("s") && !word.endsWith("ss") && word.length > 3) return word.slice(0, -1);
	return word;
}

// ─── BM25 Index ──────────────────────────────────────────────────

interface Document {
	path: string;
	title: string;
	content: string;
	tokens: string[];
	tokenCount: number;
	termFreqs: Map<string, number>;
}

interface SerializedIndex {
	version: 1;
	documents: {
		path: string;
		title: string;
		snippet: string;
		tokenCount: number;
		termFreqs: [string, number][];
	}[];
	idf: [string, number][];
	avgDl: number;
}

export class SearchIndex {
	private documents: Document[] = [];
	private idf = new Map<string, number>();
	private avgDl = 0;

	// BM25 parameters
	private k1 = 1.5;
	private b = 0.75;

	/**
	 * Build the index from vault files.
	 */
	async build(root: string, scope: "wiki" | "raw" | "all" = "all"): Promise<void> {
		this.documents = [];

		const files: string[] = [];
		if (scope === "wiki" || scope === "all") {
			const wikiFiles = await listWiki(root);
			files.push(
				...wikiFiles.filter(
					(f) => !f.endsWith("INDEX.md") && !f.endsWith("GRAPH.md"),
				),
			);
		}
		if (scope === "raw" || scope === "all") {
			files.push(...(await listRaw(root)));
		}

		for (const filePath of files) {
			const content = await readFile(filePath, "utf-8");
			const { frontmatter, body } = parseFrontmatter(content);
			const title = (frontmatter.title as string) ?? filePath.split("/").pop()?.replace(/\.md$/, "") ?? "";

			const tokens = tokenize(`${title} ${title} ${body}`); // title gets extra weight
			const termFreqs = new Map<string, number>();
			for (const token of tokens) {
				termFreqs.set(token, (termFreqs.get(token) ?? 0) + 1);
			}

			this.documents.push({
				path: filePath,
				title,
				content: body,
				tokens,
				tokenCount: tokens.length,
				termFreqs,
			});
		}

		// Compute IDF
		this.idf.clear();
		const N = this.documents.length;
		const docFreq = new Map<string, number>();

		for (const doc of this.documents) {
			const seen = new Set<string>();
			for (const token of doc.tokens) {
				if (!seen.has(token)) {
					docFreq.set(token, (docFreq.get(token) ?? 0) + 1);
					seen.add(token);
				}
			}
		}

		for (const [term, df] of docFreq) {
			// Standard IDF formula with smoothing
			this.idf.set(term, Math.log((N - df + 0.5) / (df + 0.5) + 1));
		}

		// Average document length
		this.avgDl =
			this.documents.length > 0
				? this.documents.reduce((sum, d) => sum + d.tokenCount, 0) / this.documents.length
				: 0;
	}

	/**
	 * Search the index using BM25 scoring.
	 */
	search(query: string, opts: { limit?: number; threshold?: number } = {}): SearchResult[] {
		const limit = opts.limit ?? 20;
		const threshold = opts.threshold ?? 0;
		const queryTokens = tokenize(query);

		if (queryTokens.length === 0 || this.documents.length === 0) {
			return [];
		}

		const scores: { doc: Document; score: number }[] = [];

		for (const doc of this.documents) {
			let score = 0;
			const dl = doc.tokenCount;

			for (const qt of queryTokens) {
				const tf = doc.termFreqs.get(qt) ?? 0;
				if (tf === 0) continue;

				const idfVal = this.idf.get(qt) ?? 0;
				const tfNorm =
					(tf * (this.k1 + 1)) /
					(tf + this.k1 * (1 - this.b + this.b * (dl / this.avgDl)));

				score += idfVal * tfNorm;
			}

			if (score > threshold) {
				scores.push({ doc, score });
			}
		}

		// Sort by score descending
		scores.sort((a, b) => b.score - a.score);

		return scores.slice(0, limit).map(({ doc, score }) => ({
			path: doc.path,
			score: Math.round(score * 100) / 100,
			snippet: extractSnippet(doc.content, queryTokens),
			title: doc.title || undefined,
		}));
	}

	/**
	 * Serialize the index for caching.
	 */
	serialize(): string {
		const data: SerializedIndex = {
			version: 1,
			documents: this.documents.map((d) => ({
				path: d.path,
				title: d.title,
				snippet: d.content.slice(0, 200),
				tokenCount: d.tokens.length,
				termFreqs: [...d.termFreqs.entries()],
			})),
			idf: [...this.idf.entries()],
			avgDl: this.avgDl,
		};
		return JSON.stringify(data);
	}

	/**
	 * Save index to disk.
	 */
	async save(root: string): Promise<void> {
		const { writeFile, mkdir } = await import("node:fs/promises");
		const dir = join(root, VAULT_DIR, CACHE_DIR);
		await mkdir(dir, { recursive: true });
		await writeFile(join(dir, "search.idx"), this.serialize(), "utf-8");
	}

	/**
	 * Load index from disk.
	 */
	async load(root: string): Promise<boolean> {
		const path = join(root, VAULT_DIR, CACHE_DIR, "search.idx");
		if (!existsSync(path)) return false;

		try {
			const raw = await readFile(path, "utf-8");
			const data = JSON.parse(raw) as SerializedIndex;

			if (data.version !== 1) return false;

			this.documents = data.documents.map((d) => ({
				path: d.path,
				title: d.title,
				content: d.snippet,
				tokens: [], // Not needed for search — termFreqs is enough
				tokenCount: d.tokenCount,
				termFreqs: new Map(d.termFreqs),
			}));
			this.idf = new Map(data.idf);
			this.avgDl = data.avgDl;

			return true;
		} catch {
			return false;
		}
	}

	get documentCount(): number {
		return this.documents.length;
	}
}

/**
 * Extract a relevant snippet from content matching query terms.
 */
function extractSnippet(content: string, queryTokens: string[], maxLength = 150): string {
	const lower = content.toLowerCase();

	// Find the first occurrence of any query token
	let bestPos = 0;
	for (const token of queryTokens) {
		const pos = lower.indexOf(token);
		if (pos !== -1) {
			bestPos = pos;
			break;
		}
	}

	// Extract a window around the match
	const start = Math.max(0, bestPos - 30);
	const end = Math.min(content.length, start + maxLength);
	let snippet = content.slice(start, end).replace(/\n/g, " ").trim();

	if (start > 0) snippet = `...${snippet}`;
	if (end < content.length) snippet = `${snippet}...`;

	return snippet;
}
