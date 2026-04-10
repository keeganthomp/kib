import { type FSWatcher, watch as fsWatch } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { extname, join, resolve } from "node:path";

export interface WatchFolder {
	path: string;
	glob: string;
	recursive: boolean;
}

export interface FolderWatcherOptions {
	folders: WatchFolder[];
	/** Called when a matching file is detected */
	onFile: (filePath: string) => void;
	/** Debounce in ms before processing a new file (default: 500) */
	debounceMs?: number;
}

/**
 * Match a filename against a simple glob pattern.
 * Supports: *.ext, *.{ext1,ext2}, * (match all)
 */
export function matchGlob(filename: string, pattern: string): boolean {
	if (pattern === "*") return true;

	// Handle *.{ext1,ext2} pattern
	const braceMatch = pattern.match(/^\*\.\{(.+)\}$/);
	if (braceMatch?.[1]) {
		const extensions = braceMatch[1].split(",").map((e) => `.${e.trim()}`);
		return extensions.includes(extname(filename).toLowerCase());
	}

	// Handle *.ext pattern
	const extMatch = pattern.match(/^\*(\..+)$/);
	if (extMatch?.[1]) {
		return extname(filename).toLowerCase() === extMatch[1].toLowerCase();
	}

	return filename === pattern;
}

/**
 * Watch multiple folders for new files matching glob patterns.
 * Returns a cleanup function to stop all watchers.
 */
export function startFolderWatchers(options: FolderWatcherOptions): { stop: () => void } {
	const { folders, onFile, debounceMs = 500 } = options;
	const watchers: FSWatcher[] = [];
	const seen = new Set<string>();
	const pending = new Map<string, ReturnType<typeof setTimeout>>();

	for (const folder of folders) {
		const absPath = resolve(folder.path.replace(/^~/, process.env.HOME ?? ""));

		try {
			const watcher = fsWatch(absPath, { recursive: folder.recursive }, (_event, filename) => {
				if (!filename) return;
				if (filename.startsWith(".")) return;

				// Extract just the basename for glob matching
				const base = filename.includes("/") ? filename.split("/").pop()! : filename;
				if (!matchGlob(base, folder.glob)) return;

				const fullPath = join(absPath, filename);
				if (seen.has(fullPath)) return;

				// Debounce: wait for file to finish writing
				if (pending.has(fullPath)) {
					clearTimeout(pending.get(fullPath)!);
				}
				pending.set(
					fullPath,
					setTimeout(async () => {
						pending.delete(fullPath);
						try {
							await stat(fullPath); // verify file still exists
							seen.add(fullPath);
							onFile(fullPath);
						} catch {
							// File deleted before we could process
						}
					}, debounceMs),
				);
			});
			watchers.push(watcher);
		} catch {
			// Folder doesn't exist or isn't watchable — skip
		}
	}

	return {
		stop: () => {
			for (const w of watchers) w.close();
			for (const t of pending.values()) clearTimeout(t);
			pending.clear();
		},
	};
}

/** Scan a folder for existing files that match the glob. Used for initial seeding. */
export async function scanFolder(folder: WatchFolder): Promise<string[]> {
	const absPath = resolve(folder.path.replace(/^~/, process.env.HOME ?? ""));
	const matches: string[] = [];

	try {
		const files = await readdir(absPath, { recursive: folder.recursive });
		for (const file of files) {
			const name = String(file);
			const base = name.includes("/") ? name.split("/").pop()! : name;
			if (!base.startsWith(".") && matchGlob(base, folder.glob)) {
				matches.push(join(absPath, name));
			}
		}
	} catch {
		// Folder doesn't exist
	}

	return matches;
}
