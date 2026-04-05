# kib

The Headless Knowledge Compiler. A CLI-first, LLM-powered tool that turns raw source material into a structured, queryable markdown wiki — maintained entirely by AI.

`git` for knowledge — ingest, compile, query, lint, all from the terminal.

## Quick Start

```bash
# Install
npx kib init

# Ingest a source
kib ingest https://arxiv.org/abs/1706.03762

# Compile into wiki articles
kib compile

# Search your knowledge base
kib search "attention mechanisms"

# Ask questions
kib query "what are the tradeoffs between MoE and dense models?"
```

## Core Principles

1. **Zero config by default.** `npx kib init` and you're running.
2. **The vault is the product.** A portable, git-friendly directory of markdown files. No database. No server.
3. **CLI is the only interface.** Everything flows through `kib <command>`.
4. **LLM does the writing.** The LLM ingests, compiles, links, indexes, and lints.
5. **Skills are extensible.** Core operations ship built-in. Community can add new skills.
6. **Incremental by design.** Only recompile what changed. Token costs stay sane.

## Commands

```
kib init              Create a new vault
kib ingest <source>   Ingest a source into raw/
kib compile           Compile raw sources into wiki articles
kib query <question>  Ask a question against the knowledge base
kib search <term>     Fast text search across the vault
kib chat              Interactive REPL with the knowledge base
kib lint              Run health checks on the wiki
kib status            Vault health dashboard
kib config            Get or set configuration
kib skill             Manage skills
kib watch             Watch inbox/ and auto-ingest
kib export            Export wiki to other formats
```

## Vault Structure

```
my-vault/
├── .kb/              # Config, manifest, cache
├── raw/              # Ingested source material (never modified by compile)
├── wiki/             # LLM-compiled knowledge base
│   ├── INDEX.md      # Master index
│   ├── GRAPH.md      # Relationship graph
│   ├── concepts/
│   ├── topics/
│   ├── references/
│   └── outputs/
└── inbox/            # Drop zone for auto-ingest
```

## LLM Providers

kib auto-detects your provider from environment variables:

- **Anthropic** (default): `ANTHROPIC_API_KEY`
- **OpenAI**: `OPENAI_API_KEY`
- **Ollama**: Local instance at `localhost:11434`

## License

MIT
