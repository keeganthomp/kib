/**
 * Compile-on-ingest pipeline.
 *
 * Instead of the old batch model (ingest N sources, then compile),
 * this processes each source through the full pipeline inline:
 *
 *   extract → ingest → compile → done
 *
 * The pipeline DB tracks status in real-time so the CLI/UI can show
 * live progress. Cross-reference enrichment is deferred and batched
 * (runs after N compilations or on idle).
 */
import type { CompileResult, IngestResult, LLMProvider, VaultConfig } from "../types.js";
import { loadConfig, loadManifest, saveManifest } from "../vault.js";
import type { PipelineDB, SourceStatus } from "./db.js";

export interface PipelineCallbacks {
	/** Fired on each status transition */
	onStatus?: (sourceId: string, status: SourceStatus, detail?: string) => void;
	/** Fired for progress messages during compilation */
	onProgress?: (msg: string) => void;
}

export interface PipelineResult {
	sourceId: string;
	ingest: IngestResult | null;
	compile: CompileResult | null;
	status: SourceStatus;
	error?: string;
	/** Total pipeline time in ms */
	elapsed: number;
}

/**
 * Run a single source through the full ingest → compile pipeline.
 *
 * This is the new default path: every source gets compiled immediately
 * upon ingestion, and the pipeline DB is updated at each step so status
 * is always queryable.
 */
export async function ingestAndCompile(
	root: string,
	uri: string,
	provider: LLMProvider,
	pipelineDB: PipelineDB,
	opts: {
		config?: VaultConfig;
		callbacks?: PipelineCallbacks;
		/** Skip compilation (ingest only) */
		ingestOnly?: boolean;
		/** Override source type */
		sourceType?: string;
		/** Override category */
		category?: string;
		/** Additional tags */
		tags?: string[];
		/** Custom title */
		title?: string;
		/** Preview only */
		dryRun?: boolean;
	} = {},
): Promise<PipelineResult> {
	const start = performance.now();
	const config = opts.config ?? (await loadConfig(root));
	const notify = opts.callbacks?.onStatus;

	// Generate a temporary source ID (will be replaced after hashing)
	const tempId = `src_pending_${Date.now().toString(36)}`;
	let sourceId = tempId;

	// Step 1: Queue
	pipelineDB.enqueue(sourceId, uri);
	notify?.(sourceId, "queued");

	let ingestResult: IngestResult | null = null;
	let compileResult: CompileResult | null = null;

	try {
		// Step 2: Extract + Ingest
		pipelineDB.transition(sourceId, "extracting", `Extracting content from ${uri}`);
		notify?.(sourceId, "extracting", `Extracting ${uri}`);

		const { ingestSource } = await import("../ingest/ingest.js");
		ingestResult = await ingestSource(root, uri, {
			sourceType: opts.sourceType as import("../types.js").SourceType | undefined,
			category: opts.category,
			tags: opts.tags,
			title: opts.title,
			dryRun: opts.dryRun,
			provider,
		});

		// Update source ID to the real one (based on content hash)
		const realId = ingestResult.sourceId;
		if (realId !== sourceId) {
			// Migrate the pipeline entry to the real ID
			const oldSource = pipelineDB.getSource(sourceId);
			if (oldSource) {
				pipelineDB.syncFromManifest(realId, uri, "ingested", {
					sourceType: ingestResult.sourceType,
					title: ingestResult.title,
					wordCount: ingestResult.wordCount,
					contentHash: realId.replace(/^src_/, ""),
				});
				// Clean up temp entry (best effort)
				try {
					pipelineDB.deleteSource(sourceId);
				} catch {
					// Temp entry cleanup is non-critical
				}
			}
			sourceId = realId;
		}

		if (ingestResult.skipped) {
			pipelineDB.transition(sourceId, "compiled", "Duplicate — already processed", {
				source_type: ingestResult.sourceType,
				title: ingestResult.title,
				word_count: ingestResult.wordCount,
			});
			notify?.(sourceId, "compiled", "Duplicate — skipped");

			return {
				sourceId,
				ingest: ingestResult,
				compile: null,
				status: "compiled",
				elapsed: performance.now() - start,
			};
		}

		// Mark as ingested
		pipelineDB.transition(sourceId, "ingested", `Ingested: ${ingestResult.title}`, {
			source_type: ingestResult.sourceType,
			title: ingestResult.title,
			word_count: ingestResult.wordCount,
			content_hash: sourceId.replace(/^src_/, ""),
		});
		notify?.(sourceId, "ingested", ingestResult.title);

		// Step 3: Compile (unless ingest-only)
		if (opts.ingestOnly || opts.dryRun) {
			return {
				sourceId,
				ingest: ingestResult,
				compile: null,
				status: "ingested",
				elapsed: performance.now() - start,
			};
		}

		pipelineDB.transition(sourceId, "compiling", "Starting compilation...");
		notify?.(sourceId, "compiling", `Compiling ${ingestResult.title}`);

		const { compileVault } = await import("../compile/compiler.js");
		compileResult = await compileVault(root, provider, config, {
			sourceFilter: sourceId,
			maxSources: 1,
			onProgress: (msg) => {
				opts.callbacks?.onProgress?.(msg);
			},
		});

		// Update pipeline DB with compile results
		pipelineDB.transition(
			sourceId,
			"compiled",
			`Compiled: ${compileResult.articlesCreated} created, ${compileResult.articlesUpdated} updated`,
			{
				input_tokens: compileResult.tokenUsage?.totalInputTokens ?? 0,
				output_tokens: compileResult.tokenUsage?.totalOutputTokens ?? 0,
				articles_produced: compileResult.articlesCreated + compileResult.articlesUpdated,
			},
		);
		notify?.(sourceId, "compiled");

		return {
			sourceId,
			ingest: ingestResult,
			compile: compileResult,
			status: "compiled",
			elapsed: performance.now() - start,
		};
	} catch (err) {
		const message = (err as Error).message ?? String(err);
		pipelineDB.transition(sourceId, "failed", message);
		notify?.(sourceId, "failed", message);

		return {
			sourceId,
			ingest: ingestResult,
			compile: compileResult,
			status: "failed",
			error: message,
			elapsed: performance.now() - start,
		};
	}
}

