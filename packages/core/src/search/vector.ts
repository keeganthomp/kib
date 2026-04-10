import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseFrontmatter } from "../compile/diff.js";
import { CACHE_DIR, VAULT_DIR } from "../constants.js";
import { hash } from "../hash.js";
import type { LLMProvider, SearchResult } from "../types.js";
import { listRaw, listWiki } from "../vault.js";

// ─── Types ──────────────────────────────────────────────────────

interface VectorDocument {
	path: string;
	title: string;
	snippet: string;
	hash: string;
	embedding: Float32Array;
}

interface SerializedVectorIndex {
	version: 2;
	dimensions: number;
	documents: {
		path: string;
		title: string;
		snippet: string;
		hash: string;
	}[];
	/** Base64-encoded Float32Array of all embeddings concatenated */
	embeddings: string;
}

// ─── Vector Math (hot path — keep tight) ────────────────────────

/** Dot product of two Float32Arrays. Vectors must be pre-normalized. */
function dot(a: Float32Array, b: Float32Array): number {
	let sum = 0;
	// Unrolled loop — ~2x faster than naive for typical 1536-dim vectors
	const len = a.length;
	const rem = len & 3;
	let i = 0;
	for (; i < len - rem; i += 4) {
		sum += a[i]! * b[i]! + a[i + 1]! * b[i + 1]! + a[i + 2]! * b[i + 2]! + a[i + 3]! * b[i + 3]!;
	}
	for (; i < len; i++) {
		sum += a[i]! * b[i]!;
	}
	return sum;
}

/** L2-normalize a vector in-place. Returns the same array. */
function normalize(v: Float32Array): Float32Array {
	let norm = 0;
	for (let i = 0; i < v.length; i++) {
		norm += v[i]! * v[i]!;
	}
	norm = Math.sqrt(norm);
	if (norm > 0) {
		for (let i = 0; i < v.length; i++) {
			v[i]! /= norm;
		}
	}
	return v;
}

// ─── Chunking ───────────────────────────────────────────────────

const MAX_CHUNK_CHARS = 2000;
const CHUNK_OVERLAP = 200;

/**
 * Split text into overlapping chunks for better embedding granularity.
 * Splits on paragraph boundaries, falls back to sentence boundaries.
 */
function chunkText(text: string): string[] {
	if (text.length <= MAX_CHUNK_CHARS) return [text];

	const chunks: string[] = [];
	let start = 0;

	while (start < text.length) {
		let end = start + MAX_CHUNK_CHARS;
		if (end >= text.length) {
			chunks.push(text.slice(start));
			break;
		}

		// Try to break at paragraph boundary
		const paraBreak = text.lastIndexOf("\n\n", end);
		if (paraBreak > start + MAX_CHUNK_CHARS / 2) {
			end = paraBreak;
		} else {
			// Try sentence boundary
			const sentBreak = text.lastIndexOf(". ", end);
			if (sentBreak > start + MAX_CHUNK_CHARS / 2) {
				end = sentBreak + 1;
			}
		}

		chunks.push(text.slice(start, end));
		start = end - CHUNK_OVERLAP;
	}

	return chunks;
}

// ─── VectorIndex ────────────────────────────────────────────────

export class VectorIndex {
	private documents: VectorDocument[] = [];
	private dimensions = 0;

	/**
	 * Build the vector index by embedding all vault documents.
	 * Only re-embeds documents whose content has changed.
	 */
	async build(
		root: string,
		provider: LLMProvider,
		scope: "wiki" | "raw" | "all" = "all",
	): Promise<{ total: number; embedded: number }> {
		if (!provider.embed) {
			throw new Error(`Provider "${provider.name}" does not support embeddings`);
		}

		// Load existing index for cache hits
		const existing = new Map<string, VectorDocument>();
		const loaded = await this.load(root);
		if (loaded) {
			for (const doc of this.documents) {
				existing.set(doc.path, doc);
			}
		}

		const files: string[] = [];
		if (scope === "wiki" || scope === "all") {
			const wikiFiles = await listWiki(root);
			files.push(...wikiFiles.filter((f) => !f.endsWith("INDEX.md") && !f.endsWith("GRAPH.md")));
		}
		if (scope === "raw" || scope === "all") {
			files.push(...(await listRaw(root)));
		}

		// Read all files and compute hashes
		const pending: { path: string; title: string; snippet: string; hash: string; text: string }[] =
			[];
		const reused: VectorDocument[] = [];

		for (const filePath of files) {
			const content = await readFile(filePath, "utf-8");
			const { frontmatter, body } = parseFrontmatter(content);
			const title =
				(frontmatter.title as string) ?? filePath.split("/").pop()?.replace(/\.md$/, "") ?? "";
			const contentHash = await hash(body);

			// Check if we already have a valid embedding for this content
			const cached = existing.get(filePath);
			if (cached && cached.hash === contentHash) {
				reused.push(cached);
				continue;
			}

			pending.push({
				path: filePath,
				title,
				snippet: body.slice(0, 200),
				hash: contentHash,
				text: `${title}\n\n${body}`,
			});
		}

		// Embed new/changed documents in batches
		const newDocs: VectorDocument[] = [];

		if (pending.length > 0) {
			// For each document, we take the first chunk for the document-level embedding.
			// This keeps the index 1:1 with documents (simpler, faster search).
			// The title prefix ensures the embedding captures the topic.
			const textsToEmbed = pending.map((p) => {
				const chunks = chunkText(p.text);
				// Use first chunk (which includes title) — covers the core topic
				return chunks[0]!;
			});

			const embeddings = await provider.embed(textsToEmbed);

			for (let i = 0; i < pending.length; i++) {
				const p = pending[i]!;
				const embedding = normalize(embeddings[i]!);
				if (this.dimensions === 0) {
					this.dimensions = embedding.length;
				}
				newDocs.push({
					path: p.path,
					title: p.title,
					snippet: p.snippet,
					hash: p.hash,
					embedding,
				});
			}
		}

		this.documents = [...reused, ...newDocs];
		if (this.documents.length > 0 && this.dimensions === 0) {
			this.dimensions = this.documents[0]!.embedding.length;
		}

		return { total: this.documents.length, embedded: newDocs.length };
	}

