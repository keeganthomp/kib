# Vault Format Specification

A kib vault is a directory containing raw source material, compiled wiki articles, and internal state. Everything is plain files — view in any editor, version with git, no lock-in.

## Directory Structure

```
my-vault/
├── .kb/                      # Internal state (managed by kib)
│   ├── manifest.json         # Source tracking, compile state, stats
│   ├── config.toml           # Vault configuration
│   ├── vault.lock            # Process lock (prevents concurrent writes)
│   ├── cache/                # LLM response cache, search index
│   │   ├── responses/        # Cached LLM responses (keyed by hash)
│   │   ├── search.idx        # BM25 search index
│   │   └── vectors.idx       # Vector embeddings (if hybrid search enabled)
│   ├── backups/              # Manifest backups (auto-created before destructive ops)
│   ├── skills/               # Installed custom skills
│   └── logs/                 # Operation logs
├── raw/                      # Ingested source material (never modified by compile)
│   ├── articles/             # Web pages, text content
│   ├── papers/               # PDFs, academic papers
│   ├── transcripts/          # YouTube/video transcripts
│   ├── repos/                # GitHub repository summaries
│   └── images/               # Image descriptions (extracted via vision model)
├── wiki/                     # Compiled knowledge base (written by compile)
│   ├── INDEX.md              # Master index: every article + summary + tags
│   ├── GRAPH.md              # Article relationship adjacency list
│   ├── LOG.md                # Human-readable operation log
│   ├── images/               # Image assets (originals from ingested images)
│   ├── concepts/             # Core concept articles
│   ├── topics/               # Topic overviews and deep-dives
│   ├── references/           # People, papers, organizations
│   └── outputs/              # Query results filed as articles, skill outputs
├── inbox/                    # Drop zone for `kib watch` (auto-ingested)
└── CLAUDE.md                 # Auto-generated for AI agent discovery
```

## manifest.json

The manifest is the source of truth for vault state. Schema version: `"1"`.

```json
{
  "version": "1",
  "vault": {
    "name": "my-vault",
    "created": "2024-01-15T10:00:00.000Z",
    "lastCompiled": "2024-01-15T12:00:00.000Z",
    "provider": "anthropic",
    "model": "claude-sonnet-4-6-20250514"
  },
  "sources": {
    "src_a1b2c3d4e5f6": {
      "hash": "xxhash64-content-hash",
      "ingestedAt": "2024-01-15T10:05:00.000Z",
      "lastCompiled": "2024-01-15T12:00:00.000Z",
      "sourceType": "web",
      "originalUrl": "https://example.com/article",
      "producedArticles": ["attention-mechanism", "transformer-architecture"],
      "metadata": {
        "title": "Attention Is All You Need",
        "author": "Vaswani et al.",
        "date": "2017-06-12",
        "wordCount": 8500
      }
    }
  },
  "articles": {
    "attention-mechanism": {
      "hash": "xxhash64-article-hash",
      "createdAt": "2024-01-15T12:00:00.000Z",
      "lastUpdated": "2024-01-15T12:00:00.000Z",
      "derivedFrom": ["src_a1b2c3d4e5f6"],
      "backlinks": ["transformer-architecture"],
      "forwardLinks": ["transformer-architecture", "self-attention"],
      "tags": ["deep-learning", "nlp", "attention"],
      "summary": "Core attention mechanism used in transformer models",
      "wordCount": 450,
      "category": "concept"
    }
  },
  "stats": {
    "totalSources": 1,
    "totalArticles": 1,
    "totalWords": 450,
    "lastLintAt": null
  }
}
```

### Source types

| Type | Category | Description |
|------|----------|-------------|
| `web` | `articles/` | Web pages extracted via readability |
| `pdf` | `papers/` | PDF documents |
| `youtube` | `transcripts/` | YouTube video transcripts |
| `github` | `repos/` | GitHub repository README + structure |
| `image` | `images/` | Image descriptions via vision model |
| `file` | `articles/` | Local markdown/text files |

### Article categories

