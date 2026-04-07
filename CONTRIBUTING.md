# Contributing to kib

Thanks for your interest in contributing to kib!

## Setup

```bash
# Clone the repo
git clone https://github.com/your-org/kib.git
cd kib

# Install dependencies (requires Bun)
bun install

# Run tests
bun test

# Lint & format
bun run check
bun run check:fix
```

## Development

kib is a Bun monorepo with two packages:

- `packages/core` — shared types, schemas, vault operations, providers
- `packages/cli` — the CLI binary

### Commit Messages

We use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat(core): add PDF extractor`
- `fix(cli): handle missing config gracefully`
- `docs: update README with new commands`
- `test(core): add vault filesystem tests`

### Pull Requests

1. Fork the repo and create your branch from `main`
2. Write tests for new functionality
3. Ensure `bun test` and `bun run check` pass
4. Keep PRs focused — one feature or fix per PR

## Architecture

See the [README](README.md#architecture) for details on the codebase structure.

## Code Style

- TypeScript strict mode, ESM-only
- Formatting and linting handled by Biome — run `bun run check:fix`
- Lazy imports for all heavy dependencies (keep cold start fast)
- Atomic file writes (write to tmp, then rename)

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
