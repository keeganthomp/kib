import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { MANIFEST_FILE, VAULT_DIR } from "./constants.js";

const BACKUPS_DIR = "backups";
const MAX_BACKUPS = 5;

export interface BackupEntry {
	id: string;
	timestamp: string;
	manifestPath: string;
}

function backupsDir(root: string): string {
	return join(root, VAULT_DIR, BACKUPS_DIR);
}

/**
 * Create a backup of the current manifest before destructive operations.
 * Returns the backup ID (timestamp-based).
 */
export async function createBackup(root: string): Promise<string> {
	const dir = backupsDir(root);
	await mkdir(dir, { recursive: true });

	const manifestPath = join(root, VAULT_DIR, MANIFEST_FILE);
	const manifest = await readFile(manifestPath, "utf-8");

	const id = new Date().toISOString().replace(/[:.]/g, "-");
	const backupPath = join(dir, `manifest-${id}.json`);
	await writeFile(backupPath, manifest, "utf-8");

	// Prune old backups
	await pruneBackups(root, MAX_BACKUPS);

	return id;
}

/**
 * List all available backups, most recent first.
 */
export async function listBackups(root: string): Promise<BackupEntry[]> {
	const dir = backupsDir(root);
	try {
		const entries = await readdir(dir);
		return entries
			.filter((f) => f.startsWith("manifest-") && f.endsWith(".json"))
			.map((f) => {
				const id = f.replace("manifest-", "").replace(".json", "");
				// Restore ISO timestamp from ID
				const timestamp = id.replace(
					/^(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d+)Z$/,
					"$1-$2-$3T$4:$5:$6.$7Z",
				);
				return {
					id,
					timestamp,
					manifestPath: join(dir, f),
				};
			})
			.sort((a, b) => b.id.localeCompare(a.id));
	} catch {
		return [];
	}
}

/**
 * Restore a manifest from a backup.
 * Returns the restored manifest JSON string.
 */
export async function restoreBackup(root: string, backupId: string): Promise<string> {
	const dir = backupsDir(root);
	const backupPath = join(dir, `manifest-${backupId}.json`);

	if (!existsSync(backupPath)) {
		throw new Error(`Backup not found: ${backupId}`);
	}

	const manifest = await readFile(backupPath, "utf-8");
	const manifestPath = join(root, VAULT_DIR, MANIFEST_FILE);

	// Write via tmp for atomicity
	const tmp = `${manifestPath}.tmp`;
	await writeFile(tmp, manifest, "utf-8");
	const { rename } = await import("node:fs/promises");
	await rename(tmp, manifestPath);

	return manifest;
}

/**
 * Keep only the most recent N backups.
 */
export async function pruneBackups(root: string, keep = MAX_BACKUPS): Promise<number> {
	const backups = await listBackups(root);
	const toRemove = backups.slice(keep);

	for (const backup of toRemove) {
		await rm(backup.manifestPath, { force: true });
	}

	return toRemove.length;
}
