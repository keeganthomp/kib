import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initVault, writeWiki } from "../vault.js";
import { buildLinkGraph, generateGraphMd } from "./backlinks.js";

let tempDir: string;

afterEach(async () => {
	if (tempDir) await rm(tempDir, { recursive: true, force: true });
});

async function makeTempVault() {
	tempDir = await mkdtemp(join(tmpdir(), "kib-backlinks-test-"));
	await initVault(tempDir, { name: "test" });
	return tempDir;
}

describe("buildLinkGraph", () => {
	test("builds forward and backward links", async () => {
		const root = await makeTempVault();

		await writeWiki(
			root,
			"concepts/transformers.md",
			"---\nslug: transformers\n---\n\nSee [[attention-mechanisms]] and [[positional-encoding]].",
		);
		await writeWiki(
			root,
			"concepts/attention-mechanisms.md",
			"---\nslug: attention-mechanisms\n---\n\nPart of [[transformers]].",
		);
		await writeWiki(
			root,
			"concepts/positional-encoding.md",
			"---\nslug: positional-encoding\n---\n\nUsed in [[transformers]].",
		);

		const graph = await buildLinkGraph(root);

		// Forward links
		expect([...graph.forwardLinks.get("transformers")!]).toEqual(
			expect.arrayContaining(["attention-mechanisms", "positional-encoding"]),
		);
		expect([...graph.forwardLinks.get("attention-mechanisms")!]).toEqual(["transformers"]);
		expect([...graph.forwardLinks.get("positional-encoding")!]).toEqual(["transformers"]);

		// Backlinks
		expect([...graph.backlinks.get("transformers")!]).toEqual(
			expect.arrayContaining(["attention-mechanisms", "positional-encoding"]),
		);
		expect([...graph.backlinks.get("attention-mechanisms")!]).toEqual(["transformers"]);
		expect([...graph.backlinks.get("positional-encoding")!]).toEqual(["transformers"]);
	});

	test("handles articles with no links", async () => {
		const root = await makeTempVault();
		await writeWiki(root, "concepts/orphan.md", "---\nslug: orphan\n---\n\nNo links here.");

		const graph = await buildLinkGraph(root);
		expect(graph.forwardLinks.get("orphan")!.size).toBe(0);
		expect(graph.backlinks.get("orphan")!.size).toBe(0);
	});

	test("handles empty wiki", async () => {
		const root = await makeTempVault();
		const graph = await buildLinkGraph(root);
		expect(graph.forwardLinks.size).toBe(0);
		expect(graph.backlinks.size).toBe(0);
	});
});

describe("generateGraphMd", () => {
	test("generates adjacency list", async () => {
		const root = await makeTempVault();
		await writeWiki(root, "concepts/a.md", "---\nslug: alpha\n---\n\n[[beta]] and [[gamma]].");
		await writeWiki(root, "concepts/b.md", "---\nslug: beta\n---\n\n[[alpha]].");

		const graph = await buildLinkGraph(root);
		const md = generateGraphMd(graph);

		expect(md).toContain("# Knowledge Graph");
		expect(md).toContain("alpha -> beta, gamma");
		expect(md).toContain("beta -> alpha");
	});

	test("handles empty graph", () => {
		const graph = {
			forwardLinks: new Map<string, Set<string>>(),
			backlinks: new Map<string, Set<string>>(),
		};
		const md = generateGraphMd(graph);
		expect(md).toContain("(no connections yet)");
	});

	test("sorts slugs alphabetically", async () => {
		const root = await makeTempVault();
		await writeWiki(root, "concepts/c.md", "---\nslug: charlie\n---\n\n[[alpha]].");
		await writeWiki(root, "concepts/a.md", "---\nslug: alpha\n---\n\n[[charlie]].");
		await writeWiki(root, "concepts/b.md", "---\nslug: bravo\n---\n\n[[alpha]].");

		const graph = await buildLinkGraph(root);
		const md = generateGraphMd(graph);
		const lines = md.split("\n").filter((l) => l.includes("->"));

		// Should be alpha, bravo, charlie order
		expect(lines[0]).toMatch(/^alpha/);
		expect(lines[1]).toMatch(/^bravo/);
		expect(lines[2]).toMatch(/^charlie/);
	});
});
