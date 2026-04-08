# kib Roadmap

What's built, what's next, and what's deferred.

---

## Shipped (v1.0.0)

### Core (v0.2.0)
- `kib init` — vault creation with auto-detected LLM provider
- `kib ingest` — web, file, PDF, YouTube, GitHub extractors with dedup
- `kib compile` — LLM-powered compilation with incremental builds, INDEX.md, GRAPH.md
- `kib search` — BM25 full-text search with stemming and index persistence
- `kib query` — RAG query engine with article retrieval and citations
- `kib chat` — interactive REPL with conversation history
- `kib lint` — 5 rules (orphan, broken-link, stale, frontmatter, missing)
- `kib skill` — skill system with loader, runner, 3 built-in skills
- `kib watch` — file watcher + local HTTP server for browser extension
- `kib export` — markdown and HTML static site export
- `kib status` — vault health dashboard
- `kib config` — get/set/list vault configuration

### LLM & Providers (v0.2.0)
- Anthropic, OpenAI, Ollama providers with lazy-loading
- Interactive provider setup flow (select provider, enter API key, auto-save)
- Credentials stored at `~/.config/kib/credentials`, auto-loaded on startup
- LLM response cache with TTL

### Distribution (v0.2.0)
- Published to npm as `@kibhq/core` and `@kibhq/cli`
- Standalone binaries for macOS/Linux via `bun build --compile`
- Release Please: auto-versioning, changelogs, npm publish, binary builds
- CI: Biome lint + 402 tests on PRs to main

### MCP Server (v0.2.0)
- `kib serve` — expose vault as MCP tools over stdio
- `kib init` auto-configures MCP in Claude Code, Claude Desktop, and Cursor
- `kib mcp` to re-configure MCP clients independently
- 11 tools: `kib_status`, `kib_list`, `kib_read`, `kib_search`, `kib_query`, `kib_ingest`, `kib_compile`, `kib_lint`, `kib_config`, `kib_skill`, `kib_export`
- 3 resources: `wiki://index`, `wiki://graph`, `wiki://log`

### CLI Polish (v0.3.0)
- `--json` flag working consistently across all commands
- `--verbose` flag for debug output
- `--dry-run` for ingest (show what would be ingested without writing)
- `kib compile --dry-run` visual diff preview
- `kib lint --fix` actually runs auto-fixes (recompile stale, create missing articles)
- Colored diff output showing what compile changed
- <100ms cold start for `kib --help`

### Smarter Compilation (v0.4.0)
- Token usage tracking per compile pass and per source
- Auto-summarize large sources before sending to LLM (chunk into 8K-token windows)
- Smart context selection: for large vaults, send INDEX.md + summaries, not full articles
- Token budget config: `compile.max_tokens_per_pass`
- Warning when a single source exceeds the model's context window
- Article merging: detect when two sources produce articles about the same topic
- Compile cache integration: skip LLM call when cache hit matches
- Retry with adjusted prompt when LLM returns malformed output (max 2 retries)
- `kib compile --source <path>` to recompile a specific source
- Streaming compile output: show article titles as they're generated
- Parallel compilation: compile independent sources concurrently

### Multi-Model Support (v0.4.0)
- Config-based model selection per operation: `compile.model`, `query.model`, `lint.model`
- `fast_model` used for lightweight ops (skills with `model: "fast"`)
- `default` model used for heavy ops (compile, query)

### Other (v0.4.x)
- Fall back to `~/.kib` when no local vault found
- Surface auth errors in compile and improve MCP provider feedback
- Improved compile error handling
- Website launched

---

## v0.5.0 — Image + Vision Support & Packaging

### Distribution
- [x] Homebrew formula for `brew install kib`
- [x] Auto-generate a `CLAUDE.md` in vault root on `kib init` for agent discovery