/**
 * Batch enrichment pass — runs cross-reference enrichment for all
 * recently compiled sources. Called periodically or after a batch of
 * compile-on-ingest runs.
 */
export async function batchEnrich(
	root: string,
	provider: LLMProvider,
	pipelineDB: PipelineDB,
	callbacks?: PipelineCallbacks,
): Promise<number> {
	const compiled = pipelineDB.listByStatus("compiled", 50);
	if (compiled.length === 0) return 0;

	const config = await loadConfig(root);
	if (config.compile.enrich_cross_refs === false) {
		// Mark all as enriched (no enrichment configured)
		for (const src of compiled) {
			pipelineDB.transition(src.source_id, "enriched", "Cross-ref enrichment disabled");
		}
		return 0;
	}

	const manifest = await loadManifest(root);

	// Collect all recently-compiled article slugs for enrichment
	const recentSlugs = new Set<string>();
	for (const src of compiled) {
		const source = manifest.sources[src.source_id];
		if (source?.producedArticles) {
			for (const path of source.producedArticles) {
				const slug = path
					.replace(/^wiki\//, "")
					.replace(/\.md$/, "")
					.split("/")
					.pop();
				if (slug) recentSlugs.add(slug);
			}
		}
	}

	if (recentSlugs.size === 0) {
		for (const src of compiled) {
			pipelineDB.transition(src.source_id, "enriched", "No articles to enrich");
		}
		return 0;
	}

	callbacks?.onProgress?.(`Enriching cross-references for ${recentSlugs.size} articles...`);

	try {
		const { enrichCrossReferences } = await import("../compile/enrichment.js");
		const result = await enrichCrossReferences(root, provider, manifest, recentSlugs, {
			maxArticles: config.compile.max_enrich_articles,
			onProgress: callbacks?.onProgress,
		});

		await saveManifest(root, manifest);

		// Mark all as enriched
		for (const src of compiled) {
			pipelineDB.transition(
				src.source_id,
				"enriched",
				`Enrichment pass complete (${result.articlesEnriched} articles enriched)`,
			);
		}

		return result.articlesEnriched;
	} catch (err) {
		callbacks?.onProgress?.(`Enrichment failed: ${(err as Error).message}`);
		// Still mark as enriched so they don't block the pipeline
		for (const src of compiled) {
			pipelineDB.transition(src.source_id, "enriched", "Enrichment failed (non-blocking)");
		}
		return 0;
	}
}

/**
 * Sync existing manifest sources into the pipeline DB.
 * Called on first use to bootstrap the DB from existing vault state.
 */
export async function syncManifestToPipeline(
	root: string,
	pipelineDB: PipelineDB,
): Promise<number> {
	const manifest = await loadManifest(root);
	let synced = 0;

	for (const [sourceId, source] of Object.entries(manifest.sources)) {
		const existing = pipelineDB.getSource(sourceId);
		if (existing) continue;

		const status: SourceStatus = source.lastCompiled ? "enriched" : "ingested";
		pipelineDB.syncFromManifest(sourceId, source.originalUrl ?? sourceId, status, {
			sourceType: source.sourceType,
			title: source.metadata.title,
			wordCount: source.metadata.wordCount,
			contentHash: source.hash,
			ingestedAt: source.ingestedAt,
			compiledAt: source.lastCompiled ?? undefined,
		});
		synced++;
	}

	return synced;
}
