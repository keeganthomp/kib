# Skill Authoring Guide

Skills are plugins that process your knowledge base. They have full access to the vault, LLM, and search engine.

## Built-in skills

kib ships with 10 built-in skills:

| Skill | Description |
|-------|-------------|
| `summarize` | Summarize wiki articles |
| `flashcards` | Generate study flashcards |
| `connections` | Find non-obvious connections between articles |
| `find-contradictions` | Detect contradictory claims across articles |
| `weekly-digest` | Generate a weekly summary of new additions |
| `export-slides` | Generate a Marp slide deck |
| `timeline` | Build a chronological timeline |
| `compare` | Compare two articles/topics side by side |
| `explain` | Explain a topic at a specified reading level |
| `suggest-tags` | Auto-tag articles based on content analysis |

## Create a skill

```bash
kib skill create my-skill
```

This scaffolds `.kb/skills/my-skill/` with:

```
.kb/skills/my-skill/
  skill.json    # Package metadata
  index.ts      # Skill implementation
```

### skill.json

```json
{
  "name": "my-skill",
  "version": "1.0.0",
  "description": "Analyzes vault articles for key themes",
  "author": "Your Name",
  "main": "index.ts",
  "dependencies": []
}
```

### index.ts

```typescript
import type { SkillContext } from "@kibhq/core";

export default {
  name: "my-skill",
  version: "1.0.0",
  description: "Analyzes vault articles for key themes",
  author: "Your Name",

  input: "wiki" as const,
  output: "report" as const,

  llm: {
    required: true,
    model: "default" as const,
    systemPrompt: "Analyze the following articles and identify recurring themes.",
    maxTokens: 4096,
    temperature: 0,
  },

  async run(ctx: SkillContext) {
    const articles = await ctx.vault.readWiki();

    if (articles.length === 0) {
      ctx.logger.warn("No articles to analyze.");
      return {};
    }

    const content = articles
      .map((a) => `# ${a.title}\n\n${a.content}`)
      .join("\n\n---\n\n");

    const result = await ctx.llm.complete({
      system: this.llm!.systemPrompt,
      messages: [{ role: "user", content }],
      maxTokens: this.llm!.maxTokens,
      temperature: this.llm!.temperature,
    });

    return { content: result.content };
  },
};
```

Run it:

```bash
kib skill run my-skill
```

## SkillDefinition interface

```typescript
interface SkillDefinition {
  name: string;
  version: string;
  description: string;
  author?: string;

  // What the skill reads
  input: "wiki" | "raw" | "vault" | "selection" | "index" | "none";

  // What the skill produces
  output: "articles" | "report" | "mutations" | "stdout" | "none";

  // Other skills this skill depends on (resolved automatically)
  dependencies?: string[];

  // Auto-run after these events
  hooks?: ("post-compile" | "post-ingest" | "post-lint")[];

  // Target wiki category for output (e.g. "outputs")
  category?: string;

  // LLM configuration
  llm?: {
    required: boolean;
    model: "default" | "fast";    // "fast" uses the fast_model from config
    systemPrompt: string;
    maxTokens?: number;
    temperature?: number;
  };

  run(ctx: SkillContext): Promise<{ content?: string }>;
}
```

### Input types

| Type | Description |
|------|-------------|
| `wiki` | Reads compiled wiki articles |
| `raw` | Reads raw ingested sources |
| `vault` | Full vault access (manifest, config, files) |
| `selection` | Operates on user-selected content |
| `index` | Reads the INDEX.md catalog |
| `none` | No specific input needed |

### Output types

| Type | Description |
|------|-------------|
| `articles` | Creates/modifies wiki articles |
| `report` | Returns a report string |
| `mutations` | Modifies existing vault content |
| `stdout` | Prints output to terminal |
| `none` | No output |

## SkillContext API

Every skill receives a `SkillContext` with these capabilities:

### ctx.vault

```typescript
ctx.vault.readIndex()    // Read INDEX.md
ctx.vault.readGraph()    // Read GRAPH.md
ctx.vault.readWiki()     // All wiki articles: { title, slug, content }[]
ctx.vault.readRaw()      // All raw sources: { path, content }[]
ctx.vault.readFile(path) // Read any file by path
ctx.vault.writeFile(path, content)  // Write a file
ctx.vault.listFiles(glob)           // List files matching a glob
ctx.vault.manifest       // Current manifest object
ctx.vault.config         // Current vault config
```

### ctx.llm

```typescript
// Non-streaming completion
const result = await ctx.llm.complete({
  system: "You are a helpful assistant.",
  messages: [{ role: "user", content: "Summarize this." }],
  maxTokens: 4096,
  temperature: 0,
});
// result.content, result.usage.inputTokens, result.usage.outputTokens

