# Watch Daemon

The watch daemon is kib's passive ingestion system. It monitors your inbox directory, configured folders, and an HTTP endpoint — automatically ingesting new files and optionally compiling them into wiki articles. Run it in the foreground, as a background daemon, or as a system service.

## Quick Start

```bash
# Foreground (interactive, logs to terminal)
kib watch

# Background daemon
kib watch --daemon

# Check status
kib watch --status

# Stop
kib watch --stop
```

Drop a file into `inbox/` and it gets ingested automatically.

## What It Does

The daemon runs five subsystems in parallel:

1. **Inbox watcher** — monitors the `inbox/` directory for new files. Drop a PDF, markdown file, or anything kib can ingest and it gets picked up automatically.

2. **Folder watchers** — monitors additional directories you configure with glob patterns. Useful for watching a downloads folder, a notes directory, etc.

3. **HTTP server** — listens on `http://localhost:4747` for programmatic ingestion. Accepts JSON payloads with content, title, and URL. Built for browser extensions and scripts.

4. **Ingest queue** — all sources (inbox, folders, HTTP) are enqueued and processed in FIFO order. Failed items retry up to 3 times before moving to `.kb/queue/failed/`.

5. **Auto-compile scheduler** — after enough new sources are ingested (default: 5) or enough idle time passes (default: 30 min), the daemon automatically compiles them into wiki articles.

## Running Modes

### Foreground

```bash
kib watch
```

Runs interactively with live log output. Press `Ctrl+C` to stop. Best for seeing what's happening in real time.

### Background Daemon

```bash
kib watch --daemon
```

Forks a detached background process. The CLI exits immediately and the daemon keeps running. State is tracked via a PID file at `.kb/watch.pid`.

```bash
# Check if it's running
kib watch --status
# → Daemon running (PID 12345, started 2026-04-09T10:00:00.000Z)

# Stop it
kib watch --stop
# → Daemon stopped.
```

### System Service

Install as a persistent service that starts on login:

```bash
# Install
kib watch --install

# Uninstall
kib watch --uninstall
```

| Platform | Service Manager | Install Path |
|----------|----------------|--------------|
| macOS | launchd | `~/Library/LaunchAgents/com.kibhq.watch.plist` |
| Linux | systemd (user) | `~/.config/systemd/user/kib-watch.service` |

After installing, the service starts automatically on login. Use your platform's native tools to manage it:

```bash
# macOS
launchctl list | grep kib

# Linux
systemctl --user status kib-watch
```

## Configuration

All watch settings live in `.kb/config.toml` under the `[watch]` section:

```toml
[watch]
enabled = false                   # enable watch (used by system service)
inbox_path = "inbox"              # drop zone directory (relative to vault root)
auto_compile = true               # auto-compile after ingests
poll_interval_ms = 2000           # queue polling interval
auto_compile_threshold = 5        # compile after N new sources
auto_compile_delay_ms = 1800000   # compile after 30 min idle (whichever comes first)
log_max_mb = 10                   # max log file size before rotation
```

### Watching Additional Folders

Add `[[watch.folders]]` entries to monitor directories outside your vault:

```toml
[[watch.folders]]
path = "/home/user/Downloads"
glob = "*.pdf"
recursive = false

[[watch.folders]]
path = "/home/user/notes"
glob = "*.md"
recursive = true

[[watch.folders]]
path = "/home/user/papers"
glob = "*.{pdf,epub}"
recursive = true
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `path` | string | (required) | Absolute path to the directory to watch |
| `glob` | string | `"*"` | Glob pattern to match files |
| `recursive` | bool | `false` | Watch subdirectories |

## HTTP API

The daemon runs an HTTP server on port `4747` for programmatic ingestion.

### `POST /ingest`

Send content to be ingested:

```bash
curl -X POST http://localhost:4747/ingest \
  -H "Content-Type: application/json" \
  -d '{"content": "Article text here...", "title": "My Article", "url": "https://example.com"}'
```

**Request body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `content` | string | yes | The content to ingest |
| `title` | string | no | Title for the source |
| `url` | string | no | Source URL (stored in metadata) |

**Response:** `{"ok": true}` on success.

This endpoint is designed for browser extensions — clip a page, POST it to the daemon, and it gets ingested into your vault automatically.

### `GET /`

Health check. Returns `kib watch running` if the daemon is alive.

### `GET /status`

Returns queue status:

```json
{"running": true, "queueDepth": 0}
```

## Queue System

All ingestion requests go through a persistent file-based queue at `.kb/queue/`.

- Items are processed in FIFO order
- Failed items retry up to 3 times with the error recorded
- After 3 failures, items move to `.kb/queue/failed/`
- On restart, the daemon resumes processing any items left in the queue

Sources are tagged by origin: `inbox`, `folder`, `http`, or `clipboard`.

## Auto-Compile

When `auto_compile` is enabled (the default), the daemon triggers compilation automatically using two conditions — whichever fires first:

1. **Threshold** — after `auto_compile_threshold` new sources are ingested (default: 5)
2. **Idle timeout** — after `auto_compile_delay_ms` of no new ingests (default: 30 minutes)

The timer resets on each new ingest (debouncing). Concurrent compiles are prevented — if a compile is already running, the next one waits.

## Logging

The daemon writes timestamped logs to `.kb/logs/watch.log`:

```
2026-04-09T10:00:00.000Z [info] Daemon started.
2026-04-09T10:00:05.123Z [info] Ingested: Attention Is All You Need → raw/papers/attention-is-all-you-need.md
2026-04-09T10:00:05.456Z [info] Auto-compile scheduled (1/5 threshold).
```

Logs rotate automatically when they exceed `log_max_mb` (default: 10 MB).

In foreground mode, logs also print to the terminal in real time.

## Typical Workflows

### Passive research collector

```bash
# Set up once
kib init ~/research
cd ~/research

# Watch your downloads folder for PDFs
kib config watch.folders '[{"path": "/home/user/Downloads", "glob": "*.pdf"}]'

# Start daemon
kib watch --daemon

# Now any PDF you download gets ingested and compiled automatically
```

### Browser extension pipeline

```bash
# Start the daemon
kib watch --daemon

# From a browser extension or bookmarklet, POST clipped content:
curl -X POST http://localhost:4747/ingest \
  -H "Content-Type: application/json" \
  -d '{"content": "...", "title": "Page Title", "url": "https://..."}'
```

### Always-on with system service

```bash
# Install as a service (starts on login)
kib watch --install

# Forget about it — files dropped in inbox/ or watched folders
# get ingested automatically, compiled every 5 sources or 30 min
```
