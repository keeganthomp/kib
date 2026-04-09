import { mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { VAULT_DIR } from "../constants.js";

const QUEUE_DIR = "queue";
const FAILED_DIR = "failed";
const MAX_RETRIES = 3;

export interface QueueItem {
	id: string;
	uri: string;
	source: "inbox" | "http" | "folder" | "clipboard";
	timestamp: string;
	options?: {
		title?: string;
		category?: string;
		tags?: string[];
	};
	retries: number;
	lastError?: string;
}

function queueDir(root: string): string {
	return join(root, VAULT_DIR, QUEUE_DIR);
}

function failedDir(root: string): string {
	return join(root, VAULT_DIR, QUEUE_DIR, FAILED_DIR);
}

function itemPath(root: string, id: string): string {
	return join(queueDir(root), `${id}.json`);
}

/** Generate a sortable, unique queue item ID (timestamp + random suffix). */
function generateId(): string {
	const ts = Date.now().toString(36);
	const rand = Math.random().toString(36).slice(2, 8);
	return `${ts}-${rand}`;
}

/** Ensure queue directories exist. */
export async function ensureQueueDirs(root: string): Promise<void> {
	await mkdir(queueDir(root), { recursive: true });
	await mkdir(failedDir(root), { recursive: true });
}

/** Enqueue a URI for ingestion. Returns the item ID. */
export async function enqueue(
	root: string,
	uri: string,
	source: QueueItem["source"],
	options?: QueueItem["options"],
): Promise<string> {
	const id = generateId();
	const item: QueueItem = {
		id,
		uri,
		source,
		timestamp: new Date().toISOString(),
		options,
		retries: 0,
	};
	await ensureQueueDirs(root);
	await writeFile(itemPath(root, id), JSON.stringify(item, null, 2), "utf-8");
	return id;
}

/** Read a single queue item by ID. Returns null if not found. */
export async function readItem(root: string, id: string): Promise<QueueItem | null> {
	try {
		const raw = await readFile(itemPath(root, id), "utf-8");
		return JSON.parse(raw) as QueueItem;
	} catch {
		return null;
	}
}

/**
 * List pending items in FIFO order (sorted by ID which embeds timestamp).
 * Returns at most `limit` items.
 */
export async function listPending(root: string, limit = 50): Promise<QueueItem[]> {
	try {
		const files = await readdir(queueDir(root));
		const jsonFiles = files.filter((f) => f.endsWith(".json")).sort(); // lexicographic = chronological since IDs start with timestamp
		const items: QueueItem[] = [];
		for (const file of jsonFiles.slice(0, limit)) {
			const raw = await readFile(join(queueDir(root), file), "utf-8");
			items.push(JSON.parse(raw) as QueueItem);
		}
		return items;
	} catch {
		return [];
	}
}

/** Remove a successfully processed item from the queue. */
export async function dequeue(root: string, id: string): Promise<void> {
	try {
		await unlink(itemPath(root, id));
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
	}
}

/**
 * Mark an item as failed. Increments retry count.
 * If retries exhausted, moves to failed/ directory.
 * Returns true if the item should be retried, false if moved to failed.
 */
export async function markFailed(root: string, id: string, error: string): Promise<boolean> {
	const item = await readItem(root, id);
	if (!item) return false;

	item.retries += 1;
	item.lastError = error;

	if (item.retries >= MAX_RETRIES) {
		// Move to failed/
		await ensureQueueDirs(root);
		await writeFile(join(failedDir(root), `${id}.json`), JSON.stringify(item, null, 2), "utf-8");
		await dequeue(root, id);
		return false;
	}

	// Update in place for retry
	await writeFile(itemPath(root, id), JSON.stringify(item, null, 2), "utf-8");
	return true;
}

/** List items that have permanently failed. */
export async function listFailed(root: string): Promise<QueueItem[]> {
	try {
		const files = await readdir(failedDir(root));
		const items: QueueItem[] = [];
		for (const file of files.filter((f) => f.endsWith(".json"))) {
			const raw = await readFile(join(failedDir(root), file), "utf-8");
			items.push(JSON.parse(raw) as QueueItem);
		}
		return items;
	} catch {
		return [];
	}
}

/** Clear all failed items. Returns the count removed. */
export async function clearFailed(root: string): Promise<number> {
	try {
		const files = await readdir(failedDir(root));
		const jsonFiles = files.filter((f) => f.endsWith(".json"));
		for (const file of jsonFiles) {
			await unlink(join(failedDir(root), file));
		}
		return jsonFiles.length;
	} catch {
		return 0;
	}
}

/** Get queue depth (number of pending items). Fast — just counts files. */
export async function queueDepth(root: string): Promise<number> {
	try {
		const files = await readdir(queueDir(root));
		return files.filter((f) => f.endsWith(".json")).length;
	} catch {
		return 0;
	}
}
