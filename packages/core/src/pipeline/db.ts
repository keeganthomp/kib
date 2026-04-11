/**
 * SQLite pipeline database for real-time source lifecycle tracking.
 *
 * Replaces the batch "compile later" model with a live status DB.
 * Uses bun:sqlite (zero-dep, built-in) with WAL mode for concurrent reads.
 *
 * Source lifecycle:
 *   queued → extracting → ingested → compiling → compiled → enriched
 *                                        ↓
 *                                      failed
 */
import { Database } from "bun:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { VAULT_DIR } from "../constants.js";

// ─── Types ──────────────────────────────────────────────────────

export type SourceStatus =
	| "queued"
	| "extracting"
	| "ingested"
	| "compiling"
	| "compiled"
	| "enriched"
	| "failed";

export interface PipelineSource {
	source_id: string;
	uri: string;
	status: SourceStatus;
	source_type: string | null;
	title: string | null;
	word_count: number;
	content_hash: string | null;
	error: string | null;
	input_tokens: number;
	output_tokens: number;
	articles_produced: number;
	queued_at: string;
	ingested_at: string | null;
	compile_started_at: string | null;
	compiled_at: string | null;
	updated_at: string;
}

export interface PipelineEvent {
	id: number;
	source_id: string;
	from_status: SourceStatus | null;
	to_status: SourceStatus;
	timestamp: string;
	detail: string | null;
}

export interface PipelineStats {
	total: number;
	queued: number;
	extracting: number;
	ingested: number;
	compiling: number;
	compiled: number;
	enriched: number;
	failed: number;
	total_input_tokens: number;
	total_output_tokens: number;
}

// ─── Database ───────────────────────────────────────────────────

const PIPELINE_DB_FILE = "pipeline.db";
const SCHEMA_VERSION = 1;

export class PipelineDB {
	private db: Database;

	constructor(root: string) {
		const dbDir = join(root, VAULT_DIR);
		if (!existsSync(dbDir)) {
			mkdirSync(dbDir, { recursive: true });
		}

		this.db = new Database(join(dbDir, PIPELINE_DB_FILE));

		// WAL mode for concurrent reads during compilation
		this.db.run("PRAGMA journal_mode = WAL");
		this.db.run("PRAGMA synchronous = NORMAL");
		this.db.run("PRAGMA busy_timeout = 5000");

		this.migrate();
	}

	// ─── Schema ──────────────────────────────────────────────────

	private migrate(): void {
		this.db.run(`
			CREATE TABLE IF NOT EXISTS schema_version (
				version INTEGER PRIMARY KEY
			)
		`);

		const row = this.db.query("SELECT version FROM schema_version LIMIT 1").get() as {
			version: number;
		} | null;

		if (!row || row.version < SCHEMA_VERSION) {
			this.createTables();
			this.db.run("DELETE FROM schema_version");
			this.db.run("INSERT INTO schema_version (version) VALUES (?)", [SCHEMA_VERSION]);
		}
	}

	private createTables(): void {
		this.db.run(`
			CREATE TABLE IF NOT EXISTS sources (
				source_id     TEXT PRIMARY KEY,
				uri           TEXT NOT NULL,
				status        TEXT NOT NULL DEFAULT 'queued',
				source_type   TEXT,
				title         TEXT,
				word_count    INTEGER DEFAULT 0,
				content_hash  TEXT,
				error         TEXT,
				input_tokens  INTEGER DEFAULT 0,
				output_tokens INTEGER DEFAULT 0,
				articles_produced INTEGER DEFAULT 0,
				queued_at     TEXT NOT NULL DEFAULT (datetime('now')),
				ingested_at   TEXT,
				compile_started_at TEXT,
				compiled_at   TEXT,
				updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
			)
		`);

		this.db.run(`
			CREATE INDEX IF NOT EXISTS idx_sources_status
			ON sources(status)
		`);

		this.db.run(`
			CREATE INDEX IF NOT EXISTS idx_sources_content_hash
			ON sources(content_hash)
		`);

		this.db.run(`
			CREATE TABLE IF NOT EXISTS pipeline_events (
				id          INTEGER PRIMARY KEY AUTOINCREMENT,
				source_id   TEXT NOT NULL,
				from_status TEXT,
				to_status   TEXT NOT NULL,
				timestamp   TEXT NOT NULL DEFAULT (datetime('now')),
				detail      TEXT,
				FOREIGN KEY (source_id) REFERENCES sources(source_id)
			)
		`);

		this.db.run(`
			CREATE INDEX IF NOT EXISTS idx_events_source
			ON pipeline_events(source_id)
		`);

		this.db.run(`
			CREATE INDEX IF NOT EXISTS idx_events_timestamp
			ON pipeline_events(timestamp DESC)
		`);
	}

