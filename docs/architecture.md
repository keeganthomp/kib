# Architecture

kib is a Bun + TypeScript monorepo with two packages:

- **`@kibhq/core`** (`packages/core`) — vault operations, LLM providers, ingest extractors, compile engine, search, query, lint, skills
- **`@kibhq/cli`** (`packages/cli`) — CLI commands, terminal UI (spinners, prompts), MCP server

The CLI lazy-imports from core to keep cold starts under 100ms for `kib --help`.

## Package structure

```
packages/
  core/
    src/
      compile/          # Compilation engine
        compiler.ts     # Main compile loop (compileVault)
        prompts.ts      # LLM prompt templates
        diff.ts         # Parse LLM output into file operations
        backlinks.ts    # Wikilink graph + GRAPH.md generation
        enrichment.ts   # Cross-reference enrichment pass
        index-manager.ts # INDEX.md generation + stats
        cache.ts        # LLM response cache
      ingest/           # Source ingestion
        ingest.ts       # Main ingest flow (ingestSource)
        router.ts       # Source type detection
        normalize.ts    # Frontmatter + slug generation
        extractors/     # Per-type extractors
          web.ts        # Readability + Turndown
          pdf.ts        # pdf-parse
          youtube.ts    # Transcript extraction
          github.ts     # GitHub API + README
          image.ts      # Vision model description
          file.ts       # Local file reader
      search/           # Search engines
        engine.ts       # BM25 with English stemming
        vector.ts       # Vector embeddings index
        hybrid.ts       # Hybrid BM25 + vector (RRF)
      query/            # RAG query engine
        query.ts        # Article retrieval + LLM Q&A
      lint/             # Health checks
        lint.ts         # Lint runner + fix engine
        rules.ts        # Lint rules (orphan, stale, missing, broken-link, frontmatter)
        contradiction.ts # LLM-powered contradiction detection
      providers/        # LLM provider implementations
        router.ts       # Provider detection + factory
        anthropic.ts    # Anthropic Claude
        openai.ts       # OpenAI GPT
        ollama.ts       # Ollama (local)
      skills/           # Skill system
        builtins.ts     # 10 built-in skills
        runner.ts       # Skill execution engine
        loader.ts       # Skill discovery from .kb/skills/
        registry.ts     # Install, uninstall, create, publish
        hooks.ts        # Post-compile/ingest/lint hooks
        schema.ts       # Skill package schema
      lockfile.ts       # Vault locking (concurrent write prevention)
      backup.ts         # Manifest backup + restore
      recovery.ts       # Crash recovery (tmp file cleanup, manifest repair)
      integrity.ts      # Manifest integrity validation
      vault.ts          # Filesystem operations (read/write raw, wiki, manifest, config)
      schemas.ts        # Zod schemas for all data types
      types.ts          # TypeScript type definitions
      constants.ts      # Default values, directory names
      errors.ts         # Custom error classes
      hash.ts           # xxhash-wasm content hashing
      index.ts          # Public API exports

  cli/
    src/
      commands/         # CLI command handlers
      ui/               # Terminal UI (spinners, prompts, colors)
      mcp/              # MCP server implementation
    bin/
      kib.ts            # CLI entry point
```

## Data flow

### Ingest

```
User: kib ingest <source>
  |
  v
detectSourceType(uri)          # web, pdf, youtube, github, image, file
  |
  v
getExtractor(type).extract()   # Fetch + parse content
  |
  v
hash(content)                  # xxhash64 for dedup
  |
  v
[withLock]                     # Acquire vault lock
  |
  v
checkDuplicate(manifest)       # Skip if same hash exists
  |
  v
normalizeSource()              # Add YAML frontmatter
  |
  v
writeRaw(raw/{category}/)     # Atomic write (tmp + rename)
  |
  v
updateManifest()               # Add source entry + save
```

### Compile

```
User: kib compile
  |
  v
[withLock + backup]            # Lock vault, backup manifest if --force
  |
  v
findPendingSources()           # Sources where lastCompiled < ingestedAt
  |
  v
For each source (possibly parallel):
  |
  v
  readRaw(source) + truncateSource()   # Load + fit within token budget
  |
  v
  selectContext(existingArticles)       # Smart context selection for large vaults
  |
  v
  compileWithRetry(provider)           # LLM call with cache + retry
  |
  v
  parseCompileOutput()                 # Extract file operations from LLM response
  |
  v
  applyOperations()                    # Write/update/delete wiki articles
  |
  v
enrichCrossReferences()        # Second LLM pass to add cross-links
  |
  v
buildLinkGraph()               # Compute backlinks + forward links
  |
  v
generateIndexMd()              # Rebuild INDEX.md
generateGraphMd()              # Rebuild GRAPH.md
  |
  v
computeStats() + saveManifest()
```

### Query (RAG)

```
User: kib query "question"
  |
  v
SearchIndex.search(question)   # BM25 (or hybrid) to find relevant articles
  |
  v
Load top-K article contents    # Read full markdown
  |
  v
provider.complete({            # Send to LLM with instructions to cite sources
  system: querySystemPrompt,
  messages: [context + question]
})
  |
  v
Return cited answer
```

## Key design decisions

### Atomic writes

All file writes use a tmp-then-rename pattern (`write(path.tmp)` then `rename(path.tmp, path)`). This prevents partial writes from corrupting files on crash.

### Lockfile

A process-level lock (`.kb/vault.lock`) prevents concurrent writes from multiple kib processes. The lock is re-entrant within a single process (e.g., `lint --fix` can call `compileVault` without deadlocking). Stale locks from dead processes are auto-detected and stolen.

### Manifest as source of truth

The manifest tracks what's been ingested and compiled. The compiler checks `lastCompiled < ingestedAt` to find pending sources. This makes incremental compilation reliable — only new or changed sources get recompiled.

### Content-addressed dedup

Source content is hashed with xxhash64. Re-ingesting the same content (even from a different URL) is detected and skipped.

### Lazy imports

The CLI lazy-imports core modules to keep `kib --help` under 100ms. Heavy dependencies (LLM SDKs, pdf-parse, cheerio) are only loaded when needed.

### Schema validation

All data structures are defined as Zod schemas and validated on load. The manifest, config, article frontmatter, LLM responses, and skill packages all have strict schemas.

## Tech stack

| Component | Technology |
|-----------|------------|
| Runtime | [Bun](https://bun.sh) |
| Language | TypeScript (strict, ESM-only) |
| CLI | [Commander](https://github.com/tj/commander.js) |
| Validation | [Zod](https://zod.dev) |
| Linting | [Biome](https://biomejs.dev) |
| Search | Custom BM25 with English stemming |
| HTML parsing | [Cheerio](https://cheerio.js.org) + [Turndown](https://github.com/mixmark-io/turndown) |
| Hashing | [xxhash-wasm](https://github.com/nicolo-ribaudo/xxhash-wasm) |
| Config | TOML via [@iarna/toml](https://github.com/iarna/iarna-toml) |
| YAML | [yaml](https://eemeli.org/yaml/) |
| PDF | [pdf-parse](https://gitlab.com/nickvdh/pdf-parse) |

## Contributing

See [CONTRIBUTING.md](../CONTRIBUTING.md) for development setup, commit conventions, and PR guidelines.
