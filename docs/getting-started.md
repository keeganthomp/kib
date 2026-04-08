# Getting Started with kib

This guide walks you through setting up kib and building your first knowledge base.

## Install

Pick whichever method suits you:

```bash
# Homebrew (macOS & Linux)
brew tap keeganthomp/kib
brew install kib

# npm (requires Bun runtime)
npm i -g @kibhq/cli

# Run without installing
npx @kibhq/cli init
```

Standalone binaries are on the [releases page](https://github.com/keeganthomp/kib/releases).

## Set up a provider

kib needs an LLM for `compile`, `query`, and `chat`. On first run, it walks you through setup interactively. Or set an env var:

```bash
# Pick one:
export ANTHROPIC_API_KEY=sk-ant-...
export OPENAI_API_KEY=sk-...
# Or run Ollama locally (no key needed)
```

See [provider-config.md](provider-config.md) for full details.

## Create a vault

```bash
# Default vault at ~/.kib
kib init

# Or in a specific directory
kib init ./my-research
```

This creates the vault structure:

```
my-research/
  .kb/           # internal state (manifest, config, cache)
  raw/           # ingested source material
  wiki/          # compiled wiki articles
  inbox/         # drop zone for kib watch
  CLAUDE.md      # auto-generated for AI agent discovery
```

## Ingest sources

Feed kib anything — URLs, PDFs, YouTube videos, GitHub repos, images, local files:

```bash
# Web article
kib ingest https://blog.example.com/transformers-explained

# PDF (local or URL)
kib ingest ./attention-is-all-you-need.pdf

# YouTube (extracts transcript)
kib ingest https://www.youtube.com/watch?v=aircAruvnKk

# GitHub repo (extracts README + structure)
kib ingest https://github.com/anthropics/claude-code

# Image (described via vision model)
kib ingest ./whiteboard-photo.png

# Batch
kib ingest ./papers/*.pdf
cat urls.txt | xargs kib ingest
```

Check what you've ingested:

```bash
kib status
```

## Compile into a wiki

This is where the magic happens. kib sends your raw sources to the LLM, which produces structured wiki articles with tags, cross-references, and `[[wikilinks]]`:

```bash
kib compile
```

The compiler:
- Processes only new/changed sources (incremental)
- Generates articles in `wiki/concepts/`, `wiki/topics/`, `wiki/references/`
- Rebuilds `INDEX.md` (table of contents) and `GRAPH.md` (relationship graph)
- Deduplicates and merges overlapping articles

Preview what would change without writing:

```bash
kib compile --dry-run
```

Force recompile everything:

```bash
kib compile --force
```

## Search and query

```bash
# Fast text search (BM25, sub-50ms)
kib search "attention mechanism"

# Phrase search
kib search '"multi-head attention"'

# Filter by tag or date
kib search "transformers" --tag deep-learning
kib search --since 2024-01-01

# Ask questions (RAG — retrieves articles, sends to LLM, cites sources)
kib query "what are the tradeoffs between MoE and dense models?"

# Interactive chat with conversation history
kib chat
```

## Keep it healthy

```bash
# Run health checks
kib lint

# Auto-fix issues (create missing articles, recompile stale sources)
kib lint --fix
```

## Run skills

Skills are plugins that process your knowledge base:

```bash
# See available skills
kib skill list

# Generate flashcards from your wiki
kib skill run flashcards

# Summarize your knowledge base
kib skill run summarize

# Find contradictions across articles
kib skill run find-contradictions

# Generate a timeline
kib skill run timeline
```

10 built-in skills: `summarize`, `flashcards`, `connections`, `find-contradictions`, `weekly-digest`, `export-slides`, `timeline`, `compare`, `explain`, `suggest-tags`.

See [skill-authoring.md](skill-authoring.md) for creating your own.

## Export

```bash
# Clean markdown (stripped frontmatter, resolved links)
kib export --format markdown

# Static HTML site (with images and gallery)
kib export --format html --output ./site
```

## MCP server

Give AI assistants direct access to your vault. `kib init` auto-configures Claude Code, Claude Desktop, and Cursor:

```bash
kib init   # auto-configures MCP
kib mcp    # reconfigure MCP without reinitializing
kib serve  # start MCP server manually
```

8 tools: `kib_status`, `kib_list`, `kib_read`, `kib_search`, `kib_query`, `kib_ingest`, `kib_compile`, `kib_lint`.

## Common workflows

### Research project

```bash
mkdir ml-research && cd ml-research
kib init .
kib ingest https://arxiv.org/abs/1706.03762
kib ingest https://arxiv.org/abs/2005.14165
kib ingest ./notes/*.md
kib compile
kib query "how does GPT-3 build on the original transformer?"
```

### Reading list

```bash
kib init ~/reading
kib ingest https://paulgraham.com/startupideas.html
kib ingest https://www.youtube.com/watch?v=...
kib compile
kib skill run weekly-digest
```

### Team knowledge base

```bash
kib init ./team-wiki
cd team-wiki
git init
# Everyone ingests, compiles, and pushes
kib ingest ./onboarding-doc.pdf
kib compile
git add -A && git commit -m "add onboarding docs"
```

## Next steps

- [Vault Format](vault-format.md) — understand the file structure
- [Provider Config](provider-config.md) — configure LLM providers and models
- [Skill Authoring](skill-authoring.md) — create custom skills
- [Architecture](architecture.md) — how kib works under the hood
