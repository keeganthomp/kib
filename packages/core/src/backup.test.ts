import { afterEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createBackup, listBackups, pruneBackups, restoreBackup } from "./backup.js";
import { initVault, loadManifest, saveManifest } from "./vault.js";

let tempDir: string;

afterEach(async () => {
	if (tempDir) {
		await rm(tempDir, { recursive: true, force: true });
	}
});

async function makeTempVault() {
	tempDir = await mkdtemp(join(tmpdir(), "kib-backup-test-"));
	await initVault(tempDir, { name: "backup-test" });
	return tempDir;
}

describe("createBackup", () => {
	test("creates a backup of the manifest", async () => {
		const dir = await makeTempVault();
		const id = await createBackup(dir);

		expect(id).toBeTruthy();
		const backupPath = join(dir, ".kb", "backups", `manifest-${id}.json`);
		expect(existsSync(backupPath)).toBe(true);

		// Backup content should match current manifest
		const original = await readFile(join(dir, ".kb", "manifest.json"), "utf-8");
		const backup = await readFile(backupPath, "utf-8");
		expect(JSON.parse(backup)).toEqual(JSON.parse(original));
	});

	test("creates multiple backups with unique IDs", async () => {
		const dir = await makeTempVault();
		const id1 = await createBackup(dir);
		// Small delay to ensure unique timestamp
		await new Promise((r) => setTimeout(r, 10));
		const id2 = await createBackup(dir);

		expect(id1).not.toBe(id2);

		const backups = await readdir(join(dir, ".kb", "backups"));
		expect(backups.length).toBe(2);
	});
});

describe("listBackups", () => {
	test("returns empty array when no backups", async () => {
		const dir = await makeTempVault();
		const backups = await listBackups(dir);
		expect(backups).toEqual([]);
	});

	test("returns backups sorted most recent first", async () => {
		const dir = await makeTempVault();
		await createBackup(dir);
		await new Promise((r) => setTimeout(r, 10));
		await createBackup(dir);

		const backups = await listBackups(dir);
		expect(backups.length).toBe(2);
		// Most recent first
		expect(backups[0].id > backups[1].id).toBe(true);
	});
});

describe("restoreBackup", () => {
	test("restores manifest from backup", async () => {
		const dir = await makeTempVault();

		// Save original manifest state
		const originalManifest = await loadManifest(dir);
		expect(originalManifest.vault.name).toBe("backup-test");

		// Create backup
		const id = await createBackup(dir);

		// Modify manifest
		const modified = {
			...originalManifest,
			vault: { ...originalManifest.vault, name: "modified" },
		};
		await saveManifest(dir, modified);
		const check = await loadManifest(dir);
		expect(check.vault.name).toBe("modified");

		// Restore
		await restoreBackup(dir, id);
		const restored = await loadManifest(dir);
		expect(restored.vault.name).toBe("backup-test");
	});

	test("throws for nonexistent backup", async () => {
		const dir = await makeTempVault();
		expect(restoreBackup(dir, "nonexistent")).rejects.toThrow("Backup not found");
	});
});

describe("pruneBackups", () => {
	test("keeps only the specified number of backups", async () => {
		const dir = await makeTempVault();

		// Create more backups than the limit
		for (let i = 0; i < 4; i++) {
			await createBackup(dir);
			await new Promise((r) => setTimeout(r, 10));
		}

		const before = await listBackups(dir);
		expect(before.length).toBe(4);

		const removed = await pruneBackups(dir, 2);
		expect(removed).toBe(2);

		const after = await listBackups(dir);
		expect(after.length).toBe(2);
	});

	test("does nothing when under limit", async () => {
		const dir = await makeTempVault();
		await createBackup(dir);

		const removed = await pruneBackups(dir, 5);
		expect(removed).toBe(0);

		const after = await listBackups(dir);
		expect(after.length).toBe(1);
	});
});