### Image Extractor
- [x] `kib ingest photo.png` — send to vision model, get markdown description
- [x] Store description in `raw/images/{name}.md` with metadata
- [x] Support PNG, JPG, JPEG, WebP, GIF, SVG, BMP, TIFF
- [x] Vision API integration for Anthropic (Claude) and OpenAI (GPT-4V)
- [x] Whiteboard photo → structured notes extraction
- [x] Diagram → markdown description + detected labels
- [x] Screenshot → extract text content via vision model

### Image References in Articles
- [x] Compile step can reference images from raw/images/ in wiki articles
- [x] HTML export includes images with proper relative paths
- [x] Image gallery view in HTML export

---

## v0.6.0 — Browser Extension

### Chrome Extension (MV3)
- [x] `packages/extension/` — Chrome Manifest V3 extension
- [x] "Send to KB" button on any webpage
- [x] Content script: readability-based article extraction
- [x] Background script: turndown conversion + POST to `localhost:4747/ingest`
- [x] Popup UI: status indicator (green = kib watch running), tag input, vault selector
- [x] Optional: highlight text on page → send selection to KB
- [x] Build pipeline: `bun build` for extension, separate from CLI

### Firefox Extension
- [ ] Port Chrome extension to Firefox (WebExtension API)
- [ ] Publish to Firefox Add-ons

---

## v0.7.0 — Advanced Search

### Vector/Semantic Search
- [x] Optional embedding-based search alongside BM25
- [x] Embedding provider: OpenAI `text-embedding-3-small`, or local via Ollama
- [x] Hybrid scoring: combine BM25 + cosine similarity (Reciprocal Rank Fusion)
- [x] Store embeddings in `.kb/cache/vectors.idx` (binary Float32Array format)
- [x] Rebuild embeddings on compile

### Search Improvements
- [x] Fuzzy matching for typo tolerance (edit distance ≤ 1 for tokens ≥ 4 chars)
- [x] Phrase search with quotes: `kib search '"attention mechanism"'`
- [x] Tag-based filtering: `kib search "transformers" --tag deep-learning`
- [x] Date range filtering: `kib search --since 2024-01-01`
- [x] Search result highlighting in terminal (bold matched terms)

---

## v0.8.0 — Skill Ecosystem

### Remote Skill Registry
- [x] `kib skill install github:user/skill-name` — install from GitHub repo
- [x] `kib skill install <npm-package>` — install from npm
- [x] Skill dependency resolution (skills can depend on other skills)
- [x] `kib skill create <name>` — scaffold a new skill from template
- [x] `kib skill publish` — publish to registry

### Additional Built-in Skills
- [x] `find-contradictions` — detect contradictory claims across articles
- [x] `weekly-digest` — generate a weekly summary of new additions
- [x] `export-slides` — generate Marp slide deck from articles
- [x] `timeline` — generate chronological timeline from articles
- [x] `compare` — compare two articles/topics side by side
- [x] `explain` — explain a topic at a specified reading level
- [x] `suggest-tags` — auto-tag articles based on content analysis

### Skill API Enhancements
- [x] Skill-to-skill invocation (one skill can call another)
- [x] Skill hooks: run automatically after compile, ingest, or lint
- [x] Skill configuration in `config.toml`
- [x] Skill output to specific wiki category

---

## v1.0.0 — Production Ready

### Reliability
- [x] Lockfile mechanism to prevent concurrent vault writes
- [x] Automatic backup before destructive operations (compile --force)
- [x] Crash recovery: detect incomplete writes and repair manifest
- [x] Validate manifest integrity on every load (detect corruption)

### Documentation
- [x] `docs/getting-started.md` — quick start tutorial with real example
- [x] `docs/vault-format.md` — vault format specification
- [x] `docs/skill-authoring.md` — how to create custom skills
- [x] `docs/provider-config.md` — LLM provider setup guide
- [x] `docs/architecture.md` — codebase architecture for contributors
- [x] Example vaults in `examples/` directory (ML research, software docs, reading list)
- [ ] Blog post / launch announcement

