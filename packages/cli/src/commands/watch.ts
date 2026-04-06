import { watch as fsWatch } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { loadConfig, resolveVaultRoot, VaultNotFoundError } from "@kibhq/core";
import * as log from "../ui/logger.js";

export async function watch() {
	let root: string;
	try {
		root = resolveVaultRoot();
	} catch (err) {
		if (err instanceof VaultNotFoundError) {
			log.error(err.message);
			process.exit(1);
		}
		throw err;
	}

	const config = await loadConfig(root);
	const inboxPath = resolve(root, config.watch.inbox_path);
	const { ingestSource } = await import("@kibhq/core");

	log.header(`watching ${config.watch.inbox_path}/`);
	log.dim(`Drop files into ${inboxPath} to auto-ingest.`);
	log.dim("Press Ctrl+C to stop.");
	log.blank();

	// Track already-seen files to avoid double-processing
	const processed = new Set<string>();

	// Seed with existing files
	try {
		const existing = await readdir(inboxPath);
		for (const f of existing) processed.add(f);
	} catch {
		// inbox might not exist yet
	}

	// Start the HTTP server for browser extension
	const server = startHttpServer(root, ingestSource);

	// Watch for new files
	const watcher = fsWatch(inboxPath, { recursive: false }, async (_event, filename) => {
		if (!filename || processed.has(filename)) return;
		if (filename.startsWith(".")) return; // skip dotfiles

		const filePath = join(inboxPath, filename);

		// Wait briefly for file to finish writing
		await new Promise((r) => setTimeout(r, 500));

		try {
			await stat(filePath);
		} catch {
			return; // file was deleted before we could process it
		}

		processed.add(filename);
		const timestamp = new Date().toLocaleTimeString("en-US", { hour12: false });

		try {
			log.info(`${timestamp} Ingesting ${filename}...`);
			const result = await ingestSource(root, filePath);

			if (result.skipped) {
				log.dim(`${timestamp} Skipped: ${result.skipReason}`);
			} else {
				log.success(`${timestamp} ${result.title} → ${result.path}`);

				if (config.watch.auto_compile) {
					log.dim(`${timestamp} Auto-compile: run kib compile to process`);
				}
			}
		} catch (err) {
			log.error(`${timestamp} Failed to ingest ${filename}: ${(err as Error).message}`);
		}
	});

	// Handle graceful shutdown
	process.on("SIGINT", () => {
		watcher.close();
		server?.stop();
		log.blank();
		log.dim("Watch stopped.");
		process.exit(0);
	});
}

function startHttpServer(root: string, ingestSource: typeof import("@kibhq/core").ingestSource) {
	try {
		const server = Bun.serve({
			port: 4747,
			async fetch(req) {
				const url = new URL(req.url);

				if (req.method === "POST" && url.pathname === "/ingest") {
					try {
						const body = (await req.json()) as { content: string; url?: string; title?: string };

						// Write content to a temp file in inbox
						const slug = (body.title ?? "untitled")
							.toLowerCase()
							.replace(/[^a-z0-9]+/g, "-")
							.slice(0, 60);
						const tmpPath = join(root, "inbox", `${slug}-${Date.now()}.md`);

						const fullContent = body.title
							? `# ${body.title}\n\n${body.url ? `Source: ${body.url}\n\n` : ""}${body.content}`
							: body.content;

						await Bun.write(tmpPath, fullContent);
						await ingestSource(root, tmpPath, { title: body.title });

						return new Response(JSON.stringify({ ok: true }), {
							headers: { "Content-Type": "application/json" },
						});
					} catch (err) {
						return new Response(JSON.stringify({ error: (err as Error).message }), {
							status: 500,
							headers: { "Content-Type": "application/json" },
						});
					}
				}

				if (req.method === "GET" && url.pathname === "/") {
					return new Response("kib watch running", {
						headers: { "Content-Type": "text/plain" },
					});
				}

				return new Response("Not found", { status: 404 });
			},
		});

		log.dim(`HTTP server listening on http://localhost:4747`);
		return server;
	} catch {
		log.dim("HTTP server not started (port 4747 may be in use)");
		return null;
	}
}
