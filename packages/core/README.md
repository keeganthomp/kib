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
| **Vault** | Filesystem operations, manifest tracking, config management |
| **Ingest** | Extractors for web pages, PDFs, YouTube, GitHub repos, and local files |
| **Compile** | LLM-powered compilation with caching, retry, token budgets, parallel execution, and smart context selection |
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

## Compile Engine

The compile engine (`compileVault`) includes:

- **Compile cache** — skips LLM calls when the same prompt has been seen before (`.kb/cache/responses/`)
- **Retry** — retries up to 2 times with an adjusted prompt if the LLM returns malformed JSON
- **Token tracking** — reports per-source and total token usage (input/output, cache hits, truncations)
- **Token budget** — stops compilation when `compile.max_tokens_per_pass` is exhausted
- **Auto-truncation** — truncates sources exceeding `compile.max_source_tokens` at paragraph boundaries
- **Smart context** — sends article summaries instead of full content when existing articles exceed the context budget
- **Duplicate detection** — warns when new articles overlap with existing ones
- **Parallel compilation** — compiles independent sources concurrently when `compile.parallel` is enabled

```typescript
const result = await compileVault(root, provider, config, {
  force: false,        // recompile all sources
  dryRun: false,       // preview without writing
  sourceFilter: null,  // compile specific source
  maxSources: 10,      // limit sources per pass
  onProgress: console.log,
});

// result.tokenUsage.totalInputTokens
// result.tokenUsage.perSource[0].cached
// result.warnings — truncation/budget/duplicate alerts
```

## LLM Providers

| Provider | Env Variable | Default Model |
|----------|-------------|---------------|
| Anthropic | `ANTHROPIC_API_KEY` | claude-sonnet-4-20250514 |
| OpenAI | `OPENAI_API_KEY` | gpt-4o |
| Ollama | (auto-detect localhost:11434) | llama3 |

## License

MIT
