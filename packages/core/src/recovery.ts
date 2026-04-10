import { existsSync } from "node:fs";
import { readdir, readFile, rename, unlink } from "node:fs/promises";
import { join } from "node:path";
import { MANIFEST_FILE, RAW_DIR, VAULT_DIR, WIKI_DIR } from "./constants.js";

export interface RecoveryIssue {
	type: "tmp_file" | "missing_manifest" | "corrupt_manifest" | "stale_lock";
	path: string;
	message: string;
	repaired: boolean;
}

/**
 * Scan the vault for signs of incomplete writes or corruption.
 * Looks for .tmp files, missing manifest, and stale locks.
 */
export async function detectIssues(root: string): Promise<RecoveryIssue[]> {
	const issues: RecoveryIssue[] = [];
	const kbDir = join(root, VAULT_DIR);

	// Check manifest existence first — .tmp files for missing manifest
	// are handled separately and should not be flagged as generic tmp_file
	const manifestPath = join(kbDir, MANIFEST_FILE);
	const manifestTmp = `${manifestPath}.tmp`;
	const manifestMissing = !existsSync(manifestPath) && existsSync(manifestTmp);

	if (manifestMissing) {
		issues.push({
			type: "missing_manifest",
			path: manifestTmp,
			message: "Manifest is missing but a .tmp file exists — likely an interrupted write",
			repaired: false,
		});
	}

	// Check for .tmp files in .kb/ (skip manifest.tmp if already flagged as missing_manifest)
	await scanTmpFiles(kbDir, issues, manifestMissing ? manifestTmp : undefined);

	// Check for .tmp files in raw/ and wiki/
	const rawDir = join(root, RAW_DIR);
	const wikiDir = join(root, WIKI_DIR);
	if (existsSync(rawDir)) await scanTmpFilesRecursive(rawDir, issues);
	if (existsSync(wikiDir)) await scanTmpFilesRecursive(wikiDir, issues);

	// Check if manifest is valid JSON
	if (existsSync(manifestPath)) {
		try {
			const raw = await readFile(manifestPath, "utf-8");
			JSON.parse(raw);
		} catch {
			issues.push({
				type: "corrupt_manifest",
				path: manifestPath,
				message: "Manifest file contains invalid JSON",
				repaired: false,
			});
		}
	}

	// Check for stale lock
	const lockPath = join(kbDir, "vault.lock");
	if (existsSync(lockPath)) {
		try {
			const raw = await readFile(lockPath, "utf-8");
			const info = JSON.parse(raw) as { pid: number; timestamp: string };
			let alive = false;
			try {
				process.kill(info.pid, 0);
				alive = true;
			} catch {
				// Process is dead
			}
			if (!alive) {
				issues.push({
					type: "stale_lock",
					path: lockPath,
					message: `Stale lock from dead process ${info.pid}`,
					repaired: false,
				});
			}
		} catch {
			issues.push({
				type: "stale_lock",
				path: lockPath,
				message: "Lock file is corrupt or unreadable",
				repaired: false,
			});
		}
	}

	return issues;
}

/**
 * Attempt to repair detected issues.
 * - .tmp files next to their target: remove the .tmp (the write was atomic, target is fine)
 * - .tmp file without target (missing_manifest): promote .tmp → target
 * - Stale locks: remove
 */
export async function repairVault(root: string): Promise<RecoveryIssue[]> {
	const issues = await detectIssues(root);

	for (const issue of issues) {
		switch (issue.type) {
			case "tmp_file": {
				// .tmp file exists alongside the real file — interrupted atomic write
				// The real file is intact (rename didn't complete), so remove the .tmp
				try {
					await unlink(issue.path);
					issue.repaired = true;
				} catch {
					// Could not remove — leave it
				}
				break;
			}

			case "missing_manifest": {
				// The .tmp file is the only copy — promote it
				const target = issue.path.replace(/\.tmp$/, "");
				try {
					await rename(issue.path, target);
					issue.repaired = true;
				} catch {
					// Could not promote
				}
				break;
			}

			case "stale_lock": {
				try {
					await unlink(issue.path);
					issue.repaired = true;
				} catch {
					// Could not remove
				}
				break;
			}

			case "corrupt_manifest": {
				// Try to restore from backup
				const backupsDir = join(root, VAULT_DIR, "backups");
				if (existsSync(backupsDir)) {
					const backups = (await readdir(backupsDir))
						.filter((f) => f.startsWith("manifest-") && f.endsWith(".json"))
						.sort()
						.reverse();

					if (backups[0]) {
						const latest = join(backupsDir, backups[0]);
						try {
							const backup = await readFile(latest, "utf-8");
							JSON.parse(backup); // Verify it's valid
							const manifestPath = join(root, VAULT_DIR, MANIFEST_FILE);
							const tmp = `${manifestPath}.tmp`;
							const { writeFile } = await import("node:fs/promises");
							await writeFile(tmp, backup, "utf-8");
							await rename(tmp, manifestPath);
							issue.repaired = true;
							issue.message += ` — restored from backup ${backups[0]}`;
						} catch {
							// Backup also corrupt or unreadable
						}
					}
				}
				break;
			}
		}
	}

	return issues;
}

// ─── Helpers ────────────────────────────────────────────────────

async function scanTmpFiles(
	dir: string,
	issues: RecoveryIssue[],
	excludePath?: string,
): Promise<void> {
	try {
		const entries = await readdir(dir);
		for (const entry of entries) {
			if (entry.endsWith(".tmp")) {
				const fullPath = join(dir, entry);
				if (excludePath && fullPath === excludePath) continue;
				issues.push({
					type: "tmp_file",
					path: fullPath,
					message: `Leftover temporary file: ${entry}`,
					repaired: false,
				});
			}
		}
	} catch {
		// Directory might not exist
	}
}

async function scanTmpFilesRecursive(dir: string, issues: RecoveryIssue[]): Promise<void> {
	try {
		const { readdir: rd } = await import("node:fs/promises");
		const entries = await rd(dir, { withFileTypes: true });
		for (const entry of entries) {
			const fullPath = join(dir, entry.name);
			if (entry.isDirectory()) {
				await scanTmpFilesRecursive(fullPath, issues);
			} else if (entry.name.endsWith(".tmp")) {
				issues.push({
					type: "tmp_file",
					path: fullPath,
					message: `Leftover temporary file: ${entry.name}`,
					repaired: false,
				});
			}
		}
	} catch {
		// Directory might not exist
	}
}
