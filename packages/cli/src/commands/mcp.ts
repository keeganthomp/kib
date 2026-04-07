import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { resolveVaultRoot, VaultNotFoundError } from "@kibhq/core";
import * as log from "../ui/logger.js";

interface ClientResult {
	name: string;
	found: boolean;
	configured: boolean;
	error?: string;
}

const CLAUDE_DESKTOP_CONFIG = join(
	homedir(),
	"Library",
	"Application Support",
	"Claude",
	"claude_desktop_config.json",
);

const CURSOR_CONFIG = join(homedir(), ".cursor", "mcp.json");

function mcpEntry(root: string) {
	return {
		command: "kib",
		args: ["serve"],
		cwd: root,
	};
}

async function mergeJsonConfig(path: string, root: string): Promise<void> {
	let config: Record<string, unknown> = {};
	try {
		const raw = await readFile(path, "utf-8");
		config = JSON.parse(raw);
	} catch {
		// File missing or invalid — start fresh
	}

	if (!config.mcpServers || typeof config.mcpServers !== "object") {
		config.mcpServers = {};
	}

	(config.mcpServers as Record<string, unknown>).kib = mcpEntry(root);

	// Ensure parent directory exists before writing
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, `${JSON.stringify(config, null, 2)}\n`);
}

async function setupClaudeCode(root: string): Promise<ClientResult> {
	const result: ClientResult = { name: "Claude Code", found: false, configured: false };
	const claudePath = Bun.which("claude");
	if (!claudePath) return result;

	result.found = true;
	try {
		const proc = Bun.spawn(["claude", "mcp", "add", "kib", "-s", "user", "--", "kib", "serve"], {
			cwd: root,
			stdout: "pipe",
			stderr: "pipe",
		});
		await proc.exited;
		if (proc.exitCode === 0) {
			result.configured = true;
		} else {
			const stderr = await new Response(proc.stderr).text();
			result.error = stderr.trim() || `claude mcp add exited with code ${proc.exitCode}`;
		}
	} catch (e) {
		result.error = `Failed to run 'claude mcp add': ${(e as Error).message}`;
	}
	return result;
}

async function setupClaudeDesktop(root: string): Promise<ClientResult> {
	const result: ClientResult = { name: "Claude Desktop", found: false, configured: false };

	// Check if Claude Desktop app exists (macOS)
	const appExists = existsSync("/Applications/Claude.app");
	const configExists = existsSync(CLAUDE_DESKTOP_CONFIG);
	if (!appExists && !configExists) return result;

	result.found = true;
	try {
		await mergeJsonConfig(CLAUDE_DESKTOP_CONFIG, root);
		result.configured = true;
	} catch (e) {
		result.error = `Failed to write ${CLAUDE_DESKTOP_CONFIG}: ${(e as Error).message}`;
	}
	return result;
}

async function setupCursor(root: string): Promise<ClientResult> {
	const result: ClientResult = { name: "Cursor", found: false, configured: false };

	const cursorDir = join(homedir(), ".cursor");
	if (!existsSync(cursorDir)) return result;

	result.found = true;
	try {
		await mergeJsonConfig(CURSOR_CONFIG, root);
		result.configured = true;
	} catch (e) {
		result.error = `Failed to write ${CURSOR_CONFIG}: ${(e as Error).message}`;
	}
	return result;
}

export async function setupMcp(root: string): Promise<ClientResult[]> {
	const results = await Promise.all([
		setupClaudeCode(root),
		setupClaudeDesktop(root),
		setupCursor(root),
	]);

	let anyConfigured = false;
	for (const r of results) {
		if (r.configured) {
			log.success(`${r.name} — configured`);
			anyConfigured = true;
		} else if (r.found) {
			log.error(`${r.name} — ${r.error ?? "unknown error"}`);
		} else {
			log.dim(`${r.name} — not installed, skipped`);
		}
	}

	if (anyConfigured) {
		log.blank();
		log.dim("MCP server ready. Restart your AI client to connect.");
	} else if (results.every((r) => !r.found)) {
		log.blank();
		log.warn("No AI clients detected. Add this to your MCP config manually:");
		log.blank();
		console.log(JSON.stringify({ mcpServers: { kib: mcpEntry(root) } }, null, 2));
	}

	return results;
}

export async function mcp(subcommand?: string) {
	// Default to setup when no subcommand given
	const cmd = subcommand ?? "setup";

	switch (cmd) {
		case "setup": {
			let root: string;
			try {
				root = resolveVaultRoot();
			} catch (e) {
				if (e instanceof VaultNotFoundError) {
					log.error("No vault found. Run 'kib init' first.");
					process.exit(1);
				}
				throw e;
			}

			log.header("configuring MCP clients");
			await setupMcp(root);
			break;
		}
		default:
			log.error(`Unknown subcommand: ${cmd}`);
			log.dim("Usage: kib mcp [setup]");
			process.exit(1);
	}
}
