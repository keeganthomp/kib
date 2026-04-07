import type { LLMProvider, SearchResult } from "../types.js";
import type { SearchIndex } from "./engine.js";
import type { VectorIndex } from "./vector.js";

// ─── Reciprocal Rank Fusion ─────────────────────────────────────

const RRF_K = 60; // Standard RRF constant — controls rank sensitivity

/**
 * Fuse two ranked result lists using Reciprocal Rank Fusion.
 * RRF is robust, parameter-free (besides k), and doesn't require score normalization.
 *
 * score(doc) = Σ 1 / (k + rank_i(doc))
 */
function reciprocalRankFusion(lists: SearchResult[][], limit: number): SearchResult[] {
	const scores = new Map<string, { score: number; result: SearchResult }>();

	for (const list of lists) {
		for (let rank = 0; rank < list.length; rank++) {
			const result = list[rank]!;
			const rrfScore = 1 / (RRF_K + rank + 1);
			const existing = scores.get(result.path);
			if (existing) {
				existing.score += rrfScore;
			} else {
				scores.set(result.path, { score: rrfScore, result });
			}
		}
	}

	return [...scores.values()]
		.sort((a, b) => b.score - a.score)
		.slice(0, limit)
		.map(({ score, result }) => ({
			...result,
			score: Math.round(score * 10000) / 10000,
		}));
}

// ─── HybridSearch ───────────────────────────────────────────────

export interface HybridSearchOptions {
	limit?: number;
	/** Weight for BM25 results (0-1). Vector weight = 1 - bm25Weight. */
	bm25Weight?: number;
	/** Minimum BM25 score threshold */
	bm25Threshold?: number;
	/** Minimum vector similarity threshold */
	vectorThreshold?: number;
}

export class HybridSearch {
	private bm25: SearchIndex;
	private vector: VectorIndex;

	constructor(bm25: SearchIndex, vector: VectorIndex) {
		this.bm25 = bm25;
		this.vector = vector;
	}

	/**
	 * Search using both BM25 and vector, fused with RRF.
	 * Falls back to BM25-only if vector index is empty or provider lacks embed.
	 */
	async search(
		query: string,
		provider: LLMProvider,
		opts: HybridSearchOptions = {},
	): Promise<SearchResult[]> {
		const limit = opts.limit ?? 20;
		// Fetch more candidates from each engine for better fusion
		const candidateLimit = Math.min(limit * 3, 100);

		// Always run BM25 (fast, no API call)
		const bm25Results = this.bm25.search(query, {
			limit: candidateLimit,
			threshold: opts.bm25Threshold,
		});

		// Try vector search if available
		let vectorResults: SearchResult[] = [];
		if (provider.embed && this.vector.documentCount > 0) {
			try {
				vectorResults = await this.vector.search(query, provider, {
					limit: candidateLimit,
					threshold: opts.vectorThreshold,
				});
			} catch {
				// Vector search failed — fall back to BM25 only
			}
		}

		if (vectorResults.length === 0) {
			return bm25Results.slice(0, limit);
		}

		return reciprocalRankFusion([bm25Results, vectorResults], limit);
	}

	/**
	 * Build both indexes.
	 */
	async build(
		root: string,
		provider: LLMProvider,
		scope: "wiki" | "raw" | "all" = "all",
	): Promise<{ bm25Docs: number; vectorDocs: number; embedded: number }> {
		// Build BM25 (fast, no API calls)
		await this.bm25.build(root, scope);

		// Build vector index (requires embedding API)
		let vectorDocs = 0;
		let embedded = 0;
		if (provider.embed) {
			const result = await this.vector.build(root, provider, scope);
			vectorDocs = result.total;
			embedded = result.embedded;
		}

		return { bm25Docs: this.bm25.documentCount, vectorDocs, embedded };
	}

	/**
	 * Save both indexes to disk.
	 */
	async save(root: string): Promise<void> {
		await Promise.all([this.bm25.save(root), this.vector.save(root)]);
	}

	/**
	 * Load both indexes from disk.
	 */
	async load(root: string): Promise<{ bm25: boolean; vector: boolean }> {
		const [bm25Loaded, vectorLoaded] = await Promise.all([
			this.bm25.load(root),
			this.vector.load(root),
		]);
		return { bm25: bm25Loaded, vector: vectorLoaded };
	}
}
