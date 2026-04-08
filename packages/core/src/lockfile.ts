import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { VAULT_DIR } from "./constants.js";

const LOCK_FILE = "vault.lock";
const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

// Re-entrancy counter: tracks nested withLock calls within the same process
let lockDepth = 0;

interface LockInfo {
	pid: number;
	timestamp: string;
	operation: string;
}

export class VaultLockError extends Error {
	constructor(public readonly lockInfo: LockInfo) {
		super(
			`Vault is locked by process ${lockInfo.pid} (${lockInfo.operation}, started ${lockInfo.timestamp}). ` +
				"If this is stale, remove .kb/vault.lock manually.",
		);
		this.name = "VaultLockError";
	}
}

function lockPath(root: string): string {
	return join(root, VAULT_DIR, LOCK_FILE);
}

function isProcessAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

async function readLock(root: string): Promise<LockInfo | null> {
	const path = lockPath(root);
	try {
		const raw = await readFile(path, "utf-8");
		return JSON.parse(raw) as LockInfo;
	} catch {
		return null;
	}
}

/**
 * Acquire an exclusive lock on the vault.
 * Throws VaultLockError if the vault is already locked by a different live process.
 * Re-entrant: if the current process already holds the lock, this is a no-op.
 * Automatically steals stale locks (dead PID or older than 5 minutes).
 */
export async function acquireLock(root: string, operation = "unknown"): Promise<void> {
	const existing = await readLock(root);

	if (existing) {
		const age = Date.now() - new Date(existing.timestamp).getTime();

		// Re-entrant: same process holds a fresh lock
		if (existing.pid === process.pid && age < STALE_THRESHOLD_MS && lockDepth > 0) {
			lockDepth++;
			return;
		}

		const alive = isProcessAlive(existing.pid);

		if (alive && age < STALE_THRESHOLD_MS) {
			throw new VaultLockError(existing);
		}
		// Stale lock — steal it
	}

	const info: LockInfo = {
		pid: process.pid,
		timestamp: new Date().toISOString(),
		operation,
	};

	const path = lockPath(root);
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, JSON.stringify(info, null, 2), "utf-8");
	lockDepth = 1;
}

/**
 * Release the vault lock. Only removes the lock if it belongs to the current process.
 * Re-entrant: decrements depth and only removes when fully released.
 */
export async function releaseLock(root: string): Promise<void> {
	const existing = await readLock(root);
	if (existing && existing.pid !== process.pid) {
		return; // Not our lock
	}

	// Re-entrant: don't remove until outermost caller releases
	if (lockDepth > 1) {
		lockDepth--;
		return;
	}

	lockDepth = 0;

	try {
		await unlink(lockPath(root));
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
			throw err;
		}
	}
}

/**
 * Check if the vault is currently locked.
 */
export async function isLocked(root: string): Promise<{ locked: boolean; info?: LockInfo }> {
	const info = await readLock(root);
	if (!info) return { locked: false };

	const age = Date.now() - new Date(info.timestamp).getTime();
	const alive = isProcessAlive(info.pid);

	if (!alive || age >= STALE_THRESHOLD_MS) {
		return { locked: false, info }; // Stale
	}

	return { locked: true, info };
}

/**
 * Run a function while holding the vault lock.
 * Lock is always released, even if the function throws.
 */
export async function withLock<T>(
	root: string,
	operation: string,
	fn: () => Promise<T>,
): Promise<T> {
	await acquireLock(root, operation);
	try {
		return await fn();
	} finally {
		await releaseLock(root);
	}
}
