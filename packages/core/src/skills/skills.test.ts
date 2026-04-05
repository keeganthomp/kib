import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CompletionParams, CompletionResult, LLMProvider, StreamChunk } from "../types.js";
import { initVault, writeWiki } from "../vault.js";
import { loadSkills, findSkill } from "./loader.js";
import { runSkill } from "./runner.js";

let tempDir: string;

afterEach(async () => {
	if (tempDir) await rm(tempDir, { recursive: true, force: true });
});

async function makeTempVault() {
	tempDir = await mkdtemp(join(tmpdir(), "kib-skills-test-"));
	await initVault(tempDir, { name: "test" });
	return tempDir;
}

function mockProvider(response: string): LLMProvider {
	return {
		name: "mock",
		async complete(): Promise<CompletionResult> {
			return {
				content: response,
				usage: { inputTokens: 100, outputTokens: 50 },
				stopReason: "end_turn",
			};
		},
		async *stream(): AsyncIterable<StreamChunk> {
			yield { type: "text", text: response };
		},
	};
}

function articleMd(title: string, slug: string, content: string): string {
	return `---\ntitle: ${title}\nslug: ${slug}\ncategory: concept\ntags: []\nsummary: ""\n---\n\n# ${title}\n\n${content}`;
}

describe("skill loader", () => {
	test("loads built-in skills", async () => {
		const root = await makeTempVault();
		const skills = await loadSkills(root);

		expect(skills.length).toBeGreaterThanOrEqual(3);
		expect(skills.some((s) => s.name === "summarize")).toBe(true);
		expect(skills.some((s) => s.name === "flashcards")).toBe(true);
		expect(skills.some((s) => s.name === "connections")).toBe(true);
	});

	test("finds skill by name", async () => {
		const root = await makeTempVault();
		const skill = await findSkill(root, "summarize");

		expect(skill).not.toBeNull();
		expect(skill!.name).toBe("summarize");
		expect(skill!.description).toBeTruthy();
	});

	test("returns null for unknown skill", async () => {
		const root = await makeTempVault();
		const skill = await findSkill(root, "nonexistent");
		expect(skill).toBeNull();
	});
});

describe("skill runner", () => {
	test("runs summarize skill", async () => {
		const root = await makeTempVault();
		await writeWiki(
			root,
			"concepts/test.md",
			articleMd("Test Article", "test", "This is test content for summarization."),
		);

		const skill = await findSkill(root, "summarize");
		expect(skill).not.toBeNull();

		const provider = mockProvider("Summary: This is a test article about testing.");
		const result = await runSkill(root, skill!, { provider });

		expect(result.content).toContain("Summary");
	});

	test("runs flashcards skill", async () => {
		const root = await makeTempVault();
		await writeWiki(
			root,
			"concepts/ml.md",
			articleMd("Machine Learning", "ml", "ML is a subset of AI that learns from data."),
		);

		const skill = await findSkill(root, "flashcards");
		const provider = mockProvider("Q: What is ML?\nA: A subset of AI that learns from data.");
		const result = await runSkill(root, skill!, { provider });

		expect(result.content).toContain("Q:");
		expect(result.content).toContain("A:");
	});

	test("throws when LLM required but not provided", async () => {
		const root = await makeTempVault();
		const skill = await findSkill(root, "summarize");

		expect(runSkill(root, skill!)).rejects.toThrow("requires an LLM provider");
	});

	test("skill context has access to vault data", async () => {
		const root = await makeTempVault();
		await writeWiki(
			root,
			"concepts/a.md",
			articleMd("Article A", "article-a", "Content A."),
		);
		await writeWiki(
			root,
			"concepts/b.md",
			articleMd("Article B", "article-b", "Content B."),
		);

		// Custom skill that tests context access
		const testSkill = {
			name: "test-context",
			version: "1.0.0",
			description: "Test skill context",
			input: "wiki" as const,
			output: "report" as const,
			async run(ctx: any) {
				const articles = await ctx.vault.readWiki();
				const index = await ctx.vault.readIndex();
				return {
					content: `Found ${articles.length} articles. Index length: ${index.length}`,
				};
			},
		};

		const result = await runSkill(root, testSkill as any);
		expect(result.content).toContain("Found 2 articles");
	});
});
