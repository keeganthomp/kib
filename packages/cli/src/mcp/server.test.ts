import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initVault, writeRaw, writeWiki } from "@kibhq/core";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "./server.js";

// ─── Helpers ───────────────────────────────────────────────────

let tempDir: string;

afterEach(async () => {
	if (tempDir) await rm(tempDir, { recursive: true, force: true });
});

async function makeTempVault() {
	tempDir = await mkdtemp(join(tmpdir(), "kib-mcp-test-"));
	await initVault(tempDir, { name: "mcp-test" });
	return tempDir;
}

function articleMd(title: string, content: string): string {
	return `---\ntitle: ${title}\nslug: ${title.toLowerCase().replace(/\s+/g, "-")}\n---\n\n# ${title}\n\n${content}`;
}

async function createClient(root: string) {
	const server = createMcpServer(root);
	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
	await server.connect(serverTransport);
	const client = new Client({ name: "test-client", version: "0.1.0" });
	await client.connect(clientTransport);
	return client;
}

/** Extract the text string from the first content block of a callTool result. */
function textOf(result: Awaited<ReturnType<Client["callTool"]>>): string {
	const content = result.content as { type: string; text: string }[];
	const block = content[0];
	if (!block || block.type !== "text") throw new Error("Expected text content block");
	return block.text;
}

// ─── Tests ─────────────────────────────────────────────────────

