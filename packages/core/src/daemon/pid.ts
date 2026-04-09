import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { VAULT_DIR } from "../constants.js";

const PID_FILE = "watch.pid";

export interface PidInfo {
	pid: number;
	startedAt: string;
	root: string;
}

function pidPath(root: string): string {
	return join(root, VAULT_DIR, PID_FILE);
}

function isProcessAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

/** Write PID file for the running daemon. */
export async function writePid(root: string): Promise<void> {
	const info: PidInfo = {
		pid: process.pid,
		startedAt: new Date().toISOString(),
		root,
	};
	const path = pidPath(root);
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, JSON.stringify(info, null, 2), "utf-8");
}

/** Read PID info. Returns null if no PID file exists. */
export async function readPid(root: string): Promise<PidInfo | null> {
	try {
		const raw = await readFile(pidPath(root), "utf-8");
		return JSON.parse(raw) as PidInfo;
	} catch {
		return null;
	}
}

/** Remove the PID file. */
export async function removePid(root: string): Promise<void> {
	try {
		await unlink(pidPath(root));
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
	}
}

/**
 * Check if the daemon is running.
 * Returns the PID info if alive, null otherwise.
 * Cleans up stale PID files automatically.
 */
export async function getDaemonStatus(root: string): Promise<PidInfo | null> {
	const info = await readPid(root);
	if (!info) return null;

	if (isProcessAlive(info.pid)) {
		return info;
	}

	// Stale PID file — clean up
	await removePid(root);
	return null;
}

/**
 * Send SIGTERM to a running daemon.
 * Returns true if signal was sent, false if no daemon was running.
 */
export async function stopDaemon(root: string): Promise<boolean> {
	const info = await getDaemonStatus(root);
	if (!info) return false;

	try {
		process.kill(info.pid, "SIGTERM");
		// Wait briefly for process to exit, then clean up PID file
		await new Promise((r) => setTimeout(r, 500));
		if (!isProcessAlive(info.pid)) {
			await removePid(root);
		}
		return true;
	} catch {
		await removePid(root);
		return false;
	}
}