| Category | Directory | Description |
|----------|-----------|-------------|
| `concept` | `wiki/concepts/` | Core concepts and definitions |
| `topic` | `wiki/topics/` | Topic overviews and deep-dives |
| `reference` | `wiki/references/` | People, papers, organizations |
| `output` | `wiki/outputs/` | Query results, skill outputs |

## config.toml

Vault configuration lives at `.kb/config.toml`:

```toml
[provider]
default = "anthropic"
model = "claude-sonnet-4-6-20250514"
fast_model = "claude-haiku-4-5-20251001"

[compile]
auto_index = true
auto_graph = true
max_sources_per_pass = 10
categories = ["concepts", "topics", "references", "outputs"]
enrich_cross_refs = true
max_enrich_articles = 10
context_window = 200000
max_source_tokens = 32000
parallel = false
max_parallel = 3
# model = "gpt-4o"            # Override model for compile only

[ingest]
download_images = true
max_file_size_mb = 50
default_category = "articles"

[watch]
enabled = false
inbox_path = "inbox"
auto_compile = true
poll_interval_ms = 2000

[search]
engine = "builtin"             # "builtin" (BM25), "vector", or "hybrid"
max_results = 20

[query]
file_output = true
auto_file = true
auto_file_threshold = 3
# model = "gpt-4o"            # Override model for query only

[cache]
enabled = true
ttl_hours = 168                # 7 days
max_size_mb = 500

[skills]
[skills.hooks]
post-compile = []
post-ingest = []
post-lint = []

[skills.config]
# Per-skill configuration
# [skills.config.my-skill]
# key = "value"
```

## Raw source files

Raw sources are markdown files with YAML frontmatter, stored in `raw/{category}/`:

```markdown
---
title: "Attention Is All You Need"
source_type: web
original_url: "https://arxiv.org/abs/1706.03762"
ingested_at: "2024-01-15T10:05:00.000Z"
---

# Attention Is All You Need

The dominant sequence transduction models are based on complex
recurrent or convolutional neural networks...
```

Raw files are **never modified by compile**. They're the immutable source of truth.

## Wiki articles

Compiled articles have structured frontmatter:

```markdown
---
title: "Attention Mechanism"
slug: "attention-mechanism"
category: concept
tags: [deep-learning, nlp, attention, transformers]
sources: [src_a1b2c3d4e5f6]
created: "2024-01-15T12:00:00.000Z"
updated: "2024-01-15T12:00:00.000Z"
summary: "Core attention mechanism used in transformer models"
---

# Attention Mechanism

The attention mechanism allows models to focus on relevant parts of
the input sequence when producing each element of the output.

## How It Works

...

## See Also

- [[transformer-architecture]]
- [[self-attention]]
```

### Wikilinks

Articles reference each other using `[[slug]]` syntax. The compiler maintains these links and tracks them in `GRAPH.md` and in the manifest's `backlinks`/`forwardLinks` arrays.

## INDEX.md

Auto-generated table of contents with every article, its category, tags, and summary:

```markdown
# Knowledge Base Index

## Concepts (3)
- **[Attention Mechanism](concepts/attention-mechanism.md)** — Core attention mechanism used in transformer models `#deep-learning` `#nlp`
- **[Self-Attention](concepts/self-attention.md)** — ...

## Topics (2)
- **[Transformer Architecture](topics/transformer-architecture.md)** — ...
```

## GRAPH.md

Auto-generated adjacency list showing article relationships:

```markdown
# Knowledge Graph

attention-mechanism → transformer-architecture, self-attention
transformer-architecture → attention-mechanism, positional-encoding
self-attention → attention-mechanism
```

## vault.lock

Created when a process acquires exclusive access for writes (compile, ingest, lint --fix). Contains the owning process PID, timestamp, and operation name. Automatically cleaned up on release; stale locks from dead processes are detected and stolen.

## Backups

Before destructive operations (`compile --force`), the manifest is copied to `.kb/backups/manifest-{timestamp}.json`. The 5 most recent backups are kept.

## Integrity

On every manifest load, the schema is validated via Zod. The `validateManifestIntegrity()` function checks that:
- All source files referenced in manifest exist on disk
- All article files referenced in manifest exist on disk
- Cross-references between sources and articles are consistent
- Stats (totalSources, totalArticles, totalWords) match actual counts
