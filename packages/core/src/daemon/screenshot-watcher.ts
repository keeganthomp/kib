import { access } from "node:fs/promises";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import { startFolderWatchers } from "./folder-watcher.js";

export interface ScreenshotWatcherOptions {
	/** Called when a new screenshot file is detected. */
	onFile: (filePath: string) => void;
	/** Override the screenshot directory path. If omitted, uses platform default. */
	path?: string;
	/** Glob pattern for image files. Default: *.{png,jpg,jpeg,webp,gif,bmp,tiff} */
	glob: string;
}

/** Platform-specific default screenshot folder candidates. */
const SCREENSHOT_DIRS: Record<string, string[]> = {
	darwin: [
		join(homedir(), "Desktop"),
		join(homedir(), "Screenshots"),
		join(homedir(), "Documents", "Screenshots"),
	],
	linux: [
		join(homedir(), "Pictures", "Screenshots"),
		join(homedir(), "Screenshots"),
		join(homedir(), "Pictures"),
	],
	win32: [
		join(homedir(), "Pictures", "Screenshots"),
		join(homedir(), "OneDrive", "Pictures", "Screenshots"),
	],
};

/**
 * Detect the default screenshot directory for the current platform.
 * Returns the first candidate that exists, or null if none found.
 */
export async function detectScreenshotDir(): Promise<string | null> {
	const candidates = SCREENSHOT_DIRS[platform()] ?? [];
	for (const dir of candidates) {
		try {
			await access(dir);
			return dir;
		} catch {
			// directory doesn't exist, try next candidate
		}
	}
	return null;
}

/**
 * Start watching a screenshot folder for new image files.
 * Uses the existing folder watcher under the hood.
 * Returns a stop function, or null if no screenshot directory could be resolved.
 */
export async function startScreenshotWatcher(
	options: ScreenshotWatcherOptions,
): Promise<{ stop: () => void; dir: string } | null> {
	const dir = options.path ?? (await detectScreenshotDir());
	if (!dir) return null;

	const watcher = startFolderWatchers({
		folders: [{ path: dir, glob: options.glob, recursive: false }],
		onFile: options.onFile,
		debounceMs: 1000, // screenshots may take a moment to finish writing
	});

	return { stop: watcher.stop, dir };
}