// Streaming completion
for await (const chunk of ctx.llm.stream({ system, messages })) {
  if (chunk.type === "text") process.stdout.write(chunk.text!);
}
```

### ctx.search

```typescript
const results = await ctx.search.query("attention mechanism", { limit: 5 });
// results: { path, score, snippet, title? }[]
```

### ctx.logger

```typescript
ctx.logger.info("Processing 42 articles...");
ctx.logger.warn("Skipping empty article");
ctx.logger.error("Failed to parse frontmatter");
```

### ctx.invoke

Call another skill from within yours:

```typescript
const result = await ctx.invoke("summarize", { maxLength: 500 });
// result.content contains the summarize skill's output
```

Circular dependency detection prevents infinite loops. Max invocation depth is 5.

### ctx.args

Access CLI arguments passed to the skill:

```typescript
const maxItems = (ctx.args.maxItems as number) ?? 10;
```

## Hooks

Skills can auto-run after compile, ingest, or lint operations.

### In the skill definition

```typescript
export default {
  name: "suggest-tags",
  hooks: ["post-compile"],
  // ...runs automatically after every compile
};
```

### In config.toml

```toml
[skills.hooks]
post-compile = ["suggest-tags", "weekly-digest"]
post-ingest = ["suggest-tags"]
post-lint = []
```

Config hooks and skill-defined hooks are merged. Both sources are checked.

## Skill configuration

Pass per-skill config via `config.toml`:

```toml
[skills.config.my-skill]
max_items = 20
output_format = "markdown"
```

Access in your skill via `ctx.vault.config.skills.config["my-skill"]`.

## Dependencies

Skills can depend on other skills. Dependencies are resolved topologically and executed before your skill runs.

```typescript
export default {
  name: "advanced-analysis",
  dependencies: ["summarize", "suggest-tags"],
  // summarize and suggest-tags run first, then this skill
  async run(ctx) { /* ... */ },
};
```

Circular dependencies are detected and throw an error.

## Install and publish

### Install from GitHub

```bash
kib skill install github:username/my-kib-skill
kib skill install github:username/my-kib-skill#branch
```

### Install from npm

```bash
kib skill install @scope/my-kib-skill
```

### List installed skills

```bash
kib skill installed
```

### Uninstall

```bash
kib skill uninstall my-skill
```

### Publish

Validate your skill for publishing:

```bash
kib skill publish my-skill
```

This checks that `skill.json` is valid, the entry point exists, and the skill definition passes schema validation. Then publish to npm:

```bash
cd .kb/skills/my-skill
npm publish
```

## Example: a simple skill

A skill that counts articles per category:

```typescript
import type { SkillContext } from "@kibhq/core";

export default {
  name: "category-stats",
  version: "1.0.0",
  description: "Count articles per category",

  input: "vault" as const,
  output: "stdout" as const,

  async run(ctx: SkillContext) {
    const counts: Record<string, number> = {};

    for (const [, article] of Object.entries(ctx.vault.manifest.articles)) {
      counts[article.category] = (counts[article.category] ?? 0) + 1;
    }

    const lines = Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .map(([cat, count]) => `${cat}: ${count} articles`);

    const content = `# Category Stats\n\n${lines.join("\n")}`;
    ctx.logger.info(content);
    return { content };
  },
};
```

No LLM needed — this skill just reads the manifest. Set `llm` only when you actually need it.