	// ─── Source Operations ────────────────────────────────────────

	/** Enqueue a new source for processing. Returns source_id. */
	enqueue(sourceId: string, uri: string): string {
		const now = new Date().toISOString();
		this.db.run(
			`INSERT OR IGNORE INTO sources (source_id, uri, status, queued_at, updated_at)
			 VALUES (?, ?, 'queued', ?, ?)`,
			[sourceId, uri, now, now],
		);
		this.recordEvent(sourceId, null, "queued", "Source queued for processing");
		return sourceId;
	}

	/** Transition a source to a new status. */
	transition(
		sourceId: string,
		toStatus: SourceStatus,
		detail?: string,
		extra?: Partial<
			Pick<
				PipelineSource,
				| "source_type"
				| "title"
				| "word_count"
				| "content_hash"
				| "error"
				| "input_tokens"
				| "output_tokens"
				| "articles_produced"
			>
		>,
	): void {
		const current = this.getSource(sourceId);
		const fromStatus = current?.status ?? null;
		const now = new Date().toISOString();

		// Build dynamic UPDATE
		const sets: string[] = ["status = ?", "updated_at = ?"];
		const params: unknown[] = [toStatus, now];

		if (toStatus === "ingested" || toStatus === "extracting") {
			sets.push("ingested_at = ?");
			params.push(now);
		}
		if (toStatus === "compiling") {
			sets.push("compile_started_at = ?");
			params.push(now);
		}
		if (toStatus === "compiled" || toStatus === "enriched") {
			sets.push("compiled_at = ?");
			params.push(now);
		}
		if (toStatus === "failed" && detail) {
			sets.push("error = ?");
			params.push(detail);
		}

		if (extra) {
			for (const [key, value] of Object.entries(extra)) {
				if (value !== undefined) {
					sets.push(`${key} = ?`);
					params.push(value);
				}
			}
		}

		params.push(sourceId);
		this.db.run(`UPDATE sources SET ${sets.join(", ")} WHERE source_id = ?`, params);

		this.recordEvent(sourceId, fromStatus, toStatus, detail ?? null);
	}

	/** Get a source by ID. */
	getSource(sourceId: string): PipelineSource | null {
		return (
			(this.db
				.query("SELECT * FROM sources WHERE source_id = ?")
				.get(sourceId) as PipelineSource | null) ?? null
		);
	}

	/** Check if a content hash already exists (dedup). */
	findByHash(contentHash: string): PipelineSource | null {
		return (
			(this.db
				.query("SELECT * FROM sources WHERE content_hash = ? LIMIT 1")
				.get(contentHash) as PipelineSource | null) ?? null
		);
	}

	/** List sources by status. */
	listByStatus(status: SourceStatus, limit = 100): PipelineSource[] {
		return this.db
			.query("SELECT * FROM sources WHERE status = ? ORDER BY queued_at DESC LIMIT ?")
			.all(status, limit) as PipelineSource[];
	}

	/** List all sources, ordered by most recent first. */
	listAll(limit = 200): PipelineSource[] {
		return this.db
			.query("SELECT * FROM sources ORDER BY updated_at DESC LIMIT ?")
			.all(limit) as PipelineSource[];
	}

