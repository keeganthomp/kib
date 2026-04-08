# kib

The Headless Knowledge Compiler. A CLI-first, LLM-powered tool that turns raw source material into a structured, queryable markdown wiki — maintained entirely by AI.

`git` for knowledge — ingest, compile, query, lint, all from the terminal.

## Install

```bash
# Homebrew (macOS & Linux)
brew tap keeganthomp/kib
brew install kib

# npm (requires Bun)
npm i -g @kibhq/cli

# or run without installing
npx @kibhq/cli init
```

Standalone binaries are also available on the [releases page](https://github.com/keeganthomp/kib/releases).

## Quick Start

```bash
# Initialize a vault (creates ~/.kib by default)
kib init

# Or init in a specific directory
kib init ./my-vault
kib init .   # current directory

# Ingest sources (URLs, files, PDFs, YouTube, GitHub repos, images) — works from anywhere
kib ingest https://arxiv.org/abs/1706.03762
kib ingest ./papers/*.pdf
kib ingest https://www.youtube.com/watch?v=...
kib ingest ./whiteboard.png

# Compile into wiki articles
kib compile

# Search your knowledge base
kib search "attention mechanisms"

# Ask questions (RAG over your wiki)
kib query "what are the tradeoffs between MoE and dense models?"

# Interactive chat
kib chat
```

## Architecture

```
                         ┌───────────────────────────────────────┐
                         │                kib CLI                │
                         │  init · ingest · compile · search ·   │
                         │  query · chat · lint · serve · watch  │
                         └───────────────────┬───────────────────┘
                                             │
              ┌──────────────────────────────┼──────────────────────────────┐
              │                              │                              │
     ┌────────▼────────┐            ┌────────▼────────┐            ┌────────▼────────┐
     │  Ingest Layer   │            │ Compile Engine  │            │  Query Engine   │
     │                 │            │                 │            │                 │
     │  Web, PDF,      │            │  LLM prompts,   │            │  BM25 search,   │
     │  YouTube,       │            │  parser,        │            │  RAG, article   │
     │  GitHub, File,  │            │  INDEX/GRAPH,   │            │  retrieval,     │
     │  Image (vision) │            │                 │            │                 │
     │                 │            │  backlinks      │            │  citations      │
     └────────┬────────┘            └────────┬────────┘            └────────┬────────┘
              │                              │                              │
              └──────────────────────────────┼──────────────────────────────┘
                                             ▼
              ┌──────────────────────────────────────────────────────────────┐
              │                    Vault (filesystem)                        │
              │                                                              │
              │   .kb/               raw/               wiki/                │
              │   ├── manifest.json  ├── articles/     ├── INDEX.md          │
              │   ├── config.toml    ├── papers/       ├── GRAPH.md          │
              │   ├── cache/         ├── transcripts/  ├── images/           │
              │   └── skills/        ├── repos/        ├── concepts/         │
              │                      └── images/       ├── topics/           │
              │                                        ├── references/       │
              │                                        └── outputs/          │
              └──────────────────────────────┬───────────────────────────────┘
                                             │
              ┌──────────────────────────────┼──────────────────────────────┐
              │                              │                              │
     ┌────────▼────────┐            ┌────────▼────────┐            ┌────────▼────────┐
     │    Anthropic    │            │     OpenAI      │            │     Ollama      │
     │     Claude      │            │     GPT-4o      │            │     (local)     │
     └─────────────────┘            └─────────────────┘            └─────────────────┘
```

### How it works

1. **Ingest** — `kib ingest <source>` fetches content from URLs, PDFs, YouTube, GitHub repos, images, or local files. Extractors convert everything to normalized markdown with frontmatter. Images are described via vision models (Anthropic Claude, OpenAI GPT-4V). Content is hashed for dedup and stored in `raw/`.

2. **Compile** — `kib compile` finds sources not yet compiled (tracked via manifest). For each, it sends the raw content + current wiki index to the LLM, which produces structured wiki articles with frontmatter, tags, and `[[wikilinks]]`. Articles compiled from image sources can embed the original images using standard markdown syntax (`![alt](images/file.png)`). The compiler then regenerates `INDEX.md` (table of contents) and `GRAPH.md` (relationship graph).

3. **Search** — `kib search <term>` runs BM25 full-text search with English stemming over all wiki articles. Sub-50ms for thousands of articles. Index is cached and rebuilt on compile.

4. **Query** — `kib query <question>` is RAG: search for relevant articles, load them into context, send to LLM with the question, get a cited answer back.

5. **Lint** — `kib lint` runs health checks: orphan articles, broken `[[wikilinks]]`, stale sources, missing frontmatter, topics referenced but with no article.

6. **Skills** — `kib skill run <name>` executes skills (built-in or custom `.ts` files in `.kb/skills/`) with full access to the vault, LLM, and search engine.

## Commands

```
kib — The Knowledge Compiler

USAGE
  kib <command> [options]

CORE COMMANDS
  init [dir]          Create a new vault (defaults to ~/.kib)
  ingest <source>     Ingest sources into raw/ (URLs, files, PDFs, etc.)
  compile             Compile raw sources into wiki articles via LLM
  query <question>    Ask a question against the knowledge base (RAG)
  search <term>       Fast BM25 text search across the vault
  chat                Interactive REPL with conversation history
  lint                Run health checks on the wiki
  status              Vault health dashboard

INTEGRATION
  serve               Start MCP server for AI tool integration
  mcp                 Configure MCP in AI clients (auto-runs on init)
  watch               Watch inbox/ and auto-ingest new files

MANAGEMENT
  config [key] [val]  Get or set configuration
  skill <sub> [name]  Manage skills (install, list, run, create)
  export              Export wiki to markdown or HTML

FLAGS
  --json              JSON output (for piping)
  --dry-run           Show what would happen without doing it
  --force             Force operation (e.g., recompile all)
  --help, -h          Show help
  --version           Show version
```

### Ingest Sources

```bash
# Web pages
kib ingest https://blog.example.com/article

# PDFs (local or URL)
kib ingest ./paper.pdf
kib ingest https://arxiv.org/pdf/1706.03762

# YouTube (extracts transcript)
kib ingest https://www.youtube.com/watch?v=dQw4w9WgXcQ

# GitHub repos (README + file structure)
kib ingest https://github.com/anthropics/claude-code

# Images (described via vision model)
kib ingest ./whiteboard.png ./diagram.jpg
kib ingest https://example.com/screenshot.webp

# Local files (markdown, text, code)
kib ingest ./notes.md ./research/*.txt

# Batch from file
cat urls.txt | xargs kib ingest
```

### Search & Query

```bash
# Fast text search
kib search "positional encoding"

# Ask questions (uses RAG over your wiki)
kib query "how does self-attention differ from cross-attention?"

# Interactive chat with memory
kib chat
> what do I know about scaling laws?
> how does that relate to the chinchilla findings?
> /exit
```

### Lint & Skills

```bash
# Check wiki health
kib lint
kib lint --check broken-link
kib lint --json

# Run built-in skills
kib skill list
kib skill run summarize
kib skill run flashcards
kib skill run connections
```

### Export

```bash
# Export as clean markdown (stripped frontmatter, resolved links)
kib export --format markdown

# Export as HTML static site (with image support and gallery)
kib export --format html

# Custom output directory
kib export --format html --output ./site
```

HTML export copies image assets, resolves relative paths, and generates a browsable gallery page.

## Vault Structure

```
my-vault/
├── .kb/
│   ├── manifest.json     # Source tracking, compile state, dependency graph
│   ├── config.toml       # Vault-level configuration
│   ├── cache/            # LLM response cache, search index
│   └── skills/           # Installed custom skills
├── raw/                  # Ingested source material (never modified by compile)
│   ├── articles/
│   ├── papers/
│   ├── transcripts/
│   ├── repos/
│   └── images/
├── wiki/                 # LLM-compiled knowledge base
│   ├── INDEX.md          # Master index: every article + summary + tags
│   ├── GRAPH.md          # Article relationship adjacency list
│   ├── images/           # Image assets (originals from ingested images)
│   ├── concepts/         # Core concept articles
│   ├── topics/           # Topic deep-dives
│   ├── references/       # People, papers, organizations
│   └── outputs/          # Query results, generated reports
└── inbox/                # Drop zone for kib watch (auto-ingested)
```

The vault is just files. View it in any editor. Version it with git. No lock-in.

## LLM Providers

On first use, kib walks you through provider setup interactively — pick a provider, paste your API key, done. Credentials are saved to `~/.config/kib/credentials`.

You can also set provider via environment variables:

| Provider | Env Variable | Default Model |
|---|---|---|
| **Anthropic** | `ANTHROPIC_API_KEY` | claude-sonnet-4-6 |
| **OpenAI** | `OPENAI_API_KEY` | gpt-4o |
| **Ollama** | (auto-detect on localhost:11434) | llama3 |

Override via config:

```bash
kib config provider.default openai
kib config provider.model gpt-4o
```

## MCP Server

Give your AI assistant direct access to your knowledge base. `kib init` auto-configures Claude Code, Claude Desktop, and Cursor:

```bash
npm i -g @kibhq/cli && kib init
```

That's it. Restart your AI client and it can search, query, ingest, and compile your vault.

Already have a vault? Run `kib mcp` to configure MCP clients without re-initializing.

**11 tools:** `kib_status`, `kib_list`, `kib_read`, `kib_search`, `kib_query`, `kib_ingest`, `kib_compile`, `kib_lint`, `kib_config`, `kib_skill`, `kib_export`

**3 resources:** `wiki://index`, `wiki://graph`, `wiki://log`

<details>
<summary>Manual setup (other clients)</summary>

Add this to your MCP client config:

```json
{
  "mcpServers": {
    "kib": {
      "command": "kib",
      "args": ["serve"],
      "cwd": "/path/to/your/vault"
    }
  }
}
```

Or run `kib mcp` to auto-detect and configure supported clients.

</details>

## Tech Stack

- **Runtime:** [Bun](https://bun.sh) — fast JS runtime, package manager, test runner
- **Language:** TypeScript (strict mode, ESM-only)
- **CLI:** [Commander](https://github.com/tj/commander.js)
- **Validation:** [Zod](https://zod.dev)
- **Linting:** [Biome](https://biomejs.dev)
- **Search:** Custom BM25 implementation with English stemming
- **HTML parsing:** [Cheerio](https://cheerio.js.org) + [Turndown](https://github.com/mixmark-io/turndown)
- **Hashing:** [xxhash-wasm](https://github.com/nicolo-ribaudo/xxhash-wasm)

## Development

### Prerequisites

- [Bun](https://bun.sh) (v1.1+)
- An LLM API key (Anthropic, OpenAI, or local Ollama) for commands that call an LLM (`compile`, `query`, `chat`)

### Setup

```bash
git clone https://github.com/keeganthomp/kib.git
cd kib
bun install
```

This is a Bun workspace monorepo with two packages:
- `packages/core` (`@kibhq/core`) — vault ops, LLM providers, ingest extractors, compile engine, search, query, lint, skills
- `packages/cli` (`@kibhq/cli`) — CLI commands, terminal UI, MCP server

Bun resolves `@kibhq/core` to the local workspace copy automatically — no build step needed.

### Running the CLI locally

Use `bun run packages/cli/bin/kib.ts` anywhere you'd normally type `kib`:

```bash
# Show help
bun run packages/cli/bin/kib.ts --help

# Initialize a vault
bun run packages/cli/bin/kib.ts init

# Ingest a source
bun run packages/cli/bin/kib.ts ingest https://example.com/article

# Compile, search, query, lint, etc.
bun run packages/cli/bin/kib.ts compile
bun run packages/cli/bin/kib.ts search "attention"
bun run packages/cli/bin/kib.ts lint
```

Or from the `packages/cli` directory:

```bash
cd packages/cli
bun run dev -- --help
bun run dev -- ingest ./some-file.pdf
```

### Testing

```bash
# Run all tests (core + cli)
bun test

# Run tests for a specific package
bun test packages/core
bun test packages/cli

# Run a specific test file
bun test packages/cli/src/mcp/server.test.ts
```

### Linting & formatting

```bash
# Check for lint/format issues
bun run check

# Auto-fix
bun run check:fix
```

### Testing the MCP server locally

The MCP server communicates over stdio. To test it against your local code:

**With the MCP Inspector (interactive web UI):**

```bash
cd /path/to/your/vault
npx @modelcontextprotocol/inspector bun run /path/to/kib/packages/cli/bin/kib.ts serve
```

**With Claude Code / Claude Desktop / Cursor:**

Point your MCP client config at the local source instead of the published package:

```json
{
  "mcpServers": {
    "kib": {
      "command": "bun",
      "args": ["run", "/path/to/kib/packages/cli/bin/kib.ts", "serve"],
      "cwd": "/path/to/your/vault"
    }
  }
}
```

**Automated tests:**

```bash
bun test packages/cli/src/mcp/server.test.ts
```

The MCP tests use the SDK's `InMemoryTransport` to test all tools and resources in-process without spawning a subprocess.

## Roadmap

See [ROADMAP.md](ROADMAP.md) for the full roadmap including deferred features, distribution plans, and post-v1 ideas.

## License

MIT
