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
- `ci.yml`: runs lint + tests on PRs to main
- `release.yml`: manual workflow dispatch from main — creates tag, GitHub release, publishes to npm, builds binaries

## Commands

```bash
bun test                              # run tests (402+)
bun run check                         # biome lint + format
bun run packages/cli/bin/kib.ts       # run CLI locally
```

## Architecture

- `@kibhq/core`: vault ops, LLM providers, ingest extractors, compile engine, BM25 search, RAG query, lint, skills
- `@kibhq/cli`: commander CLI, terminal UI (spinners, prompts), command handlers
- CLI lazy-imports from core to keep cold starts fast
- LLM providers: Anthropic, OpenAI, Ollama (auto-detected from env vars)
- Credentials stored at `~/.config/kib/credentials`, loaded on CLI startup

## Watch Daemon

- `kib watch` — foreground watcher with live logs
- `kib watch --daemon` — background daemon (PID in `.kb/watch.pid`)
- `kib watch --stop` / `--status` — manage daemon
- `kib watch --install` / `--uninstall` — system service (launchd/systemd)
- Monitors `inbox/` dir, configured `[[watch.folders]]`, HTTP server on port 4747
- Ingest queue with retry (3x), failed items in `.kb/queue/failed/`
- Auto-compile: after 5 sources or 30 min idle (configurable in `[watch]` config)
- Logs: `.kb/logs/watch.log` with rotation
- Core daemon modules: `packages/core/src/daemon/` (pid, queue, scheduler, folder-watcher, log, service)
- CLI command: `packages/cli/src/commands/watch.ts`

## Skill Ecosystem (v0.8.0)

### Built-in Skills (10)
`summarize`, `flashcards`, `connections`, `find-contradictions`, `weekly-digest`, `export-slides`, `timeline`, `compare`, `explain`, `suggest-tags`

### Skill Management CLI
```bash
kib skill list                            # list all available skills
kib skill run <name>                      # run a skill
kib skill install github:user/repo        # install from GitHub
kib skill install <npm-package>           # install from npm
kib skill uninstall <name>                # remove an installed skill
kib skill create <name>                   # scaffold a new skill
kib skill publish <name>                  # validate for publishing
kib skill installed                       # list installed skills
```

### Skill Architecture
- Skills defined as `SkillDefinition` objects with `run(ctx: SkillContext)` method
- `SkillContext` provides: vault read/write, LLM (complete/stream), search, logger, args, `invoke()` for skill-to-skill calls
- Skills live in: `packages/core/src/skills/builtins.ts` (built-in) or `.kb/skills/` (installed)
- Directory-based skills use `skill.json` for metadata + entry point
- Dependency resolution with circular dependency detection
- Hooks system: skills auto-run after compile/ingest/lint via `hooks` field or `[skills.hooks]` in config.toml
- Config: `[skills]` section in `config.toml` for hooks and per-skill settings
