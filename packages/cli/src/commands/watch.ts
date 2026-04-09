import { watch as fsWatch } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { VaultConfig } from "@kibhq/core";
import { loadConfig, resolveVaultRoot, VaultNotFoundError } from "@kibhq/core";
import * as log from "../ui/logger.js";

interface WatchOptions {
	daemon?: boolean;
	stop?: boolean;
	status?: boolean;
	install?: boolean;
	uninstall?: boolean;
}

export async function watch(opts: WatchOptions = {}) {
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

	// Lazy-import daemon modules to keep CLI cold start fast
	const {
		getDaemonStatus,
		writePid,
		removePid,
		stopDaemon,
		installService,
		uninstallService,
		isServiceInstalled,
	} = await import("@kibhq/core");

	// ── Subcommands ──────────────────────────────────────────────

	if (opts.stop) {
		const stopped = await stopDaemon(root);
		if (stopped) {
			log.success("Daemon stopped.");
		} else {
			log.dim("No daemon running.");
		}
		return;
	}

	if (opts.status) {
		const info = await getDaemonStatus(root);
		if (info) {
			log.info(`Daemon running (PID ${info.pid}, started ${info.startedAt})`);
		} else {
			log.dim("No daemon running.");
		}
		const svc = await isServiceInstalled();
		if (svc.installed) {
			log.dim(`Service installed at ${svc.path}`);
		}
		return;
	}

	if (opts.install) {
		const result = await installService(root);
		log.success(`Service installed: ${result.path}`);
		log.dim(result.instructions);
		return;
	}

	if (opts.uninstall) {
		const result = await uninstallService();
		if (result.removed) {
			log.success(`Service removed: ${result.path}`);
		} else {
			log.dim("No service installed.");
		}
		return;
	}

	// ── Check for existing daemon ────────────────────────────────

	const existing = await getDaemonStatus(root);
	if (existing) {
		log.error(`Daemon already running (PID ${existing.pid}). Run kib watch --stop first.`);
		process.exit(1);
	}

	// ── Daemon fork ──────────────────────────────────────────────

	if (opts.daemon) {
		const { spawn } = await import("node:child_process");
		const child = spawn(
			process.execPath,
			[...process.argv.slice(1).filter((a) => a !== "--daemon")],
			{
				cwd: root,
				detached: true,
				stdio: "ignore",
				env: { ...process.env, KIB_DAEMON: "1" },
			},
		);
		child.unref();
		log.success(`Daemon started (PID ${child.pid}).`);
		log.dim("Run kib watch --status to check, kib watch --stop to stop.");
		return;
	}

	// ── Foreground watch ─────────────────────────────────────────

	const config = await loadConfig(root);
	await writePid(root);

	const cleanup = await startWatch(root, config);

	const shutdown = async () => {
		cleanup();
		await removePid(root);
		if (!process.env.KIB_DAEMON) {
			log.blank();
			log.dim("Watch stopped.");
		}
		process.exit(0);
	};

	process.on("SIGINT", shutdown);
	process.on("SIGTERM", shutdown);
}

/**
 * Core watch loop. Sets up:
 * 1. Inbox file watcher
 * 2. HTTP server for browser extension
 * 3. Multi-folder watchers (from config)
 * 4. Ingest queue consumer
 * 5. Auto-compile scheduler
 *
 * Returns a cleanup function.
 */
