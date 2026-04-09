import { appendFile, mkdir, rename, stat } from "node:fs/promises";
import { join } from "node:path";
import { LOGS_DIR, VAULT_DIR } from "../constants.js";

const WATCH_LOG = "watch.log";
const DEFAULT_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

function logPath(root: string): string {
	return join(root, VAULT_DIR, LOGS_DIR, WATCH_LOG);
}

function rotatedPath(root: string): string {
	return join(root, VAULT_DIR, LOGS_DIR, "watch.log.1");
}

/**
 * Append a timestamped line to the watch log.
 * Automatically rotates when the log exceeds maxBytes.
 */
export async function appendWatchLog(
	root: string,
	level: "info" | "warn" | "error",
	message: string,
	maxBytes = DEFAULT_MAX_BYTES,
): Promise<void> {
	const path = logPath(root);
	await mkdir(join(root, VAULT_DIR, LOGS_DIR), { recursive: true });

	const timestamp = new Date().toISOString();
	const line = `${timestamp} [${level.toUpperCase()}] ${message}\n`;
	await appendFile(path, line, "utf-8");

	// Rotate if over size limit (check periodically, not every write)
	try {
		const info = await stat(path);
		if (info.size > maxBytes) {
			await rename(path, rotatedPath(root));
		}
	} catch {
		// stat or rename failure is non-fatal
	}
}
