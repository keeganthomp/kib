export const dynamic = "force-static";

const content = `# kib — The Headless Knowledge Compiler

> CLI-first, LLM-powered tool that turns raw sources into a structured, queryable markdown wiki.

## What is kib?

kib is an open-source CLI tool that ingests raw source material (URLs, PDFs, YouTube transcripts, GitHub repos, images, local files), compiles it into a structured markdown wiki using LLMs, and lets you search and query your knowledge base from the terminal.

## Install

Homebrew (macOS & Linux):
brew tap keeganthomp/kib && brew install kib

npm:
npm i -g @kibhq/cli

## Quick Start

kib init
kib ingest <source>
kib compile
kib query "your question"
kib chat

## Key Features

- Ingest: URLs, PDFs, YouTube, GitHub repos, images, local files
- Compile: LLM structures sources into connected markdown articles with frontmatter, tags, and wikilinks
- Search: BM25 full-text search with English stemming, sub-50ms
- Query: RAG over your wiki with cited answers
- Chat: Interactive REPL with conversation history
- MCP Server: 8 tools (kib_status, kib_list, kib_read, kib_search, kib_query, kib_ingest, kib_compile, kib_lint) and 2 resources (wiki://index, wiki://graph)
- Lint: Health checks for orphan articles, broken wikilinks, stale sources
- Skills: Built-in and custom .ts skills with full vault/LLM/search access
- Export: Markdown or HTML static site output
- Chrome Extension: One-click webpage saving (coming soon to Chrome Web Store)

## MCP Server Integration

kib includes an MCP server that gives AI assistants direct access to your knowledge base. Supported clients: Claude Code, Claude Desktop, Cursor.

Configure automatically:
kib init  # auto-configures MCP for detected clients
kib mcp   # configure MCP without re-initializing

Manual configuration:
{
  "mcpServers": {
    "kib": {
      "command": "kib",
      "args": ["serve"],
      "cwd": "/path/to/your/vault"
    }
  }
}

## LLM Providers

Anthropic (ANTHROPIC_API_KEY), OpenAI (OPENAI_API_KEY), Ollama (local, auto-detected).

## Architecture

Vault is plain files on disk. No database. No lock-in. Version with git.

Vault structure:
- .kb/ — manifest, config, cache, skills
- raw/ — ingested source material (never modified)
- wiki/ — compiled articles, INDEX.md, GRAPH.md
- inbox/ — drop zone for auto-ingest via kib watch

## Links

- GitHub: https://github.com/keeganthomp/kib
- npm: https://www.npmjs.com/package/@kibhq/cli
- Website: https://kib.dev
- License: MIT
`;

export function GET() {
	return new Response(content, {
		headers: { "Content-Type": "text/plain; charset=utf-8" },
	});
}
