# kib

The Headless Knowledge Compiler. A CLI-first, LLM-powered tool that turns raw source material into a structured, queryable markdown wiki — maintained entirely by AI.

`git` for knowledge — ingest, compile, query, lint, all from the terminal.

## Install

```bash
# Requires Bun (https://bun.sh)
npm i -g @kibhq/cli

# or run without installing
npx @kibhq/cli init
```

Standalone binaries for macOS and Linux are available on the [releases page](https://github.com/keeganthomp/kib/releases).

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

## Commands

```
CORE
  init                Create a new vault in the current directory
  ingest <source>     Ingest sources into raw/ (URLs, files, PDFs, etc.)
  compile             Compile raw sources into wiki articles via LLM
  query <question>    Ask a question against the knowledge base (RAG)
  search <term>       Fast BM25 text search across the vault
  chat                Interactive REPL with conversation history
  lint                Run health checks on the wiki
  status              Vault health dashboard

INTEGRATION
  serve --mcp         Start MCP server for AI tool integration
  watch               Watch inbox/ and auto-ingest new files

MANAGEMENT
  config [key] [val]  Get or set configuration
  skill <sub> [name]  Manage skills (list, run)
  export              Export wiki to markdown or HTML
```

## LLM Providers

On first use, kib walks you through provider setup interactively. Or set via environment:

| Provider | Env Variable | Default Model |
|----------|-------------|---------------|
| Anthropic | `ANTHROPIC_API_KEY` | claude-sonnet-4-20250514 |
| OpenAI | `OPENAI_API_KEY` | gpt-4o |
| Ollama | (auto-detect localhost:11434) | llama3 |

## Vault Structure

```
my-vault/
├── .kb/                  # Config, manifest, cache
├── raw/                  # Ingested source material (never modified by compile)
│   ├── articles/
│   ├── papers/
│   ├── transcripts/
│   └── repos/
├── wiki/                 # LLM-compiled knowledge base
│   ├── INDEX.md          # Master index
│   ├── GRAPH.md          # Article relationship graph
│   ├── concepts/
│   ├── topics/
│   ├── references/
│   └── outputs/
└── inbox/                # Drop zone for kib watch
```

The vault is just files. View it in any editor. Version it with git. No lock-in.

## MCP Server

Give your AI assistant direct access to your knowledge base:

```bash
kib mcp setup
```

Auto-detects and configures Claude Code, Claude Desktop, and Cursor. Restart your AI client and it can search, query, ingest, and compile your vault.

8 tools: `kib_status`, `kib_list`, `kib_read`, `kib_search`, `kib_query`, `kib_ingest`, `kib_compile`, `kib_lint`

<details>
<summary>Manual setup (other clients)</summary>

```json
{
  "mcpServers": {
    "kib": {
      "command": "kib",
      "args": ["serve", "--mcp"],
      "cwd": "/path/to/your/vault"
    }
  }
}
```

</details>

## Links

- [GitHub](https://github.com/keeganthomp/kib)
- [Roadmap](https://github.com/keeganthomp/kib/blob/main/ROADMAP.md)
- [@kibhq/core](https://www.npmjs.com/package/@kibhq/core) — core engine (for programmatic use)

## License

MIT
