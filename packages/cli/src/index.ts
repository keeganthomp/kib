import { Command } from "commander";

const program = new Command()
	.name("kib")
	.description("The Headless Knowledge Compiler")
	.version("0.1.0");

program
	.command("init [dir]")
	.description("Create a new vault (defaults to ~/.kib)")
	.option("--name <name>", "vault name (default: directory name)")
	.option("--provider <provider>", "force LLM provider instead of auto-detect")
	.action(async (dir, opts) => {
		const { init } = await import("./commands/init.js");
		await init(dir, opts);
	});

program
	.command("config [key] [value]")
	.description("Get or set configuration")
	.option("--list", "list all configuration")
	.action(async (key, value, opts) => {
		const { config } = await import("./commands/config.js");
		await config(key, value, opts);
	});

program
	.command("status")
	.description("Vault health dashboard")
	.action(async () => {
		const { status } = await import("./commands/status.js");
		await status();
	});

program
	.command("ingest <sources...>")
	.description("Ingest sources into raw/")
	.option("--category <cat>", "override raw/ subdirectory")
	.option("--tags <tags>", "comma-separated tags")
	.option("--batch", "read sources from stdin (one per line)")
	.action(async (sources, opts) => {
		const { ingest } = await import("./commands/ingest.js");
		await ingest(sources, opts);
	});

program
	.command("compile")
	.description("Compile raw sources into wiki articles")
	.option("--force", "recompile all sources")
	.option("--dry-run", "show what would happen without doing it")
	.option("--source <path>", "compile only a specific source")
	.option("--max <n>", "limit sources per pass", Number.parseInt)
	.action(async (opts) => {
		const { compile } = await import("./commands/compile.js");
		await compile(opts);
	});

program
	.command("search <term>")
	.description("Fast text search across the vault")
	.option("--wiki", "search only wiki/")
	.option("--raw", "search only raw/")
	.option("--limit <n>", "max results", Number.parseInt)
	.option("--json", "JSON output")
	.action(async (term, opts) => {
		const { search } = await import("./commands/search.js");
		await search(term, opts);
	});

program
	.command("query <question>")
	.description("Ask a question against the knowledge base")
	.option("--file", "auto-file to wiki/outputs/")
	.option("--no-file", "never file")
	.option("--sources", "show which articles were used")
	.option("--json", "JSON output")
	.action(async (question, opts) => {
		const { query } = await import("./commands/query.js");
		await query(question, opts);
	});

program
	.command("chat")
	.description("Interactive REPL with the knowledge base")
	.action(async () => {
		const { chat } = await import("./commands/chat.js");
		await chat();
	});

program
	.command("lint")
	.description("Run health checks on the wiki")
	.option("--fix", "auto-fix all issues")
	.option("--check <type>", "run specific check")
	.option("--json", "JSON output")
	.action(async (opts) => {
		const { lint } = await import("./commands/lint.js");
		await lint(opts);
	});

program
	.command("skill <subcommand> [name]")
	.description("Manage skills (install, list, run, create)")
	.action(async (subcommand, name, opts) => {
		const { skill } = await import("./commands/skill.js");
		await skill(subcommand, name, opts);
	});

program
	.command("watch")
	.description("Watch inbox/ and auto-ingest")
	.action(async () => {
		const { watch } = await import("./commands/watch.js");
		await watch();
	});

program
	.command("serve")
	.description("Start the MCP server over stdio")
	.option("--mcp", "(accepted for backwards compat, no-op)")
	.action(async () => {
		const { serve } = await import("./commands/serve.js");
		await serve();
	});

program
	.command("mcp [subcommand]")
	.description("Configure MCP in AI clients (default: setup)")
	.action(async (subcommand) => {
		const { mcp } = await import("./commands/mcp.js");
		await mcp(subcommand);
	});

program
	.command("export")
	.description("Export wiki to other formats")
	.option("--format <type>", "output format: markdown, html, pdf", "markdown")
	.option("--output <path>", "output directory")
	.action(async (opts) => {
		const { exportVault } = await import("./commands/export.js");
		await exportVault(opts);
	});

export function main() {
	program.parse();
}
