# CLAUDE.md

## Project

kib — The Headless Knowledge Compiler. Bun + TypeScript monorepo.

## Packages

- `packages/core` → `@kibhq/core` on npm
- `packages/cli` → `@kibhq/cli` on npm
- npm org: `kibhq`
- GitHub: `keeganthomp/kib`

## Release Pipeline

Manual workflow dispatch via GitHub Actions (`release.yml`). **Critical rules:**

1. **All three version numbers must stay in sync:**
   - `package.json` root (`version` field)
   - `packages/core/package.json` (`version` field)
   - `packages/cli/package.json` (`version` field)
   - The release workflow verifies this and fails if they're out of sync.

2. **Bump versions before releasing.** Update all three `package.json` files, commit, merge to main, then trigger the release workflow.

3. **npm won't let you republish the same version.** If publish fails, you must bump to a new version — you cannot fix it by re-publishing the same number.

4. **`workspace:*` must not appear in published packages.** The CLI depends on core using `^x.y.z` (not `workspace:*`) because npm doesn't understand the workspace protocol. Bun resolves `^x.y.z` to the local workspace copy during development.

## CI / Git Workflow

- Never push directly to `main` — always branch + PR
- Conventional Commits: `feat:`, `fix:`, `chore:`, `ci:`, `docs:`
- `ci.yml`: runs lint + tests on branch pushes and PRs to main
- `release.yml`: manual workflow dispatch from main — creates tag, GitHub release, publishes to npm, builds binaries

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