	/** Get sources that need compilation (status = 'ingested'). */
	pendingCompilation(limit = 50): PipelineSource[] {
		return this.db
			.query("SELECT * FROM sources WHERE status = 'ingested' ORDER BY queued_at ASC LIMIT ?")
			.all(limit) as PipelineSource[];
	}

	/** Get pipeline statistics. */
	stats(): PipelineStats {
		const row = this.db
			.query(
				`SELECT
					COUNT(*) as total,
					SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END) as queued,
					SUM(CASE WHEN status = 'extracting' THEN 1 ELSE 0 END) as extracting,
					SUM(CASE WHEN status = 'ingested' THEN 1 ELSE 0 END) as ingested,
					SUM(CASE WHEN status = 'compiling' THEN 1 ELSE 0 END) as compiling,
					SUM(CASE WHEN status = 'compiled' THEN 1 ELSE 0 END) as compiled,
					SUM(CASE WHEN status = 'enriched' THEN 1 ELSE 0 END) as enriched,
					SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
					COALESCE(SUM(input_tokens), 0) as total_input_tokens,
					COALESCE(SUM(output_tokens), 0) as total_output_tokens
				FROM sources`,
			)
			.get() as PipelineStats;

		return row;
	}

	/** Get recent events for a source. */
	events(sourceId: string, limit = 20): PipelineEvent[] {
		return this.db
			.query("SELECT * FROM pipeline_events WHERE source_id = ? ORDER BY timestamp DESC LIMIT ?")
			.all(sourceId, limit) as PipelineEvent[];
	}

	/** Get recent events across all sources. */
	recentEvents(limit = 50): PipelineEvent[] {
		return this.db
			.query("SELECT * FROM pipeline_events ORDER BY timestamp DESC LIMIT ?")
			.all(limit) as PipelineEvent[];
	}

	/** Sync a source from the existing manifest into the pipeline DB. */
	syncFromManifest(
		sourceId: string,
		uri: string,
		status: SourceStatus,
		meta: {
			sourceType?: string;
			title?: string;
			wordCount?: number;
			contentHash?: string;
			ingestedAt?: string;
			compiledAt?: string;
		},
	): void {
		const existing = this.getSource(sourceId);
		if (existing) return; // Already tracked

		const now = new Date().toISOString();
		this.db.run(
			`INSERT INTO sources
				(source_id, uri, status, source_type, title, word_count, content_hash,
				 queued_at, ingested_at, compiled_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			[
				sourceId,
				uri,
				status,
				meta.sourceType ?? null,
				meta.title ?? null,
				meta.wordCount ?? 0,
				meta.contentHash ?? null,
				meta.ingestedAt ?? now,
				meta.ingestedAt ?? null,
				meta.compiledAt ?? null,
				now,
			],
		);
	}

	// ─── Internal ────────────────────────────────────────────────

	private recordEvent(
		sourceId: string,
		fromStatus: SourceStatus | null,
		toStatus: SourceStatus,
		detail: string | null,
	): void {
		this.db.run(
			`INSERT INTO pipeline_events (source_id, from_status, to_status, timestamp, detail)
			 VALUES (?, ?, ?, ?, ?)`,
			[sourceId, fromStatus, toStatus, new Date().toISOString(), detail],
		);
	}

	/** Delete a source entry (used for cleanup of temp entries). */
	deleteSource(sourceId: string): void {
		this.db.run("DELETE FROM pipeline_events WHERE source_id = ?", [sourceId]);
		this.db.run("DELETE FROM sources WHERE source_id = ?", [sourceId]);
	}

	/** Close the database connection. */
	close(): void {
		this.db.close();
	}
}

/**
 * Open the pipeline DB for a vault, auto-migrating from manifest if needed.
 */
export function openPipelineDB(root: string): PipelineDB {
	return new PipelineDB(root);
}