	/**
	 * Semantic search: embed the query, find nearest neighbors by cosine similarity.
	 */
	async search(
		query: string,
		provider: LLMProvider,
		opts: { limit?: number; threshold?: number } = {},
	): Promise<SearchResult[]> {
		if (!provider.embed) {
			throw new Error(`Provider "${provider.name}" does not support embeddings`);
		}

		const limit = opts.limit ?? 20;
		const threshold = opts.threshold ?? 0.0;

		if (this.documents.length === 0) return [];

		// Embed the query
		const [queryEmbedding] = await provider.embed([query]);
		if (!queryEmbedding) return [];
		normalize(queryEmbedding);

		// Score all documents — flat scan is fast enough for <100k docs
		const scored: { doc: VectorDocument; score: number }[] = [];

		for (const doc of this.documents) {
			const score = dot(queryEmbedding, doc.embedding);
			if (score > threshold) {
				scored.push({ doc, score });
			}
		}

		scored.sort((a, b) => b.score - a.score);

		return scored.slice(0, limit).map(({ doc, score }) => ({
			path: doc.path,
			score: Math.round(score * 10000) / 10000,
			snippet: doc.snippet,
			title: doc.title || undefined,
		}));
	}

	/**
	 * Save the vector index to disk as a compact binary cache.
	 */
	async save(root: string): Promise<void> {
		const dir = join(root, VAULT_DIR, CACHE_DIR);
		await mkdir(dir, { recursive: true });

		// Pack all embeddings into a single contiguous buffer
		const totalFloats = this.documents.length * this.dimensions;
		const packed = new Float32Array(totalFloats);
		for (let i = 0; i < this.documents.length; i++) {
			packed.set(this.documents[i]!.embedding, i * this.dimensions);
		}

		const data: SerializedVectorIndex = {
			version: 2,
			dimensions: this.dimensions,
			documents: this.documents.map((d) => ({
				path: d.path,
				title: d.title,
				snippet: d.snippet,
				hash: d.hash,
			})),
			embeddings: Buffer.from(packed.buffer).toString("base64"),
		};

		await writeFile(join(dir, "vectors.idx"), JSON.stringify(data), "utf-8");
	}

	/**
	 * Load the vector index from disk.
	 */
	async load(root: string): Promise<boolean> {
		const path = join(root, VAULT_DIR, CACHE_DIR, "vectors.idx");
		if (!existsSync(path)) return false;

		try {
			const raw = await readFile(path, "utf-8");
			const data = JSON.parse(raw) as SerializedVectorIndex;

			if (data.version !== 2) return false;

			const buf = Buffer.from(data.embeddings, "base64");
			const packed = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);

			this.dimensions = data.dimensions;
			this.documents = data.documents.map((d, i) => ({
				path: d.path,
				title: d.title,
				snippet: d.snippet,
				hash: d.hash,
				embedding: packed.slice(i * data.dimensions, (i + 1) * data.dimensions),
			}));

			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Add a single document to the vector index incrementally.
	 * Requires a provider with embed() support. Call save() to persist.
	 */
	async addDocument(
		opts: { path: string; title: string; content: string },
		provider: LLMProvider,
	): Promise<void> {
		if (!provider.embed) {
			throw new Error(`Provider "${provider.name}" does not support embeddings`);
		}

		// Remove existing document with same path (re-ingest)
		this.documents = this.documents.filter((d) => d.path !== opts.path);

		const contentHash = await hash(opts.content);
		const text = `${opts.title}\n\n${opts.content}`;
		const chunks = chunkText(text);
		const [embedding] = await provider.embed([chunks[0]!]);
		if (!embedding) return;
		normalize(embedding);

		if (this.dimensions === 0) {
			this.dimensions = embedding.length;
		}

		this.documents.push({
			path: opts.path,
			title: opts.title,
			snippet: opts.content.slice(0, 200),
			hash: contentHash,
			embedding,
		});
	}

	get documentCount(): number {
		return this.documents.length;
	}
}
