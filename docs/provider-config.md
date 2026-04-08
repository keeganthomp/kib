# LLM Provider Configuration

kib supports three LLM providers: Anthropic (Claude), OpenAI (GPT), and Ollama (local models).

## Quick setup

On first run, kib walks you through provider setup interactively. Or set an environment variable:

```bash
export ANTHROPIC_API_KEY=sk-ant-...   # Anthropic Claude
export OPENAI_API_KEY=sk-...          # OpenAI GPT
# Ollama: just have it running on localhost:11434
```

Credentials are saved to `~/.config/kib/credentials` so you only need to set them once.

## Provider detection

kib auto-detects your provider in this order:

1. `ANTHROPIC_API_KEY` set -> Anthropic
2. `OPENAI_API_KEY` set -> OpenAI
3. Ollama running on `localhost:11434` -> Ollama

Override via config:

```bash
kib config provider.default openai
kib config provider.model gpt-4o
```

## Provider comparison

| Feature | Anthropic | OpenAI | Ollama |
|---------|-----------|--------|--------|
| Default model | claude-sonnet-4-6 | gpt-4o | llama3 |
| Fast model | claude-haiku-4-5-20251001 | gpt-4o | llama3 |
| Vision (image ingest) | Yes | Yes | No |
| Embeddings (vector search) | No | Yes (text-embedding-3-small) | Yes (nomic-embed-text) |
| Streaming | Yes | Yes | Yes |
| API key required | Yes | Yes | No |
| Runs locally | No | No | Yes |

## Credentials

### Environment variables

```bash
export ANTHROPIC_API_KEY=sk-ant-api03-...
export OPENAI_API_KEY=sk-proj-...
```

### Credentials file

Stored at `~/.config/kib/credentials`:

```
ANTHROPIC_API_KEY=sk-ant-api03-...
OPENAI_API_KEY=sk-proj-...
```

Lines starting with `#` are treated as comments. Environment variables take precedence over the credentials file.

### Interactive setup

Run `kib init` and follow the prompts to select a provider and enter your API key.

## Model configuration

### Default model

Used for heavy operations (compile, query, chat):

```bash
kib config provider.model claude-sonnet-4-6
```

### Fast model

Used for lightweight operations (skills with `model: "fast"`):

```bash
kib config provider.fast_model claude-haiku-4-5-20251001
```

### Per-operation overrides

Override the model for specific operations:

```bash
# Use a different model for compilation
kib config compile.model gpt-4o

# Use a different model for queries
kib config query.model claude-sonnet-4-6
```

These override `provider.model` for that specific operation only.

### config.toml

All provider settings live in `.kb/config.toml`:

```toml
[provider]
default = "anthropic"
model = "claude-sonnet-4-6"
fast_model = "claude-haiku-4-5-20251001"

[compile]
# model = "gpt-4o"          # Optional override for compile

[query]
# model = "gpt-4o"          # Optional override for query
```

## Token budgets

The compiler manages token usage automatically:

| Setting | Default | Description |
|---------|---------|-------------|
| `compile.context_window` | 200,000 | Max tokens for the model's context |
| `compile.max_source_tokens` | 32,000 | Sources larger than this are auto-summarized |
| `compile.max_tokens_per_pass` | (unlimited) | Optional cap on total tokens per compile |
| `compile.max_sources_per_pass` | 10 | Max sources compiled per `kib compile` |
| `compile.parallel` | false | Compile independent sources concurrently |
| `compile.max_parallel` | 3 | Max concurrent source compilations |

Configure via CLI:

```bash
kib config compile.context_window 128000
kib config compile.max_source_tokens 16000
kib config compile.parallel true
```

## Search engine

kib supports three search modes:

```bash
# BM25 only (default, fast, no embeddings needed)
kib config search.engine builtin

# Vector only (requires embedding provider)
kib config search.engine vector

# Hybrid: BM25 + vector with Reciprocal Rank Fusion
kib config search.engine hybrid
```

Vector and hybrid search require a provider with embedding support (OpenAI or Ollama). Embeddings are stored in `.kb/cache/vectors.idx` and rebuilt on compile.

## Ollama setup

1. Install Ollama: https://ollama.ai
2. Pull a model: `ollama pull llama3`
3. Start the server: `ollama serve`
4. kib auto-detects it on `localhost:11434`

For embeddings (vector/hybrid search), Ollama uses `nomic-embed-text`:

```bash
ollama pull nomic-embed-text
```

## Troubleshooting

**"No LLM provider found"** — Set `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`, or start Ollama.

**"Provider error: invalid API key"** — Check your key in `~/.config/kib/credentials` or your environment.

**Vision not working** — Only Anthropic and OpenAI support vision. Ollama cannot ingest images.

**Vector search not working** — Only OpenAI and Ollama support embeddings. Switch to `search.engine = "builtin"` for Anthropic-only setups.

**Token limit exceeded** — Lower `compile.max_source_tokens` or `compile.context_window` to match your model's limits.
