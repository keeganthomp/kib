import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { resolveVaultRoot, VaultNotFoundError } from "@kibhq/core";

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
		args: ["serve", "--mcp"],
		cwd: root,
	};
}

async function mergeJsonConfig(path: string, root: string): Promise<void> {
	let config: Record<string, unknown> = {};
	try {
		const raw = await readFile(path, "utf-8");
		config = JSON.parse(raw);
	} catch {
		// File exists but is empty or invalid — start fresh
	}

	if (!config.mcpServers || typeof config.mcpServers !== "object") {
		config.mcpServers = {};
	}

	(config.mcpServers as Record<string, unknown>).kib = mcpEntry(root);
	await writeFile(path, `${JSON.stringify(config, null, 2)}\n`);
}

async function setupClaudeCode(root: string): Promise<ClientResult> {
	const result: ClientResult = { name: "Claude Code", found: false, configured: false };
	const claudePath = Bun.which("claude");
	if (!claudePath) return result;

	result.found = true;
	try {
		const proc = Bun.spawn(["claude", "mcp", "add", "kib", "--", "kib", "serve", "--mcp"], {
			cwd: root,
			stdout: "pipe",
			stderr: "pipe",
		});
		await proc.exited;
		result.configured = proc.exitCode === 0;
		if (!result.configured) {
			const stderr = await new Response(proc.stderr).text();
			result.error = stderr.trim();
		}
	} catch (e) {
		result.error = (e as Error).message;
	}
	return result;
}

async function setupClaudeDesktop(root: string): Promise<ClientResult> {
	const result: ClientResult = { name: "Claude Desktop", found: false, configured: false };
	if (!existsSync(CLAUDE_DESKTOP_CONFIG)) return result;

	result.found = true;
	try {
		await mergeJsonConfig(CLAUDE_DESKTOP_CONFIG, root);
		result.configured = true;
	} catch (e) {
		result.error = (e as Error).message;
	}
	return result;
}

async function setupCursor(root: string): Promise<ClientResult> {
	const result: ClientResult = { name: "Cursor", found: false, configured: false };
	if (!existsSync(CURSOR_CONFIG)) return result;

	result.found = true;
	try {
		await mergeJsonConfig(CURSOR_CONFIG, root);
		result.configured = true;
	} catch (e) {
		result.error = (e as Error).message;
	}
	return result;
}

async function setup() {
	let root: string;
	try {
		root = resolveVaultRoot();
	} catch (e) {
		if (e instanceof VaultNotFoundError) {
			console.error(e.message);
			process.exit(1);
		}
		throw e;
	}

	const results = await Promise.all([
		setupClaudeCode(root),
		setupClaudeDesktop(root),
		setupCursor(root),
	]);

	let anyConfigured = false;
	for (const r of results) {
		if (r.configured) {
			console.log(`  ✓ ${r.name} — configured`);
			anyConfigured = true;
		} else if (r.found) {
			console.log(`  ✗ ${r.name} — failed: ${r.error}`);
		} else {
			console.log(`  · ${r.name} — not installed`);
		}
	}

	if (anyConfigured) {
		console.log("\nMCP server ready. Restart your AI client to connect.");
	} else if (results.every((r) => !r.found)) {
		console.log("\nNo AI clients detected. Add this to your MCP client config manually:\n");
		console.log(JSON.stringify({ mcpServers: { kib: mcpEntry(root) } }, null, 2));
	}
}

export async function mcp(subcommand: string) {
	switch (subcommand) {
		case "setup":
			await setup();
			break;
		default:
			console.error(`Unknown subcommand: ${subcommand}`);
			console.error("Usage: kib mcp setup");
			process.exit(1);
	}
}
