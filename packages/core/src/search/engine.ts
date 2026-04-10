import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseFrontmatter } from "../compile/diff.js";
import { CACHE_DIR, VAULT_DIR } from "../constants.js";
import type { SearchResult } from "../types.js";
import { listRaw, listWiki } from "../vault.js";

// ─── Stop Words ──────────────────────────────────────────────────

const STOP_WORDS = new Set([
	"a",
	"an",
	"and",
	"are",
	"as",
	"at",
	"be",
	"by",
	"for",
	"from",
	"has",
	"he",
	"in",
	"is",
	"it",
	"its",
	"of",
	"on",
	"or",
	"she",
	"that",
	"the",
	"to",
	"was",
	"were",
	"will",
	"with",
	"this",
	"but",
	"they",
	"have",
	"had",
	"not",
	"been",
	"can",
	"do",
	"does",
	"did",
	"would",
	"could",
	"should",
	"may",
	"might",
	"shall",
	"which",
	"who",
	"whom",
	"what",
	"when",
	"where",
	"how",
	"why",
	"all",
	"each",
	"every",
	"both",
	"few",
	"more",
	"most",
	"other",
	"some",
	"such",
	"no",
	"nor",
	"only",
	"own",
	"same",
	"so",
	"than",
	"too",
	"very",
	"just",
	"about",
	"above",
	"after",
	"again",
	"also",
	"am",
	"any",
	"because",
	"before",
	"being",
	"between",
	"during",
	"here",
	"if",
	"into",
	"itself",
	"me",
	"my",
	"myself",
	"once",
	"our",
	"out",
	"over",
	"then",
	"there",
	"these",
	"those",
	"through",
	"under",
	"until",
	"up",
	"we",
	"while",
	"you",
	"your",
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
	if (word.endsWith("ization")) return `${word.slice(0, -7)}ize`;
	if (word.endsWith("ational")) return `${word.slice(0, -7)}ate`;
	if (word.endsWith("iveness")) return `${word.slice(0, -7)}ive`;
	if (word.endsWith("fulness")) return `${word.slice(0, -7)}ful`;
	if (word.endsWith("ousli")) return `${word.slice(0, -5)}ous`;
	if (word.endsWith("ation")) return `${word.slice(0, -5)}ate`;
	if (word.endsWith("ness")) return word.slice(0, -4);
	if (word.endsWith("ment")) return word.slice(0, -4);
	if (word.endsWith("ting")) return `${word.slice(0, -3)}e`;
	if (word.endsWith("ing") && word.length > 5) return word.slice(0, -3);
	if (word.endsWith("ies") && word.length > 4) return `${word.slice(0, -3)}y`;
	if (word.endsWith("ied")) return `${word.slice(0, -3)}y`;
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
	tags: string[];
	date: string | null;
}

interface SerializedIndex {
	version: 2;
	documents: {
		path: string;
		title: string;
		snippet: string;
		tokenCount: number;
		termFreqs: [string, number][];
		tags: string[];
		date: string | null;
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
			files.push(...wikiFiles.filter((f) => !f.endsWith("INDEX.md") && !f.endsWith("GRAPH.md")));
		}
		if (scope === "raw" || scope === "all") {
			files.push(...(await listRaw(root)));
		}

		for (const filePath of files) {
			const content = await readFile(filePath, "utf-8");
			const { frontmatter, body } = parseFrontmatter(content);
			const title =
				(frontmatter.title as string) ?? filePath.split("/").pop()?.replace(/\.md$/, "") ?? "";

			// Extract tags from frontmatter
			const rawTags = frontmatter.tags;
			const tags: string[] = Array.isArray(rawTags)
				? rawTags.map((t: unknown) => String(t).toLowerCase())
				: [];

			// Extract date from frontmatter (try common field names)
			const rawDate =
				(frontmatter.date as string) ??
				(frontmatter.created as string) ??
				(frontmatter.ingested as string) ??
				null;
			const date = rawDate && !Number.isNaN(Date.parse(String(rawDate))) ? String(rawDate) : null;

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
				tags,
				date,
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
	 * Search the index using BM25 scoring with fuzzy matching, phrase search,
	 * tag filtering, date filtering, and optional highlighting.
	 */
	search(
		query: string,
		opts: {
			limit?: number;
			threshold?: number;
			tag?: string | string[];
			since?: string;
			highlight?: boolean;
		} = {},
	): SearchResult[] {
		const limit = opts.limit ?? 20;
		const threshold = opts.threshold ?? 0;
		const highlight = opts.highlight ?? false;

		// Parse tag filter
		const tagFilter: string[] | null = opts.tag
			? (Array.isArray(opts.tag) ? opts.tag : [opts.tag]).map((t) => t.toLowerCase())
			: null;

		// Parse date filter
		const sinceTs = opts.since ? Date.parse(opts.since) : null;

		// Parse phrases (quoted strings) and remaining terms
		const { phrases, terms } = parseQuery(query);
		const queryTokens = terms.flatMap((t) => tokenize(t));

		if ((queryTokens.length === 0 && phrases.length === 0) || this.documents.length === 0) {
			return [];
		}

		const scores: { doc: Document; score: number }[] = [];

		for (const doc of this.documents) {
			// Tag filter: skip docs that don't have all required tags
			if (tagFilter && !tagFilter.every((t) => doc.tags.includes(t))) {
				continue;
			}

			// Date filter: skip docs older than --since
			if (sinceTs && doc.date) {
				const docTs = Date.parse(doc.date);
				if (!Number.isNaN(docTs) && docTs < sinceTs) continue;
			}

			// Phrase filter: skip docs that don't contain all exact phrases
			if (phrases.length > 0) {
				const lowerContent = `${doc.title} ${doc.content}`.toLowerCase();
				if (!phrases.every((p) => lowerContent.includes(p.toLowerCase()))) {
					continue;
				}
			}

			let score = 0;
			const dl = doc.tokenCount;

			for (const qt of queryTokens) {
				// Exact match first
				let tf = doc.termFreqs.get(qt) ?? 0;

				// Fuzzy match: if no exact hit, check edit distance ≤ 1 for tokens ≥ 4 chars
				if (tf === 0 && qt.length >= 4) {
					for (const [docToken, freq] of doc.termFreqs) {
						if (editDistance1(qt, docToken)) {
							tf = Math.ceil(freq * 0.8); // discount fuzzy matches slightly
							break;
						}
					}
				}

				if (tf === 0) continue;

				const idfVal = this.idf.get(qt) ?? this.computeFuzzyIdf(qt);
				const tfNorm =
					(tf * (this.k1 + 1)) / (tf + this.k1 * (1 - this.b + this.b * (dl / this.avgDl)));

				score += idfVal * tfNorm;
			}

			// Give a bonus for phrase matches (phrases already filtered above)
			if (phrases.length > 0) {
				score += phrases.length * 2.0;
			}

			if (score > threshold) {
				scores.push({ doc, score });
			}
		}

		// Sort by score descending
		scores.sort((a, b) => b.score - a.score);

		// Collect all terms for highlighting (query tokens + phrase words)
		const highlightTerms = highlight
			? [...queryTokens, ...phrases.flatMap((p) => tokenize(p))]
			: [];

		return scores.slice(0, limit).map(({ doc, score }) => ({
			path: doc.path,
			score: Math.round(score * 100) / 100,
			snippet: highlight
				? highlightSnippet(
						extractSnippet(doc.content, [...queryTokens, ...phrases]),
						highlightTerms,
					)
				: extractSnippet(doc.content, [...queryTokens, ...phrases]),
			title: doc.title || undefined,
		}));
	}

	/**
	 * Compute approximate IDF for a fuzzy-matched term by finding the closest known term.
	 */
	private computeFuzzyIdf(token: string): number {
		for (const [term, idf] of this.idf) {
			if (editDistance1(token, term)) return idf * 0.8;
		}
		return 0;
	}

	/**
	 * Serialize the index for caching.
	 */
	serialize(): string {
		const data: SerializedIndex = {
			version: 2,
			documents: this.documents.map((d) => ({
				path: d.path,
				title: d.title,
				snippet: d.content.slice(0, 200),
				tokenCount: d.tokenCount,
				termFreqs: [...d.termFreqs.entries()],
				tags: d.tags,
				date: d.date,
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
			const version = data.version as number;

			if (version !== 1 && version !== 2) return false;

			this.documents = data.documents.map((d) => ({
				path: d.path,
				title: d.title,
				content: d.snippet,
				tokens: [], // Not needed for search — termFreqs is enough
				tokenCount: d.tokenCount,
				termFreqs: new Map(d.termFreqs),
				tags: (d as { tags?: string[] }).tags ?? [],
				date: (d as { date?: string | null }).date ?? null,
			}));
			this.idf = new Map(data.idf);
			this.avgDl = data.avgDl;

			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Add a single document to the index incrementally (no full rebuild needed).
	 * Recomputes IDF after insertion. Call save() to persist.
	 */
	addDocument(opts: {
		path: string;
		title: string;
		content: string;
		tags?: string[];
		date?: string | null;
	}): void {
		// Remove existing document with same path (re-ingest of same source)
		this.documents = this.documents.filter((d) => d.path !== opts.path);

		const tokens = tokenize(`${opts.title} ${opts.title} ${opts.content}`);
		const termFreqs = new Map<string, number>();
		for (const token of tokens) {
			termFreqs.set(token, (termFreqs.get(token) ?? 0) + 1);
		}

		const tags = opts.tags?.map((t) => t.toLowerCase()) ?? [];
		const date =
			opts.date && !Number.isNaN(Date.parse(String(opts.date))) ? String(opts.date) : null;

		this.documents.push({
			path: opts.path,
			title: opts.title,
			content: opts.content,
			tokens,
			tokenCount: tokens.length,
			termFreqs,
			tags,
			date,
		});

		// Recompute IDF with the updated document set
		this.recomputeIdf();
	}

	/**
	 * Recompute IDF values and average document length from current documents.
	 */
	private recomputeIdf(): void {
		this.idf.clear();
		const N = this.documents.length;
		const docFreq = new Map<string, number>();

		for (const doc of this.documents) {
			// Use termFreqs.keys() instead of tokens — loaded docs have tokens: []
			// but termFreqs is always populated (from serialization or addDocument)
			for (const term of doc.termFreqs.keys()) {
				docFreq.set(term, (docFreq.get(term) ?? 0) + 1);
			}
		}

		for (const [term, df] of docFreq) {
			this.idf.set(term, Math.log((N - df + 0.5) / (df + 0.5) + 1));
		}

		this.avgDl =
			this.documents.length > 0
				? this.documents.reduce((sum, d) => sum + d.tokenCount, 0) / this.documents.length
				: 0;
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

// ─── Query Parser ───────────────────────────────────────────────

/**
 * Parse a search query into exact phrases (quoted) and remaining terms.
 * Example: `"attention mechanism" transformer` → phrases: ["attention mechanism"], terms: ["transformer"]
 */
export function parseQuery(query: string): { phrases: string[]; terms: string[] } {
	const phrases: string[] = [];
	const remaining = query.replace(/"([^"]+)"/g, (_match, phrase: string) => {
		phrases.push(phrase);
		return "";
	});
	const terms = remaining
		.split(/\s+/)
		.map((t) => t.trim())
		.filter(Boolean);
	return { phrases, terms };
}

// ─── Fuzzy Matching ─────────────────────────────────────────────

/**
 * Check if two strings have edit distance ≤ 1 (substitution, insertion, or deletion).
 * Optimized: avoids full DP matrix by bailing early.
 */
export function editDistance1(a: string, b: string): boolean {
	const lenDiff = a.length - b.length;
	if (lenDiff > 1 || lenDiff < -1) return false;

	if (a.length === b.length) {
		// Check for exactly one substitution
		let diffs = 0;
		for (let i = 0; i < a.length; i++) {
			if (a[i] !== b[i]) {
				diffs++;
				if (diffs > 1) return false;
			}
		}
		return diffs === 1;
	}

	// One is longer by 1: check for single insertion/deletion
	const longer = a.length > b.length ? a : b;
	const shorter = a.length > b.length ? b : a;
	let i = 0;
	let j = 0;
	let diffs = 0;
	while (i < longer.length && j < shorter.length) {
		if (longer[i] !== shorter[j]) {
			diffs++;
			if (diffs > 1) return false;
			i++; // skip the extra char in the longer string
		} else {
			i++;
			j++;
		}
	}
	return true;
}

// ─── Highlighting ───────────────────────────────────────────────

/**
 * Highlight matched terms in a snippet using ANSI bold.
 * Matches stemmed forms so "transformers" highlights when searching for "transformer".
 */
export function highlightSnippet(snippet: string, queryTokens: string[]): string {
	if (queryTokens.length === 0) return snippet;

	// Build a regex that matches any word whose stem matches a query token
	// We match whole words and check stems
	return snippet.replace(/[a-zA-Z0-9]+/g, (word) => {
		const stemmed = stem(word.toLowerCase());
		if (queryTokens.some((qt) => stemmed === qt || editDistance1(stemmed, qt))) {
			return `\x1b[1m${word}\x1b[22m`; // ANSI bold
		}
		return word;
	});
}
