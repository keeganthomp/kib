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

	// ── Tool listing ───────────────────────────────────────────

	describe("tool listing", () => {
		test("exposes all expected tools", async () => {
			const root = await makeTempVault();
			const client = await createClient(root);

			const { tools } = await client.listTools();
			const names = tools.map((t) => t.name).sort();
			expect(names).toEqual([
				"kib_compile",
				"kib_ingest",
				"kib_lint",
				"kib_list",
				"kib_query",
				"kib_read",
				"kib_search",
				"kib_status",
			]);
		});
	});
});
