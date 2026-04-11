import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { VAULT_DIR } from "../constants.js";
import { PipelineDB } from "./db.js";

let tmpRoot: string;
let db: PipelineDB;

beforeEach(() => {
	tmpRoot = mkdtempSync(join(tmpdir(), "kib-pipeline-"));
	mkdirSync(join(tmpRoot, VAULT_DIR), { recursive: true });
	db = new PipelineDB(tmpRoot);
});

afterEach(() => {
	db.close();
	rmSync(tmpRoot, { recursive: true, force: true });
});

describe("PipelineDB", () => {
	test("enqueue creates a source entry", () => {
		db.enqueue("src_abc123", "https://example.com/article");
		const source = db.getSource("src_abc123");
		expect(source).not.toBeNull();
		expect(source!.status).toBe("queued");
		expect(source!.uri).toBe("https://example.com/article");
	});

	test("transition updates source status", () => {
		db.enqueue("src_test", "https://example.com");
		db.transition("src_test", "extracting", "Starting extraction");
		expect(db.getSource("src_test")!.status).toBe("extracting");

		db.transition("src_test", "ingested", "Content extracted", {
			title: "Test Article",
			word_count: 500,
			source_type: "web",
		});
		const source = db.getSource("src_test");
		expect(source!.status).toBe("ingested");
		expect(source!.title).toBe("Test Article");
		expect(source!.word_count).toBe(500);
	});

	test("transition to failed records error", () => {
		db.enqueue("src_fail", "https://example.com");
		db.transition("src_fail", "failed", "Network timeout");
		const source = db.getSource("src_fail");
		expect(source!.status).toBe("failed");
		expect(source!.error).toBe("Network timeout");
	});

	test("transition to compiled records tokens", () => {
		db.enqueue("src_compile", "https://example.com");
		db.transition("src_compile", "ingested");
		db.transition("src_compile", "compiling");
		db.transition("src_compile", "compiled", "Done", {
			input_tokens: 5000,
			output_tokens: 1500,
			articles_produced: 3,
		});
		const source = db.getSource("src_compile");
		expect(source!.input_tokens).toBe(5000);
		expect(source!.output_tokens).toBe(1500);
		expect(source!.articles_produced).toBe(3);
	});

	test("findByHash returns matching source", () => {
		db.enqueue("src_hash1", "https://example.com");
		db.transition("src_hash1", "ingested", undefined, { content_hash: "abc123" });
		const found = db.findByHash("abc123");
		expect(found).not.toBeNull();
		expect(found!.source_id).toBe("src_hash1");

		expect(db.findByHash("nonexistent")).toBeNull();
	});

	test("listByStatus filters correctly", () => {
		db.enqueue("src_a", "uri_a");
		db.enqueue("src_b", "uri_b");
		db.enqueue("src_c", "uri_c");
		db.transition("src_a", "ingested");
		db.transition("src_b", "ingested");

		const ingested = db.listByStatus("ingested");
		expect(ingested.length).toBe(2);

		const queued = db.listByStatus("queued");
		expect(queued.length).toBe(1);
	});

	test("listAll returns all sources ordered by updated_at", () => {
		db.enqueue("src_1", "uri_1");
		db.enqueue("src_2", "uri_2");
		db.enqueue("src_3", "uri_3");

		const all = db.listAll();
		expect(all.length).toBe(3);
	});

	test("pendingCompilation returns ingested sources", () => {
		db.enqueue("src_p1", "uri_1");
		db.enqueue("src_p2", "uri_2");
		db.enqueue("src_p3", "uri_3");
		db.transition("src_p1", "ingested");
		db.transition("src_p2", "ingested");
		db.transition("src_p3", "compiled");

		const pending = db.pendingCompilation();
		expect(pending.length).toBe(2);
	});

	test("stats aggregates correctly", () => {
		db.enqueue("src_s1", "u1");
		db.enqueue("src_s2", "u2");
		db.enqueue("src_s3", "u3");
		db.transition("src_s1", "compiled", undefined, {
			input_tokens: 1000,
			output_tokens: 500,
		});
		db.transition("src_s2", "failed", "err");

		const stats = db.stats();
		expect(stats.total).toBe(3);
		expect(stats.queued).toBe(1);
		expect(stats.compiled).toBe(1);
		expect(stats.failed).toBe(1);
		expect(stats.total_input_tokens).toBe(1000);
		expect(stats.total_output_tokens).toBe(500);
	});

	test("events records status transitions", () => {
		db.enqueue("src_ev", "uri");
		db.transition("src_ev", "extracting");
		db.transition("src_ev", "ingested");
		db.transition("src_ev", "compiling");

		const events = db.events("src_ev");
		expect(events.length).toBe(4); // queued + 3 transitions
		// Events are ordered by timestamp DESC, so most recent first
		// but all have same timestamp in tests, so order by id DESC
		const statuses = events.map((e) => e.to_status);
		expect(statuses).toContain("queued");
		expect(statuses).toContain("extracting");
		expect(statuses).toContain("ingested");
		expect(statuses).toContain("compiling");
	});

	test("deleteSource removes source and events", () => {
		db.enqueue("src_del", "uri");
		db.transition("src_del", "ingested");
		expect(db.getSource("src_del")).not.toBeNull();
		expect(db.events("src_del").length).toBe(2);

		db.deleteSource("src_del");
		expect(db.getSource("src_del")).toBeNull();
		expect(db.events("src_del").length).toBe(0);
	});

	test("syncFromManifest adds source without duplicating", () => {
		db.syncFromManifest("src_sync", "https://example.com", "compiled", {
			sourceType: "web",
			title: "Synced Article",
			wordCount: 1200,
			contentHash: "hash123",
			ingestedAt: "2026-04-01T00:00:00.000Z",
			compiledAt: "2026-04-01T01:00:00.000Z",
		});

		const source = db.getSource("src_sync");
		expect(source).not.toBeNull();
		expect(source!.title).toBe("Synced Article");

		// Calling again should not duplicate
		db.syncFromManifest("src_sync", "https://example.com", "compiled", {});
		const all = db.listAll();
		expect(all.filter((s) => s.source_id === "src_sync").length).toBe(1);
	});

	test("enqueue with OR IGNORE prevents duplicates", () => {
		db.enqueue("src_dup", "uri1");
		db.enqueue("src_dup", "uri2"); // should be ignored
		const source = db.getSource("src_dup");
		expect(source!.uri).toBe("uri1"); // original URI preserved
	});
});
