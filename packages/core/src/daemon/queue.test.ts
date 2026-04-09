import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initVault } from "../vault.js";
import {
	clearFailed,
	dequeue,
	enqueue,
	listFailed,
	listPending,
	markFailed,
	queueDepth,
	readItem,
} from "./queue.js";

let tempDir: string;

afterEach(async () => {
	if (tempDir) {
		await rm(tempDir, { recursive: true, force: true });
	}
});

async function makeTempVault() {
	tempDir = await mkdtemp(join(tmpdir(), "kib-queue-test-"));
	await initVault(tempDir, { name: "queue-test" });
	return tempDir;
}

describe("enqueue", () => {
	test("creates a queue item file and returns an ID", async () => {
		const root = await makeTempVault();
		const id = await enqueue(root, "/path/to/file.md", "inbox");
		expect(id).toBeTruthy();
		expect(typeof id).toBe("string");

		const item = await readItem(root, id);
		expect(item).not.toBeNull();
		expect(item!.uri).toBe("/path/to/file.md");
		expect(item!.source).toBe("inbox");
		expect(item!.retries).toBe(0);
	});

	test("stores options when provided", async () => {
		const root = await makeTempVault();
		const id = await enqueue(root, "https://example.com", "http", {
			title: "Test Article",
			tags: ["test", "example"],
		});

		const item = await readItem(root, id);
		expect(item!.options?.title).toBe("Test Article");
		expect(item!.options?.tags).toEqual(["test", "example"]);
	});

	test("generates unique IDs", async () => {
		const root = await makeTempVault();
		const ids = new Set<string>();
		for (let i = 0; i < 100; i++) {
			ids.add(await enqueue(root, `/file-${i}.md`, "inbox"));
		}
		expect(ids.size).toBe(100);
	});
});

describe("listPending", () => {
	test("returns empty array when queue is empty", async () => {
		const root = await makeTempVault();
		const items = await listPending(root);
		expect(items).toEqual([]);
	});

	test("returns items in FIFO order", async () => {
		const root = await makeTempVault();
		const id1 = await enqueue(root, "/first.md", "inbox");
		// Small delay to ensure different timestamp in ID
		await new Promise((r) => setTimeout(r, 5));
		const id2 = await enqueue(root, "/second.md", "inbox");
		await new Promise((r) => setTimeout(r, 5));
		const id3 = await enqueue(root, "/third.md", "folder");

		const items = await listPending(root);
		expect(items.length).toBe(3);
		expect(items[0].id).toBe(id1);
		expect(items[1].id).toBe(id2);
		expect(items[2].id).toBe(id3);
	});

	test("respects limit parameter", async () => {
		const root = await makeTempVault();
		for (let i = 0; i < 10; i++) {
			await enqueue(root, `/file-${i}.md`, "inbox");
		}
		const items = await listPending(root, 3);
		expect(items.length).toBe(3);
	});

	test("does not include items in the failed/ subdirectory", async () => {
		const root = await makeTempVault();
		const id1 = await enqueue(root, "/good.md", "inbox");
		const id2 = await enqueue(root, "/bad.md", "inbox");

		// Fail id2 completely
		await markFailed(root, id2, "err");
		await markFailed(root, id2, "err");
		await markFailed(root, id2, "err");

		const pending = await listPending(root);
		expect(pending.length).toBe(1);
		expect(pending[0].id).toBe(id1);
	});
});

describe("dequeue", () => {
	test("removes an item from the queue", async () => {
		const root = await makeTempVault();
		const id = await enqueue(root, "/file.md", "inbox");
		expect(await readItem(root, id)).not.toBeNull();

		await dequeue(root, id);
		expect(await readItem(root, id)).toBeNull();
	});

	test("does not throw for non-existent items", async () => {
		const root = await makeTempVault();
		await dequeue(root, "non-existent-id"); // should not throw
	});
});

