# CLAUDE.md

## Project

kib — The Headless Knowledge Compiler. Bun + TypeScript monorepo.

## Packages

- `packages/core` → `@kibhq/core` on npm
- `packages/cli` → `@kibhq/cli` on npm
- npm org: `kibhq`
- GitHub: `keeganthomp/kib`

## Release Pipeline

Release Please manages versioning. **Critical rules:**

1. **All three version numbers must stay in sync:**
   - `.release-please-manifest.json` (`.` key)
   - `packages/core/package.json` (`version` field)
   - `packages/cli/package.json` (`version` field)
   - `package.json` root (`version` field)

2. **`release-please-config.json` has `extra-files`** that tells Release Please to bump `packages/core/package.json` and `packages/cli/package.json` alongside the root. Never remove these.

3. **npm won't let you republish the same version.** If versions are out of sync and publish fails, you must bump to a new version — you cannot fix it by re-publishing the same number.

4. **`workspace:*` must not appear in published packages.** The CLI depends on core using `^x.y.z` (not `workspace:*`) because npm doesn't understand the workspace protocol. Bun resolves `^x.y.z` to the local workspace copy during development.

## Git Workflow

- Never push directly to `main` — always branch + PR
- Conventional Commits: `feat:`, `fix:`, `chore:`, `ci:`, `docs:`
- Release Please auto-creates release PRs from conventional commits
- Merging a release PR triggers: npm publish + binary builds

## Commands

```bash
bun test                              # run tests (412+)
bun run check                         # biome lint + format
bun run packages/cli/bin/kib.ts       # run CLI locally
```

## Architecture

- `@kibhq/core`: vault ops, LLM providers, ingest extractors, compile engine, BM25 search, RAG query, lint, skills
- `@kibhq/cli`: commander CLI, terminal UI (spinners, prompts), command handlers
- CLI lazy-imports from core to keep cold starts fast
- LLM providers: Anthropic, OpenAI, Ollama (auto-detected from env vars)
- Credentials stored at `~/.config/kib/credentials`, loaded on CLI startup