### Testing & Quality
- [x] E2E test suite: full `init → ingest → compile → search → query` with mock LLM
- [x] Performance benchmarks: measure compile time, search latency, cold start
- [ ] CI: test on macOS, Linux, Windows
- [x] Code coverage reporting via `bun test --coverage`

---

## Gamechangers

The features that take kib from "cool tool" to "can't live without it."

### Passive Learning Daemon
kib should silently learn from everything you read without you thinking about it.
- [ ] Chrome extension: "Send to KB" button + optional auto-capture of pages you spend >30s on
- [ ] `kib watch` as a background daemon (launchd/systemd) — not just inbox, but browser history, clipboard, screenshots
- [ ] OS-level integration: watch a folder of PDFs, auto-ingest Kindle highlights, Readwise sync
- [ ] Zero-friction ingest: no commands, no thinking, it just absorbs

### Instant Value Without Compile
Most of kib's value is locked behind `kib compile`. That's wrong — value should be immediate on ingest.
- [ ] Search + query over raw sources directly (no compile required)
- [ ] Compile becomes an optional enrichment step, not a prerequisite
- [ ] Incremental indexing: search index updates on ingest, not compile
- [ ] "Ask about this source" — query a single raw source without compiling the whole vault

### Beyond CLI
CLI-only means developer-only. The knowledge is valuable to everyone.
- [ ] VS Code extension: sidebar with search, query, ingest from editor
- [ ] Obsidian plugin: sync kib vault ↔ Obsidian vault, use kib's compile + search
- [ ] Web UI: local dashboard with graph visualization, search, query (not just export)
- [ ] Raycast/Alfred integration: global hotkey → search your knowledge base
- [ ] Mobile: read-only PWA for querying on the go

### Shared Knowledge Bases
Personal wikis are useful. Team wikis are essential.
- [ ] `kib share` — push vault to a git remote, team members clone + contribute
- [ ] Multi-user ingest: team members ingest from their own browsers, shared compile
- [ ] Access control: public wiki articles vs private notes
- [ ] Team dashboard: who ingested what, what's new this week, knowledge gaps
- [ ] Org-wide knowledge graph: connect team vaults into a federated search

---

## Post v1.0 — Future Ideas

### Vault Merging
- [ ] `kib merge <other-vault>` — merge two vaults
- [ ] LLM-powered conflict resolution for overlapping articles
- [ ] Three-way merge: base + ours + theirs for article content
- [ ] Merge strategies: "ours", "theirs", "combine", "llm-resolve"

### Multi-Vault Support
- [ ] `kib vault list` — list known vaults
- [ ] `kib vault switch <name>` — switch active vault
- [ ] Cross-vault search: `kib search --vault all "query"`
- [ ] Cross-vault linking: `[[vault:slug]]` syntax

### Real-Time Collaboration
- [ ] Git-based async collaboration (vault is already git-friendly)
- [ ] Conflict detection and resolution on `git pull`
- [ ] Shared vault hosting (GitHub repo as vault backend)

### Web UI
- [ ] `kib serve` — local web server with read-only wiki viewer
- [ ] Search interface in the browser
- [ ] Article graph visualization (force-directed graph)
- [ ] Reading mode with backlink sidebar

### Additional Export Formats
- [ ] PDF export (via Puppeteer or wkhtmltopdf)
- [ ] Marp slide deck export
- [ ] Anki flashcard deck export (.apkg)
- [ ] Notion import/export
- [ ] Obsidian vault compatibility layer

### Telemetry (Opt-In)
- [ ] Anonymous usage stats: which commands are used most, average vault size
- [ ] Opt-in only, clearly documented
- [ ] Self-hosted analytics endpoint

### Additional LLM Providers
- [ ] Google Gemini
- [ ] Mistral
- [ ] Groq
- [ ] Together AI
- [ ] Custom provider via config (any OpenAI-compatible API)