async function startWatch(root: string, config: VaultConfig): Promise<() => void> {
	const {
		ingestSource,
		enqueue,
		dequeue,
		listPending,
		markFailed,
		queueDepth,
		ensureQueueDirs,
		appendWatchLog,
		CompileScheduler,
		startFolderWatchers,
		compileVault,
		isLocked,
	} = await import("@kibhq/core");

	const inboxPath = resolve(root, config.watch.inbox_path);
	const isDaemon = !!process.env.KIB_DAEMON;
	const logMaxBytes = config.watch.log_max_mb * 1024 * 1024;

	await ensureQueueDirs(root);

	// ── Logging helper ───────────────────────────────────────────

	const emit = (level: "info" | "warn" | "error", msg: string) => {
		appendWatchLog(root, level, msg, logMaxBytes);
		if (!isDaemon) {
			const ts = new Date().toLocaleTimeString("en-US", { hour12: false });
			if (level === "error") log.error(`${ts} ${msg}`);
			else if (level === "warn") log.warn(`${ts} ${msg}`);
			else log.info(`${ts} ${msg}`);
		}
	};

	// ── Auto-compile scheduler ───────────────────────────────────

	const scheduler = new CompileScheduler({
		threshold: config.watch.auto_compile_threshold,
		delayMs: config.watch.auto_compile_delay_ms,
		onCompile: async () => {
			const lockStatus = await isLocked(root);
			if (lockStatus.locked) {
				emit("warn", "Skipping auto-compile: vault is locked.");
				return;
			}
			emit("info", "Auto-compiling...");
			try {
				const result = await compileVault(root);
				emit(
					"info",
					`Compiled ${result.sourcesCompiled} sources → ${result.articlesCreated} created, ${result.articlesUpdated} updated.`,
				);
			} catch (err) {
				emit("error", `Auto-compile failed: ${(err as Error).message}`);
			}
		},
		onLog: (msg) => emit("info", msg),
	});

	// ── Queue consumer ───────────────────────────────────────────

	let consuming = false;

	async function consumeQueue() {
		if (consuming) return;
		consuming = true;
		try {
			const items = await listPending(root, 20);
			for (const item of items) {
				try {
					const result = await ingestSource(root, item.uri, item.options);
					await dequeue(root, item.id);
					if (result.skipped) {
						emit("info", `Skipped: ${result.skipReason}`);
					} else {
						emit("info", `Ingested: ${result.title} → ${result.path}`);
						if (config.watch.auto_compile) {
							scheduler.recordIngest();
						}
					}
				} catch (err) {
					const retry = await markFailed(root, item.id, (err as Error).message);
					if (retry) {
						emit("warn", `Retryable error for ${item.uri}: ${(err as Error).message}`);
					} else {
						emit("error", `Failed permanently: ${item.uri} — ${(err as Error).message}`);
					}
				}
			}
		} finally {
			consuming = false;
		}
	}

	// Poll queue periodically (catches items from folder watchers, retries, etc.)
	const queuePollInterval = setInterval(async () => {
		const depth = await queueDepth(root);
		if (depth > 0) await consumeQueue();
	}, config.watch.poll_interval_ms);

	// ── Inbox watcher ────────────────────────────────────────────

	const processed = new Set<string>();

	// Seed with existing files
	try {
		const existing = await readdir(inboxPath);
		for (const f of existing) processed.add(f);
	} catch {
		// inbox might not exist yet
	}

	const inboxWatcher = fsWatch(inboxPath, { recursive: false }, async (_event, filename) => {
		if (!filename || processed.has(filename)) return;
		if (filename.startsWith(".")) return;

		const filePath = join(inboxPath, filename);

		await new Promise((r) => setTimeout(r, 500));
		try {
			await stat(filePath);
		} catch {
			return;
		}

		processed.add(filename);
		await enqueue(root, filePath, "inbox");
		await consumeQueue();
	});

	// ── HTTP server ──────────────────────────────────────────────

	const server = startHttpServer(root, enqueue, consumeQueue);

	// ── Folder watchers ──────────────────────────────────────────

	let folderCleanup: { stop: () => void } | null = null;
	if (config.watch.folders.length > 0) {
		folderCleanup = startFolderWatchers({
			folders: config.watch.folders,
			onFile: async (filePath) => {
				emit("info", `Folder watcher detected: ${filePath}`);
				await enqueue(root, filePath, "folder");
				await consumeQueue();
			},
		});
		emit("info", `Watching ${config.watch.folders.length} additional folder(s).`);
	}

	// ── Process any items already in the queue ───────────────────

	const initialDepth = await queueDepth(root);
	if (initialDepth > 0) {
		emit("info", `Processing ${initialDepth} queued item(s) from previous session.`);
		await consumeQueue();
	}

	// ── UI output (foreground only) ──────────────────────────────

	if (!isDaemon) {
		log.header(`watching ${config.watch.inbox_path}/`);
		log.dim(`Drop files into ${inboxPath} to auto-ingest.`);
		if (config.watch.folders.length > 0) {
			for (const f of config.watch.folders) {
				log.dim(`  + ${f.path} (${f.glob}${f.recursive ? ", recursive" : ""})`);
			}
		}
		log.dim(
			`Auto-compile: after ${config.watch.auto_compile_threshold} sources or ${Math.round(config.watch.auto_compile_delay_ms / 60000)} min idle.`,
		);
		log.dim("Press Ctrl+C to stop.");
		log.blank();
	}

	emit("info", "Daemon started.");

	// ── Cleanup function ─────────────────────────────────────────

	return () => {
		inboxWatcher.close();
		server?.stop();
		folderCleanup?.stop();
		scheduler.stop();
		clearInterval(queuePollInterval);
		emit("info", "Daemon stopped.");
	};
}

function startHttpServer(
	root: string,
	enqueue: typeof import("@kibhq/core").enqueue,
	consumeQueue: () => Promise<void>,
) {
	try {
		const server = Bun.serve({
			port: 4747,
			async fetch(req) {
				const url = new URL(req.url);

				if (req.method === "POST" && url.pathname === "/ingest") {
					try {
						const body = (await req.json()) as { content: string; url?: string; title?: string };

						const slug = (body.title ?? "untitled")
							.toLowerCase()
							.replace(/[^a-z0-9]+/g, "-")
							.slice(0, 60);
						const tmpPath = join(root, "inbox", `${slug}-${Date.now()}.md`);

						const fullContent = body.title
							? `# ${body.title}\n\n${body.url ? `Source: ${body.url}\n\n` : ""}${body.content}`
							: body.content;

						await Bun.write(tmpPath, fullContent);
						await enqueue(root, tmpPath, "http", { title: body.title });
						await consumeQueue();

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

				if (req.method === "GET" && url.pathname === "/status") {
					const { queueDepth: getDepth } = await import("@kibhq/core");
					const depth = await getDepth(root);
					return new Response(JSON.stringify({ running: true, queueDepth: depth }), {
						headers: { "Content-Type": "application/json" },
					});
				}

				return new Response("Not found", { status: 404 });
			},
		});

		if (!process.env.KIB_DAEMON) {
			log.dim("HTTP server listening on http://localhost:4747");
		}
		return server;
	} catch {
		if (!process.env.KIB_DAEMON) {
			log.dim("HTTP server not started (port 4747 may be in use)");
		}
		return null;
	}
}
