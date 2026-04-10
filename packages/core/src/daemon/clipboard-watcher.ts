import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { platform } from "node:os";

export interface ClipboardWatcherOptions {
	/** Called when new clipboard text is detected that meets the minimum length. */
	onText: (text: string) => void;
	/** Minimum character length to consider clipboard text worth ingesting. */
	minLength: number;
	/** Poll interval in milliseconds. */
	pollIntervalMs: number;
}

/** Read current clipboard text using platform-native commands. */
export async function readClipboard(): Promise<string> {
	const os = platform();

	if (os === "darwin") {
		return execCommand("pbpaste", []);
	}

	if (os === "linux") {
		// Try wayland first, then X11 options
		for (const [cmd, args] of [
			["wl-paste", ["--no-newline"]],
			["xclip", ["-selection", "clipboard", "-o"]],
			["xsel", ["--clipboard", "--output"]],
		] as const) {
			try {
				return await execCommand(cmd, [...args]);
			} catch {
				// try next clipboard command
			}
		}
		throw new Error("No clipboard command found. Install xclip, xsel, or wl-clipboard.");
	}

	// Windows (Bun on WSL or native)
	if (os === "win32") {
		return execCommand("powershell.exe", ["-command", "Get-Clipboard"]);
	}

	throw new Error(`Unsupported platform for clipboard: ${os}`);
}

function execCommand(cmd: string, args: string[]): Promise<string> {
	return new Promise((resolve, reject) => {
		execFile(cmd, args, { timeout: 2000 }, (err, stdout) => {
			if (err) reject(err);
			else resolve(stdout);
		});
	});
}

function hashText(text: string): string {
	return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

/**
 * Start polling the system clipboard for new text content.
 * Calls `onText` when new text appears that meets `minLength`.
 * Returns a stop function.
 */
export function startClipboardWatcher(options: ClipboardWatcherOptions): { stop: () => void } {
	const { onText, minLength, pollIntervalMs } = options;
	let lastHash = "";
	let stopped = false;

	const poll = async () => {
		if (stopped) return;
		try {
			const text = await readClipboard();
			const trimmed = text.trim();
			if (trimmed.length < minLength) return;

			const hash = hashText(trimmed);
			if (hash === lastHash) return;

			lastHash = hash;
			onText(trimmed);
		} catch {
			// Clipboard read failed (no display, no tool installed) — silently skip
		}
	};

	const interval = setInterval(poll, pollIntervalMs);
	// Initial read to set baseline (don't ingest whatever is already there)
	readClipboard()
		.then((text) => {
			lastHash = hashText(text.trim());
		})
		.catch(() => {});

	return {
		stop: () => {
			stopped = true;
			clearInterval(interval);
		},
	};
}