describe("MCP server", () => {
	// ── kib_status ─────────────────────────────────────────────

	describe("kib_status", () => {
		test("returns vault status", async () => {
			const root = await makeTempVault();
			const client = await createClient(root);

			const result = await client.callTool({ name: "kib_status", arguments: {} });
			expect(result.isError).toBeFalsy();

			const data = JSON.parse(textOf(result));
			expect(data.name).toBe("mcp-test");
			expect(data.totalSources).toBe(0);
			expect(data.totalArticles).toBe(0);
		});
	});

	// ── kib_list ───────────────────────────────────────────────

	describe("kib_list", () => {
		test("lists wiki articles", async () => {
			const root = await makeTempVault();
			await writeWiki(
				root,
				"concepts/attention.md",
				articleMd("Attention", "Content about attention."),
			);
			await writeWiki(root, "topics/llms.md", articleMd("LLMs", "Content about LLMs."));
			const client = await createClient(root);

			const result = await client.callTool({ name: "kib_list", arguments: { scope: "wiki" } });
			expect(result.isError).toBeFalsy();

			const files: string[] = JSON.parse(textOf(result));
			expect(files.length).toBe(2);
			expect(files.some((f) => f.includes("concepts/attention.md"))).toBe(true);
			expect(files.some((f) => f.includes("topics/llms.md"))).toBe(true);
		});

		test("lists raw sources", async () => {
			const root = await makeTempVault();
			await writeRaw(root, "articles/test.md", "# Raw article");
			const client = await createClient(root);

			const result = await client.callTool({ name: "kib_list", arguments: { scope: "raw" } });
			expect(result.isError).toBeFalsy();

			const files: string[] = JSON.parse(textOf(result));
			expect(files.length).toBe(1);
			expect(files[0]).toContain("raw/");
		});

		test("returns empty array for empty vault", async () => {
			const root = await makeTempVault();
			const client = await createClient(root);

			const result = await client.callTool({ name: "kib_list", arguments: { scope: "wiki" } });
			const files = JSON.parse(textOf(result));
			expect(files).toEqual([]);
		});
	});

	// ── kib_read ───────────────────────────────────────────────

	describe("kib_read", () => {
		test("reads a wiki article", async () => {
			const root = await makeTempVault();
			const md = articleMd("Attention", "Attention is all you need.");
			await writeWiki(root, "concepts/attention.md", md);
			const client = await createClient(root);

			const result = await client.callTool({
				name: "kib_read",
				arguments: { path: "concepts/attention.md", scope: "wiki" },
			});
			expect(result.isError).toBeFalsy();

			const text = textOf(result);
			expect(text).toContain("Attention is all you need.");
		});

		test("reads a raw source", async () => {
			const root = await makeTempVault();
			await writeRaw(root, "articles/paper.md", "# Some paper content");
			const client = await createClient(root);

			const result = await client.callTool({
				name: "kib_read",
				arguments: { path: "articles/paper.md", scope: "raw" },
			});
			expect(result.isError).toBeFalsy();

			const text = textOf(result);
			expect(text).toContain("Some paper content");
		});

		test("returns error for missing file", async () => {
			const root = await makeTempVault();
			const client = await createClient(root);

			const result = await client.callTool({
				name: "kib_read",
				arguments: { path: "does-not-exist.md", scope: "wiki" },
			});
			expect(result.isError).toBe(true);

			const text = textOf(result);
			expect(text).toContain("not found");
		});
	});

	// ── kib_search ─────────────────────────────────────────────

	describe("kib_search", () => {
		test("finds relevant articles", async () => {
			const root = await makeTempVault();
			await writeWiki(
				root,
				"concepts/transformers.md",
				articleMd(
					"Transformer Architecture",
					"The transformer is a neural network architecture based on self-attention mechanisms.",
				),
			);
			await writeWiki(
				root,
				"topics/scaling.md",
				articleMd(
					"Scaling Laws",
					"Scaling laws describe power-law relationships between compute and performance.",
				),
			);
			const client = await createClient(root);

			const result = await client.callTool({
				name: "kib_search",
				arguments: { query: "transformer attention", limit: 5 },
			});
			expect(result.isError).toBeFalsy();

			const hits = JSON.parse(textOf(result));
			expect(hits.length).toBeGreaterThan(0);
			expect(hits[0].path).toContain("transformers.md");
		});

		test("returns empty for no matches", async () => {
			const root = await makeTempVault();
			await writeWiki(root, "concepts/test.md", articleMd("Test", "Some content here."));
			const client = await createClient(root);

			const result = await client.callTool({
				name: "kib_search",
				arguments: { query: "xyznonexistent", limit: 5 },
			});
			expect(result.isError).toBeFalsy();

			const hits = JSON.parse(textOf(result));
			expect(hits).toEqual([]);
		});
	});

	// ── kib_ingest ─────────────────────────────────────────────

	describe("kib_ingest", () => {
		test("ingests a local file", async () => {
			const root = await makeTempVault();
			const filePath = join(tempDir, "input.txt");
			await writeFile(filePath, "This is a test document about machine learning algorithms.");
			const client = await createClient(root);

			const result = await client.callTool({
				name: "kib_ingest",
				arguments: { source: filePath },
			});
			expect(result.isError).toBeFalsy();

			const data = JSON.parse(textOf(result));
			expect(data.path).toBeTruthy();
			expect(data.skipped).toBeFalsy();
		});
	});

	// ── kib_lint ───────────────────────────────────────────────

	describe("kib_lint", () => {
		test("runs lint on empty vault", async () => {
			const root = await makeTempVault();
			const client = await createClient(root);

			const result = await client.callTool({ name: "kib_lint", arguments: {} });
			expect(result.isError).toBeFalsy();

			const data = JSON.parse(textOf(result));
			expect(typeof data.errors).toBe("number");
			expect(typeof data.warnings).toBe("number");
		});

		test("detects broken links", async () => {
			const root = await makeTempVault();
			// Article with a broken wiki-link should trigger a lint diagnostic
			await writeWiki(
				root,
				"concepts/broken.md",
				articleMd("Broken Links", "See [[nonexistent-page]] for details."),
			);
			const client = await createClient(root);

			const result = await client.callTool({
				name: "kib_lint",
				arguments: { rule: "broken-link" },
			});
			expect(result.isError).toBeFalsy();

			const data = JSON.parse(textOf(result));
			const total = data.errors + data.warnings + data.infos;
			expect(total).toBeGreaterThan(0);
		});
	});

	// ── Resources ──────────────────────────────────────────────

	describe("resources", () => {
		test("wiki-index returns content", async () => {
			const root = await makeTempVault();
			const client = await createClient(root);

			const result = await client.readResource({ uri: "wiki://index" });
			expect(result.contents.length).toBe(1);
			const item = result.contents[0]!;
			expect(item.uri).toBe("wiki://index");
			// Empty vault has no index yet
			expect("text" in item && item.text).toContain("no index yet");
		});

		test("wiki-graph returns content", async () => {
			const root = await makeTempVault();
			const client = await createClient(root);

			const result = await client.readResource({ uri: "wiki://graph" });
			expect(result.contents.length).toBe(1);
			const item = result.contents[0]!;
			expect(item.uri).toBe("wiki://graph");
			expect("text" in item && item.text).toContain("no graph yet");
		});
	});

	// ── kib_search advanced ───────────────────────────────────

	describe("kib_search advanced", () => {
		function taggedArticle(title: string, tags: string[], content: string): string {
			return `---\ntitle: ${title}\nslug: ${title.toLowerCase().replace(/\s+/g, "-")}\ntags: [${tags.join(", ")}]\ndate: 2025-06-01\n---\n\n# ${title}\n\n${content}`;
		}

		test("filters by tag", async () => {
			const root = await makeTempVault();
			await writeWiki(
				root,
				"concepts/transformer.md",
				taggedArticle("Transformer", ["nlp", "deep-learning"], "A neural network."),
			);
			await writeWiki(
				root,
				"concepts/cnn.md",
				taggedArticle("CNN", ["vision"], "A convolutional neural network."),
			);
			const client = await createClient(root);

			const result = await client.callTool({
				name: "kib_search",
				arguments: { query: "neural network", tag: "nlp" },
			});
			expect(result.isError).toBeFalsy();

			const hits = JSON.parse(textOf(result));
			expect(hits.length).toBe(1);
			expect(hits[0].path).toContain("transformer.md");
		});

		test("filters by since date", async () => {
			const root = await makeTempVault();
			await writeWiki(
				root,
				"concepts/old.md",
				`---\ntitle: Old\nslug: old\ndate: 2023-01-01\n---\n\n# Old\n\nNeural network.`,
			);
			await writeWiki(
				root,
				"concepts/new.md",
				`---\ntitle: New\nslug: new\ndate: 2025-06-01\n---\n\n# New\n\nNeural network.`,
			);
			const client = await createClient(root);

			const result = await client.callTool({
				name: "kib_search",
				arguments: { query: "neural", since: "2025-01-01" },
			});
			expect(result.isError).toBeFalsy();

			const hits = JSON.parse(textOf(result));
			expect(hits.length).toBe(1);
			expect(hits[0].path).toContain("new.md");
		});

		test("scopes search to wiki only", async () => {
			const root = await makeTempVault();
			await writeWiki(root, "concepts/wiki.md", articleMd("Wiki Article", "Neural network."));
			await writeRaw(root, "articles/raw.md", "# Raw Article\n\nNeural network.");
			const client = await createClient(root);

			const result = await client.callTool({
				name: "kib_search",
				arguments: { query: "neural", scope: "wiki" },
			});
			expect(result.isError).toBeFalsy();

			const hits = JSON.parse(textOf(result));
			expect(hits.every((h: { path: string }) => h.path.includes("wiki/"))).toBe(true);
		});
	});

	// ── kib_config ─────────────────────────────────────────────

	describe("kib_config", () => {
		test("lists all config", async () => {
			const root = await makeTempVault();
			const client = await createClient(root);

			const result = await client.callTool({ name: "kib_config", arguments: {} });
			expect(result.isError).toBeFalsy();

			const data = JSON.parse(textOf(result));
			expect(data.provider).toBeDefined();
			expect(data.search).toBeDefined();
		});

		test("reads a specific config key", async () => {
			const root = await makeTempVault();
			const client = await createClient(root);

			const result = await client.callTool({
				name: "kib_config",
				arguments: { key: "search.engine" },
			});
			expect(result.isError).toBeFalsy();

			const data = JSON.parse(textOf(result));
			expect(data["search.engine"]).toBeDefined();
		});

		test("sets a config value", async () => {
			const root = await makeTempVault();
			const client = await createClient(root);

			const setResult = await client.callTool({
				name: "kib_config",
				arguments: { key: "search.engine", value: "hybrid" },
			});
			expect(setResult.isError).toBeFalsy();

			const data = JSON.parse(textOf(setResult));
			expect(data["search.engine"]).toBe("hybrid");
			expect(data.saved).toBe(true);

			// Verify it persisted
			const getResult = await client.callTool({
				name: "kib_config",
				arguments: { key: "search.engine" },
			});
			const readBack = JSON.parse(textOf(getResult));
			expect(readBack["search.engine"]).toBe("hybrid");
		});

		test("returns error for unknown key", async () => {
			const root = await makeTempVault();
			const client = await createClient(root);

			const result = await client.callTool({
				name: "kib_config",
				arguments: { key: "nonexistent.key" },
			});
			expect(result.isError).toBe(true);
		});
	});

	// ── kib_skill ──────────────────────────────────────────────

	describe("kib_skill", () => {
		test("lists built-in skills", async () => {
			const root = await makeTempVault();
			const client = await createClient(root);

			const result = await client.callTool({
				name: "kib_skill",
				arguments: { action: "list" },
			});
			expect(result.isError).toBeFalsy();

			const skills = JSON.parse(textOf(result));
			expect(Array.isArray(skills)).toBe(true);
			expect(skills.length).toBeGreaterThan(0);
			expect(skills[0].name).toBeDefined();
			expect(skills[0].description).toBeDefined();
		});

		test("returns error when running without name", async () => {
			const root = await makeTempVault();
			const client = await createClient(root);

			const result = await client.callTool({
				name: "kib_skill",
				arguments: { action: "run" },
			});
			expect(result.isError).toBe(true);
			expect(textOf(result)).toContain("name is required");
		});

		test("returns error for nonexistent skill", async () => {
			const root = await makeTempVault();
			const client = await createClient(root);

			const result = await client.callTool({
				name: "kib_skill",
				arguments: { action: "run", name: "nonexistent-skill" },
			});
			expect(result.isError).toBe(true);
			expect(textOf(result)).toContain("not found");
		});
	});

	// ── kib_export ─────────────────────────────────────────────

	describe("kib_export", () => {
		test("exports wiki as markdown", async () => {
			const root = await makeTempVault();
			await writeWiki(root, "concepts/test.md", articleMd("Test", "Test content."));
			const client = await createClient(root);

			const outputDir = join(tempDir, "export-test");
			const result = await client.callTool({
				name: "kib_export",
				arguments: { format: "markdown", output: outputDir },
			});
			expect(result.isError).toBeFalsy();

			const data = JSON.parse(textOf(result));
			expect(data.format).toBe("markdown");
			expect(data.files).toBeGreaterThan(0);
			expect(data.output).toBe(outputDir);
		});

		test("exports wiki as html", async () => {
			const root = await makeTempVault();
			await writeWiki(root, "concepts/test.md", articleMd("Test", "Test content."));
			const client = await createClient(root);

			const outputDir = join(tempDir, "export-html-test");
			const result = await client.callTool({
				name: "kib_export",
				arguments: { format: "html", output: outputDir },
			});
			expect(result.isError).toBeFalsy();

			const data = JSON.parse(textOf(result));
			expect(data.format).toBe("html");
			expect(data.files).toBeGreaterThan(0);
		});
	});

	// ── kib_compile with max ──────────────────────────────────

	describe("kib_compile params", () => {
		test("accepts dry_run and max params", async () => {
			const root = await makeTempVault();
			const client = await createClient(root);

			// dry_run compile on empty vault should succeed
			const result = await client.callTool({
				name: "kib_compile",
				arguments: { dry_run: true, max: 5 },
			});
			// Will error due to no provider, which is expected
			// The point is it doesn't crash on the new params
			expect(result).toBeDefined();
		});
	});

	// ── kib_ingest dry_run ────────────────────────────────────

	describe("kib_ingest dry_run", () => {
		test("dry run returns preview without writing", async () => {
			const root = await makeTempVault();
			const filePath = join(tempDir, "dry-run-input.txt");
			await writeFile(filePath, "Test document for dry run verification.");
			const client = await createClient(root);

			const result = await client.callTool({
				name: "kib_ingest",
				arguments: { source: filePath, dry_run: true },
			});
			expect(result.isError).toBeFalsy();

			const data = JSON.parse(textOf(result));
			expect(data.dryRun).toBe(true);
			expect(data.path).toBeTruthy();
		});
	});

	// ── Tool listing ───────────────────────────────────────────

	describe("tool listing", () => {
		test("exposes all expected tools", async () => {
			const root = await makeTempVault();
			const client = await createClient(root);

			const { tools } = await client.listTools();
			const names = tools.map((t) => t.name).sort();
			expect(names).toEqual([
				"kib_compile",
				"kib_config",
				"kib_export",
				"kib_ingest",
				"kib_lint",
				"kib_list",
				"kib_pull",
				"kib_push",
				"kib_query",
				"kib_read",
				"kib_search",
				"kib_share_status",
				"kib_skill",
				"kib_status",
			]);
		});
	});
});
