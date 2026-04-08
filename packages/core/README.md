# @kibhq/core

Core engine for [kib](https://github.com/keeganthomp/kib) — the headless knowledge compiler.

This package provides the vault operations, LLM providers, ingest extractors, compile engine, BM25 search, and RAG query engine that power the `kib` CLI.

## Install

```bash
npm i @kibhq/core
```

> Most users should install the CLI instead: `npm i -g @kibhq/cli`

## What's inside

| Module | Description |
|--------|-------------|
| **Vault** | Filesystem operations, manifest tracking, config management, image asset storage |
| **Ingest** | Extractors for web pages, PDFs, YouTube, GitHub repos, images (vision), and local files |
| **Compile** | LLM-powered compilation from raw sources into structured wiki articles with image references |
| **Search** | BM25 full-text search with English stemming |
| **Query** | RAG engine — retrieves relevant articles and generates cited answers |
| **Lint** | 5 health-check rules (orphan articles, broken links, stale sources, etc.) |
| **Skills** | Skill loader and runner for extensible vault operations |
| **Providers** | LLM adapters for Anthropic Claude, OpenAI, and Ollama |

## Usage

```typescript
import {
  resolveVaultRoot,
  loadManifest,
  loadConfig,
  SearchIndex,
  queryVault,
  ingestSource,
  compileVault,
  createProvider,
} from "@kibhq/core";

// Find the vault
const root = resolveVaultRoot();
const config = await loadConfig(root);
const manifest = await loadManifest(root);

// Search
const index = new SearchIndex();
await index.build(root, "all");
const results = index.search("attention mechanisms", { limit: 10 });

// RAG query
const provider = await createProvider(config.provider.default, config.provider.model);
const answer = await queryVault(root, "how does self-attention work?", provider);
console.log(answer.answer);
```

## LLM Providers

| Provider | Env Variable | Default Model |
|----------|-------------|---------------|
| Anthropic | `ANTHROPIC_API_KEY` | claude-sonnet-4-6 |
| OpenAI | `OPENAI_API_KEY` | gpt-4o |
| Ollama | (auto-detect localhost:11434) | llama3 |

## License

MIT
