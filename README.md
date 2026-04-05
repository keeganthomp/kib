# kib

The Headless Knowledge Compiler. A CLI-first, LLM-powered tool that turns raw source material into a structured, queryable markdown wiki — maintained entirely by AI.

`git` for knowledge — ingest, compile, query, lint, all from the terminal.

## Quick Start

```bash
# Initialize a vault
kib init

# Ingest sources (URLs, files, PDFs, YouTube, GitHub repos)
kib ingest https://arxiv.org/abs/1706.03762
kib ingest ./papers/*.pdf
kib ingest https://www.youtube.com/watch?v=...

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
                            ┌─────────────────────────────────────┐
                            │             kib CLI                  │
                            │  init  ingest  compile  search      │
                            │  query  chat  lint  skill  watch    │
                            └──────────────┬──────────────────────┘
                                           │
                    ┌──────────────────────┼──────────────────────┐
                    │                      │                      │
            ┌───────▼───────┐    ┌─────────▼────────┐    ┌───────▼───────┐
            │  Ingest Layer │    │  Compile Engine   │    │  Query Engine │
            │               │    │                   │    │               │
            │  Extractors:  │    │  LLM prompts      │    │  BM25 search  │
            │  - Web        │    │  Response parser   │    │  RAG pipeline │
            │  - PDF        │    │  INDEX.md gen      │    │  Article      │
            │  - YouTube    │    │  GRAPH.md gen      │    │   retrieval   │
            │  - GitHub     │    │  Backlink graph    │    │  Citation     │
            │  - File       │    │  Manifest update   │    │   tracking    │
            └───────┬───────┘    └─────────┬────────┘    └───────┬───────┘
                    │                      │                      │
                    ▼                      ▼                      ▼
            ┌──────────────────────────────────────────────────────────┐
            │                     Vault (filesystem)                   │
            │                                                          │
            │  .kb/                raw/                wiki/            │
            │  ├── manifest.json   ├── articles/       ├── INDEX.md    │
            │  ├── config.toml     ├── papers/         ├── GRAPH.md    │
            │  ├── cache/          ├── transcripts/    ├── concepts/   │
            │  └── skills/         └── repos/          ├── topics/     │
            │                                          ├── references/ │
            │                                          └── outputs/    │
            └──────────────────────────┬───────────────────────────────┘
                                       │
                    ┌──────────────────┼──────────────────┐
                    │                  │                   │
            ┌───────▼──────┐  ┌────────▼───────┐  ┌──────▼──────┐
            │  Anthropic   │  │    OpenAI      │  │   Ollama    │
            │  Claude      │  │    GPT-4o      │  │   Local     │
            └──────────────┘  └────────────────┘  └─────────────┘
```

### How it works

1. **Ingest** — `kib ingest <source>` fetches content from URLs, PDFs, YouTube, GitHub repos, or local files. Extractors convert everything to normalized markdown with frontmatter. Content is hashed for dedup and stored in `raw/`.

2. **Compile** — `kib compile` finds sources not yet compiled (tracked via manifest). For each, it sends the raw content + current wiki index to the LLM, which produces structured wiki articles with frontmatter, tags, and `[[wikilinks]]`. The compiler then regenerates `INDEX.md` (table of contents) and `GRAPH.md` (relationship graph).

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
  init                Create a new vault in the current directory
  ingest <source>     Ingest sources into raw/ (URLs, files, PDFs, etc.)
  compile             Compile raw sources into wiki articles via LLM
  query <question>    Ask a question against the knowledge base (RAG)
  search <term>       Fast BM25 text search across the vault
  chat                Interactive REPL with conversation history
  lint                Run health checks on the wiki
  status              Vault health dashboard

MANAGEMENT
  config [key] [val]  Get or set configuration
  skill <sub> [name]  Manage skills (list, run)
  watch               Watch inbox/ and auto-ingest new files
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
│   └── repos/
├── wiki/                 # LLM-compiled knowledge base
│   ├── INDEX.md          # Master index: every article + summary + tags
│   ├── GRAPH.md          # Article relationship adjacency list
│   ├── concepts/         # Core concept articles
│   ├── topics/           # Topic deep-dives
│   ├── references/       # People, papers, organizations
│   └── outputs/          # Query results, generated reports
└── inbox/                # Drop zone for kib watch (auto-ingested)
```

The vault is just files. View it in any editor. Version it with git. No lock-in.

## LLM Providers

kib auto-detects your provider from environment variables:

| Provider | Env Variable | Default Model |
|---|---|---|
| **Anthropic** | `ANTHROPIC_API_KEY` | claude-sonnet-4-20250514 |
| **OpenAI** | `OPENAI_API_KEY` | gpt-4o |
| **Ollama** | (auto-detect on localhost:11434) | llama3 |

Override via config:

```bash
kib config set provider.default openai
kib config set provider.model gpt-4o
```

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

```bash
# Install dependencies
bun install

# Run tests (206 tests)
bun test

# Lint & format
bun run check
bun run check:fix

# Run CLI locally
bun run packages/cli/bin/kib.ts --help
```

Monorepo with two packages:
- `packages/core` (`@kib/core`) — types, schemas, vault ops, providers, engines
- `packages/cli` (`kib`) — CLI commands and terminal UI

## Roadmap

See [ROADMAP.md](ROADMAP.md) for the full roadmap including deferred features, distribution plans, and post-v1 ideas.

## License

MIT
