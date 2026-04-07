import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Load saved credentials from ~/.config/kib/credentials into process.env.
 * Only sets variables that aren't already set (env vars take precedence).
 */
export function loadCredentials(): void {
	const path = join(homedir(), ".config", "kib", "credentials");
	if (!existsSync(path)) return;

	try {
		const content = readFileSync(path, "utf-8");
		for (const line of content.split("\n")) {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith("#")) continue;

			const eqIndex = trimmed.indexOf("=");
			if (eqIndex === -1) continue;

			const key = trimmed.slice(0, eqIndex);
			const value = trimmed.slice(eqIndex + 1);

			// Don't override existing env vars
			if (!process.env[key]) {
				process.env[key] = value;
			}
		}
	} catch {
		// Silently ignore read errors
	}
}
