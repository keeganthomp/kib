import { afterEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { acquireLock, isLocked, releaseLock, withLock } from "./lockfile.js";
import { initVault } from "./vault.js";

let tempDir: string;

afterEach(async () => {
	if (tempDir) {
		await rm(tempDir, { recursive: true, force: true });
	}
});

async function makeTempVault() {
	tempDir = await mkdtemp(join(tmpdir(), "kib-lock-test-"));
	await initVault(tempDir, { name: "lock-test" });
	return tempDir;
}

describe("acquireLock", () => {
	test("creates a lock file", async () => {
		const dir = await makeTempVault();
		await acquireLock(dir, "test");

		const lockPath = join(dir, ".kb", "vault.lock");
		expect(existsSync(lockPath)).toBe(true);

		const info = JSON.parse(await readFile(lockPath, "utf-8"));
		expect(info.pid).toBe(process.pid);
		expect(info.operation).toBe("test");

		await releaseLock(dir);
	});

	test("is re-entrant for same process", async () => {
		const dir = await makeTempVault();
		await acquireLock(dir, "first");

		// Same process — should succeed (re-entrant)
		await acquireLock(dir, "second");

		// First release just decrements depth
		await releaseLock(dir);
		const lockPath = join(dir, ".kb", "vault.lock");
		expect(existsSync(lockPath)).toBe(true); // Still locked (depth > 0)

		// Second release actually removes the lock
		await releaseLock(dir);
		expect(existsSync(lockPath)).toBe(false);
	});

	test("steals lock from dead process", async () => {
		const dir = await makeTempVault();
		const lockPath = join(dir, ".kb", "vault.lock");

		// Write a lock with a PID that definitely doesn't exist
		await writeFile(
			lockPath,
			JSON.stringify({ pid: 999999999, timestamp: new Date().toISOString(), operation: "dead" }),
		);

		// Should succeed by stealing the stale lock
		await acquireLock(dir, "steal");
		const info = JSON.parse(await readFile(lockPath, "utf-8"));
		expect(info.pid).toBe(process.pid);
		expect(info.operation).toBe("steal");

		await releaseLock(dir);
	});

	test("steals lock older than threshold", async () => {
		const dir = await makeTempVault();
		const lockPath = join(dir, ".kb", "vault.lock");

		// Write a lock with an old timestamp from current process
		const oldTime = new Date(Date.now() - 10 * 60 * 1000).toISOString(); // 10 min ago
		await writeFile(
			lockPath,
			JSON.stringify({ pid: process.pid, timestamp: oldTime, operation: "old" }),
		);

		// Should succeed because lock is stale
		await acquireLock(dir, "new");
		const info = JSON.parse(await readFile(lockPath, "utf-8"));
		expect(info.operation).toBe("new");

		await releaseLock(dir);
	});
});

describe("releaseLock", () => {
	test("removes the lock file", async () => {
		const dir = await makeTempVault();
		await acquireLock(dir, "test");

		const lockPath = join(dir, ".kb", "vault.lock");
		expect(existsSync(lockPath)).toBe(true);

		await releaseLock(dir);
		expect(existsSync(lockPath)).toBe(false);
	});

	test("does nothing when no lock exists", async () => {
		const dir = await makeTempVault();
		await releaseLock(dir); // Should not throw
	});

	test("does not remove lock from another process", async () => {
		const dir = await makeTempVault();
		const lockPath = join(dir, ".kb", "vault.lock");

		await writeFile(
			lockPath,
			JSON.stringify({ pid: 999999999, timestamp: new Date().toISOString(), operation: "other" }),
		);

		await releaseLock(dir);
		// Lock should still be there — it belongs to another process
		expect(existsSync(lockPath)).toBe(true);
	});
});

describe("isLocked", () => {
	test("returns false when no lock", async () => {
		const dir = await makeTempVault();
		const result = await isLocked(dir);
		expect(result.locked).toBe(false);
	});

	test("returns true when locked by live process", async () => {
		const dir = await makeTempVault();
		await acquireLock(dir, "check");

		const result = await isLocked(dir);
		expect(result.locked).toBe(true);
		expect(result.info?.operation).toBe("check");

		await releaseLock(dir);
	});

	test("returns false for stale lock", async () => {
		const dir = await makeTempVault();
		const lockPath = join(dir, ".kb", "vault.lock");

		await writeFile(
			lockPath,
			JSON.stringify({ pid: 999999999, timestamp: new Date().toISOString(), operation: "dead" }),
		);

		const result = await isLocked(dir);
		expect(result.locked).toBe(false);
		expect(result.info).toBeDefined();
	});
});

describe("withLock", () => {
	test("acquires and releases lock around function", async () => {
		const dir = await makeTempVault();
		const lockPath = join(dir, ".kb", "vault.lock");

		const result = await withLock(dir, "wrapped", async () => {
			expect(existsSync(lockPath)).toBe(true);
			return 42;
		});

		expect(result).toBe(42);
		expect(existsSync(lockPath)).toBe(false);
	});

	test("releases lock even on error", async () => {
		const dir = await makeTempVault();
		const lockPath = join(dir, ".kb", "vault.lock");

		try {
			await withLock(dir, "error", async () => {
				expect(existsSync(lockPath)).toBe(true);
				throw new Error("boom");
			});
		} catch (err) {
			expect((err as Error).message).toBe("boom");
		}

		expect(existsSync(lockPath)).toBe(false);
	});

	test("supports nested withLock (re-entrant)", async () => {
		const dir = await makeTempVault();
		const lockPath = join(dir, ".kb", "vault.lock");

		const result = await withLock(dir, "outer", async () => {
			expect(existsSync(lockPath)).toBe(true);

			const inner = await withLock(dir, "inner", async () => {
				expect(existsSync(lockPath)).toBe(true);
				return "inner-result";
			});

			// Lock should still be held after inner withLock releases
			expect(existsSync(lockPath)).toBe(true);
			return `outer-${inner}`;
		});

		expect(result).toBe("outer-inner-result");
		expect(existsSync(lockPath)).toBe(false);
	});
});