describe("markFailed", () => {
	test("increments retry count and preserves item for retry", async () => {
		const root = await makeTempVault();
		const id = await enqueue(root, "/file.md", "inbox");

		const shouldRetry = await markFailed(root, id, "connection timeout");
		expect(shouldRetry).toBe(true);

		const item = await readItem(root, id);
		expect(item!.retries).toBe(1);
		expect(item!.lastError).toBe("connection timeout");
	});

	test("moves to failed/ after max retries exhausted", async () => {
		const root = await makeTempVault();
		const id = await enqueue(root, "/file.md", "inbox");

		// Exhaust retries (MAX_RETRIES = 3)
		await markFailed(root, id, "error 1"); // retry 1
		await markFailed(root, id, "error 2"); // retry 2
		const shouldRetry = await markFailed(root, id, "error 3"); // retry 3 → failed
		expect(shouldRetry).toBe(false);

		// Should be gone from pending
		expect(await readItem(root, id)).toBeNull();
		expect(await queueDepth(root)).toBe(0);

		// Should be in failed/
		const failed = await listFailed(root);
		expect(failed.length).toBe(1);
		expect(failed[0].id).toBe(id);
		expect(failed[0].retries).toBe(3);
		expect(failed[0].lastError).toBe("error 3");
	});

	test("returns false for non-existent items", async () => {
		const root = await makeTempVault();
		const result = await markFailed(root, "ghost", "error");
		expect(result).toBe(false);
	});

	test("preserves error message from each failure", async () => {
		const root = await makeTempVault();
		const id = await enqueue(root, "/file.md", "inbox");

		await markFailed(root, id, "timeout");
		let item = await readItem(root, id);
		expect(item!.lastError).toBe("timeout");

		await markFailed(root, id, "DNS failure");
		item = await readItem(root, id);
		expect(item!.lastError).toBe("DNS failure");
		expect(item!.retries).toBe(2);
	});
});

describe("queueDepth", () => {
	test("returns 0 for empty queue", async () => {
		const root = await makeTempVault();
		expect(await queueDepth(root)).toBe(0);
	});

	test("tracks enqueue and dequeue correctly", async () => {
		const root = await makeTempVault();
		const id1 = await enqueue(root, "/a.md", "inbox");
		await enqueue(root, "/b.md", "inbox");
		expect(await queueDepth(root)).toBe(2);

		await dequeue(root, id1);
		expect(await queueDepth(root)).toBe(1);
	});

	test("does not count failed items in depth", async () => {
		const root = await makeTempVault();
		const id = await enqueue(root, "/a.md", "inbox");
		await enqueue(root, "/b.md", "inbox");

		// Fail one completely
		await markFailed(root, id, "err");
		await markFailed(root, id, "err");
		await markFailed(root, id, "err");

		expect(await queueDepth(root)).toBe(1);
	});
});

describe("clearFailed", () => {
	test("removes all failed items and returns count", async () => {
		const root = await makeTempVault();

		// Create two items and fail them completely
		for (const uri of ["/a.md", "/b.md"]) {
			const id = await enqueue(root, uri, "inbox");
			await markFailed(root, id, "err");
			await markFailed(root, id, "err");
			await markFailed(root, id, "err"); // moves to failed/
		}

		expect((await listFailed(root)).length).toBe(2);
		const cleared = await clearFailed(root);
		expect(cleared).toBe(2);
		expect((await listFailed(root)).length).toBe(0);
	});

	test("returns 0 when no failed items", async () => {
		const root = await makeTempVault();
		expect(await clearFailed(root)).toBe(0);
	});
});

describe("concurrent operations", () => {
	test("parallel enqueues produce unique items", async () => {
		const root = await makeTempVault();
		const promises = Array.from({ length: 50 }, (_, i) =>
			enqueue(root, `/parallel-${i}.md`, "inbox"),
		);
		const ids = await Promise.all(promises);
		expect(new Set(ids).size).toBe(50);
		expect(await queueDepth(root)).toBe(50);
	});

	test("all source types are accepted", async () => {
		const root = await makeTempVault();
		const sources = ["inbox", "http", "folder", "clipboard"] as const;
		for (const src of sources) {
			const id = await enqueue(root, `/file-${src}`, src);
			const item = await readItem(root, id);
			expect(item!.source).toBe(src);
		}
	});
});

describe("performance", () => {
	test("enqueue + dequeue 500 items in under 2 seconds", async () => {
		const root = await makeTempVault();
		const start = performance.now();

		const ids: string[] = [];
		for (let i = 0; i < 500; i++) {
			ids.push(await enqueue(root, `/file-${i}.md`, "inbox"));
		}
		for (const id of ids) {
			await dequeue(root, id);
		}

		const elapsed = performance.now() - start;
		expect(elapsed).toBeLessThan(2000);
	});

	test("listPending with 200 items returns in under 500ms", async () => {
		const root = await makeTempVault();
		for (let i = 0; i < 200; i++) {
			await enqueue(root, `/file-${i}.md`, "inbox");
		}

		const start = performance.now();
		const items = await listPending(root, 200);
		const elapsed = performance.now() - start;

		expect(items.length).toBe(200);
		expect(elapsed).toBeLessThan(500);
	});
});
