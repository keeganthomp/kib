import { existsSync } from "node:fs";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { homedir, platform } from "node:os";
import { dirname, join } from "node:path";

const LAUNCHD_LABEL = "com.kibhq.watch";
const SYSTEMD_UNIT = "kib-watch.service";

export type ServicePlatform = "macos" | "linux" | "unsupported";

export function detectPlatform(): ServicePlatform {
	const p = platform();
	if (p === "darwin") return "macos";
	if (p === "linux") return "linux";
	return "unsupported";
}

function launchdPlistPath(): string {
	return join(homedir(), "Library", "LaunchAgents", `${LAUNCHD_LABEL}.plist`);
}

function systemdUnitPath(): string {
	return join(homedir(), ".config", "systemd", "user", SYSTEMD_UNIT);
}

function generateLaunchdPlist(vaultRoot: string, kibBinary: string): string {
	return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>Label</key>
	<string>${LAUNCHD_LABEL}</string>
	<key>ProgramArguments</key>
	<array>
		<string>${kibBinary}</string>
		<string>watch</string>
	</array>
	<key>WorkingDirectory</key>
	<string>${vaultRoot}</string>
	<key>RunAtLoad</key>
	<true/>
	<key>KeepAlive</key>
	<true/>
	<key>StandardOutPath</key>
	<string>${vaultRoot}/.kb/logs/watch-stdout.log</string>
	<key>StandardErrorPath</key>
	<string>${vaultRoot}/.kb/logs/watch-stderr.log</string>
</dict>
</plist>`;
}

function generateSystemdUnit(vaultRoot: string, kibBinary: string): string {
	return `[Unit]
Description=kib watch daemon — passive knowledge ingestion
After=network.target

[Service]
Type=simple
WorkingDirectory=${vaultRoot}
ExecStart=${kibBinary} watch
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target`;
}

/** Resolve the kib binary path (installed via npm or standalone). */
function resolveKibBinary(): string {
	// Check common locations
	const candidates = [
		join(homedir(), ".bun", "bin", "kib"),
		"/usr/local/bin/kib",
		join(homedir(), ".local", "bin", "kib"),
	];
	for (const c of candidates) {
		if (existsSync(c)) return c;
	}
	// Fallback: assume it's on PATH
	return "kib";
}

export interface InstallResult {
	platform: ServicePlatform;
	path: string;
	instructions: string;
}

/**
 * Install a system service to auto-start `kib watch` on login.
 * Returns the path written and any manual instructions.
 */
export async function installService(vaultRoot: string): Promise<InstallResult> {
	const plat = detectPlatform();
	const binary = resolveKibBinary();

	if (plat === "macos") {
		const path = launchdPlistPath();
		const content = generateLaunchdPlist(vaultRoot, binary);
		await mkdir(dirname(path), { recursive: true });
		await writeFile(path, content, "utf-8");
		return {
			platform: plat,
			path,
			instructions: `Run: launchctl load ${path}`,
		};
	}

	if (plat === "linux") {
		const path = systemdUnitPath();
		const content = generateSystemdUnit(vaultRoot, binary);
		await mkdir(dirname(path), { recursive: true });
		await writeFile(path, content, "utf-8");
		return {
			platform: plat,
			path,
			instructions: `Run: systemctl --user enable --now ${SYSTEMD_UNIT}`,
		};
	}

	throw new Error("Service installation is only supported on macOS and Linux.");
}

/** Check if the service is installed. */
export async function isServiceInstalled(): Promise<{ installed: boolean; path: string }> {
	const plat = detectPlatform();
	if (plat === "macos") {
		const path = launchdPlistPath();
		return { installed: existsSync(path), path };
	}
	if (plat === "linux") {
		const path = systemdUnitPath();
		return { installed: existsSync(path), path };
	}
	return { installed: false, path: "" };
}

/** Uninstall the system service. */
export async function uninstallService(): Promise<{ removed: boolean; path: string }> {
	const plat = detectPlatform();
	if (plat === "macos") {
		const path = launchdPlistPath();
		if (existsSync(path)) {
			await unlink(path);
			return { removed: true, path };
		}
	}
	if (plat === "linux") {
		const path = systemdUnitPath();
		if (existsSync(path)) {
			await unlink(path);
			return { removed: true, path };
		}
	}
	return { removed: false, path: "" };
}
