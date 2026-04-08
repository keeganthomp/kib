import { afterEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SKILLS_DIR, VAULT_DIR } from "../constants.js";
import type {
	CompletionResult,
	LLMProvider,
	SkillContext,
	SkillDefinition,
	StreamChunk,
} from "../types.js";
import { initVault, writeWiki } from "../vault.js";
import { getBuiltinSkills } from "./builtins.js";
import { getHookedSkills, runSkillHooks } from "./hooks.js";
import { findSkill, loadSkills } from "./loader.js";
import { createSkill, resolveSkillDependencies, uninstallSkill } from "./registry.js";
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

// ─── Loader tests ───────────────────────────────────────────────

describe("skill loader", () => {
	test("loads built-in skills", async () => {
		const root = await makeTempVault();
		const skills = await loadSkills(root);

		expect(skills.length).toBeGreaterThanOrEqual(10);
		expect(skills.some((s) => s.name === "summarize")).toBe(true);
		expect(skills.some((s) => s.name === "flashcards")).toBe(true);
		expect(skills.some((s) => s.name === "connections")).toBe(true);
	});

	test("loads all v0.8.0 built-in skills", async () => {
		const root = await makeTempVault();
		const skills = await loadSkills(root);

		const expected = [
			"summarize",
			"flashcards",
			"connections",
			"find-contradictions",
			"weekly-digest",
			"export-slides",
			"timeline",
			"compare",
			"explain",
			"suggest-tags",
		];

		for (const name of expected) {
			expect(skills.some((s) => s.name === name)).toBe(true);
		}
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

	test("loads directory-based installed skills", async () => {
		const root = await makeTempVault();
		const skillsDir = join(root, VAULT_DIR, SKILLS_DIR);
		const mySkillDir = join(skillsDir, "my-custom-skill");
		await mkdir(mySkillDir, { recursive: true });

		await writeFile(
			join(mySkillDir, "index.ts"),
			`export default {
				name: "my-custom-skill",
				version: "1.0.0",
				description: "A test custom skill",
				input: "none",
				output: "stdout",
				async run() { return { content: "hello" }; },
			};`,
		);

		const skills = await loadSkills(root);
		expect(skills.some((s) => s.name === "my-custom-skill")).toBe(true);
	});

	test("loads directory skill with skill.json entry point", async () => {
		const root = await makeTempVault();
		const skillsDir = join(root, VAULT_DIR, SKILLS_DIR);
		const mySkillDir = join(skillsDir, "custom-entry");
		await mkdir(mySkillDir, { recursive: true });

		await writeFile(
			join(mySkillDir, "skill.json"),
			JSON.stringify({
				name: "custom-entry",
				version: "2.0.0",
				description: "test",
				main: "main.ts",
			}),
		);
		await writeFile(
			join(mySkillDir, "main.ts"),
			`export default {
				name: "custom-entry",
				version: "2.0.0",
				description: "A skill with custom entry",
				input: "none",
				output: "stdout",
				async run() { return { content: "custom" }; },
			};`,
		);

		const skills = await loadSkills(root);
		expect(skills.some((s) => s.name === "custom-entry")).toBe(true);
	});

	test("skips malformed installed skills", async () => {
		const root = await makeTempVault();
		const skillsDir = join(root, VAULT_DIR, SKILLS_DIR);

		await writeFile(join(skillsDir, "bad-skill.ts"), `export default { broken: true };`);

		const skills = await loadSkills(root);
		expect(skills.some((s) => s.name === "bad-skill")).toBe(false);
		// Should still load built-ins
		expect(skills.some((s) => s.name === "summarize")).toBe(true);
	});
});

// ─── Runner tests ───────────────────────────────────────────────

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
		await writeWiki(root, "concepts/a.md", articleMd("Article A", "article-a", "Content A."));
		await writeWiki(root, "concepts/b.md", articleMd("Article B", "article-b", "Content B."));

		// Custom skill that tests context access
		const testSkill = {
			name: "test-context",
			version: "1.0.0",
			description: "Test skill context",
			input: "wiki" as const,
			output: "report" as const,
			async run(ctx: SkillContext) {
				const articles = await ctx.vault.readWiki();
				const index = await ctx.vault.readIndex();
				return {
					content: `Found ${articles.length} articles. Index length: ${index.length}`,
				};
			},
		} satisfies SkillDefinition;

		const result = await runSkill(root, testSkill);
		expect(result.content).toContain("Found 2 articles");
	});

	test("runs find-contradictions skill", async () => {
		const root = await makeTempVault();
		await writeWiki(root, "concepts/a.md", articleMd("Topic A", "a", "The sky is blue."));
		await writeWiki(root, "concepts/b.md", articleMd("Topic B", "b", "The sky is green."));

		const skill = await findSkill(root, "find-contradictions");
		expect(skill).not.toBeNull();

		const provider = mockProvider(
			"## Contradiction 1\n- Article A: sky is blue\n- Article B: sky is green",
		);
		const result = await runSkill(root, skill!, { provider });

		expect(result.content).toContain("Contradiction");
	});

	test("find-contradictions returns early with < 2 articles", async () => {
		const root = await makeTempVault();
		await writeWiki(root, "concepts/only.md", articleMd("Only", "only", "Solo article."));

		const skill = await findSkill(root, "find-contradictions");
		const provider = mockProvider("should not be called");
		const result = await runSkill(root, skill!, { provider });

		expect(result.content).toContain("fewer than 2 articles");
	});

	test("runs weekly-digest skill", async () => {
		const root = await makeTempVault();
		await writeWiki(
			root,
			"concepts/new.md",
			articleMd("New Thing", "new-thing", "Recently added."),
		);

		const skill = await findSkill(root, "weekly-digest");
		const provider = mockProvider("# Weekly Digest\n\n## New This Week\n- New Thing");
		const result = await runSkill(root, skill!, { provider });

		expect(result.content).toContain("Weekly Digest");
	});

	test("runs export-slides skill", async () => {
		const root = await makeTempVault();
		await writeWiki(root, "concepts/topic.md", articleMd("Topic", "topic", "Some content here."));

		const skill = await findSkill(root, "export-slides");
		const provider = mockProvider("---\nmarp: true\n---\n# Slide 1\n\n- Point A");
		const result = await runSkill(root, skill!, { provider });

		expect(result.content).toContain("marp: true");
	});

	test("runs timeline skill", async () => {
		const root = await makeTempVault();
		await writeWiki(
			root,
			"concepts/history.md",
			articleMd("History", "history", "In 2020, X happened."),
		);

		const skill = await findSkill(root, "timeline");
		const provider = mockProvider(
			"## Timeline\n\n| Date | Event |\n|---|---|\n| 2020 | X happened |",
		);
		const result = await runSkill(root, skill!, { provider });

		expect(result.content).toContain("Timeline");
	});

	test("runs compare skill", async () => {
		const root = await makeTempVault();
		await writeWiki(root, "concepts/a.md", articleMd("React", "react", "React is a UI library."));
		await writeWiki(
			root,
			"concepts/b.md",
			articleMd("Vue", "vue", "Vue is a progressive framework."),
		);

		const skill = await findSkill(root, "compare");
		const provider = mockProvider(
			"## Comparison: React vs Vue\n\n### Similarities\n- Both are JS frameworks",
		);
		const result = await runSkill(root, skill!, { provider });

		expect(result.content).toContain("Comparison");
	});

	test("compare returns early with < 2 articles", async () => {
		const root = await makeTempVault();
		await writeWiki(root, "concepts/only.md", articleMd("Only", "only", "Solo article."));

		const skill = await findSkill(root, "compare");
		const provider = mockProvider("should not be called");
		const result = await runSkill(root, skill!, { provider });

		expect(result.content).toContain("Cannot compare");
	});

	test("runs explain skill", async () => {
		const root = await makeTempVault();
		await writeWiki(
			root,
			"concepts/ml.md",
			articleMd("Machine Learning", "ml", "ML uses neural networks."),
		);

		const skill = await findSkill(root, "explain");
		const provider = mockProvider(
			"**Summary**: ML is computers learning from data.\n\n## Core Explanation...",
		);
		const result = await runSkill(root, skill!, { provider });

		expect(result.content).toContain("Summary");
	});

	test("runs suggest-tags skill", async () => {
		const root = await makeTempVault();
		await writeWiki(
			root,
			"concepts/ml.md",
			articleMd("Machine Learning", "ml", "ML is a subset of AI."),
		);

		const skill = await findSkill(root, "suggest-tags");
		const provider = mockProvider("### Machine Learning\nSuggested tags: `machine-learning`, `ai`");
		const result = await runSkill(root, skill!, { provider });

		expect(result.content).toContain("machine-learning");
	});
});

// ─── Skill-to-skill invocation ──────────────────────────────────

describe("skill-to-skill invocation", () => {
	test("skill can invoke another skill", async () => {
		const root = await makeTempVault();
		await writeWiki(root, "concepts/a.md", articleMd("Article A", "a", "Content A."));

		const callerSkill: SkillDefinition = {
			name: "caller",
			version: "1.0.0",
			description: "Calls another skill",
			input: "none",
			output: "report",
			async run(ctx) {
				const result = await ctx.invoke("summarize");
				return { content: `Invoked summarize: ${result.content}` };
			},
		};

		const provider = mockProvider("Summary result");
		const result = await runSkill(root, callerSkill, { provider });

		expect(result.content).toContain("Invoked summarize: Summary result");
	});

	test("invoke throws on unknown skill", async () => {
		const root = await makeTempVault();

		const callerSkill: SkillDefinition = {
			name: "caller",
			version: "1.0.0",
			description: "Calls unknown skill",
			input: "none",
			output: "report",
			async run(ctx) {
				return ctx.invoke("nonexistent");
			},
		};

		expect(runSkill(root, callerSkill)).rejects.toThrow('Skill "nonexistent" not found');
	});

	test("invoke respects depth limit", async () => {
		const root = await makeTempVault();
		await writeWiki(root, "concepts/a.md", articleMd("A", "a", "Content."));

		// A skill that invokes summarize, which in turn calls the LLM
		const wrapperSkill: SkillDefinition = {
			name: "wrapper",
			version: "1.0.0",
			description: "Wraps summarize",
			input: "none",
			output: "report",
			async run(ctx) {
				const result = await ctx.invoke("summarize");
				return { content: `wrapped: ${result.content}` };
			},
		};

		const provider = mockProvider("inner result");
		const result = await runSkill(root, wrapperSkill, { provider, maxDepth: 3 });
		expect(result.content).toContain("wrapped: inner result");
	});
});

// ─── Dependency resolution ──────────────────────────────────────

describe("skill dependency resolution", () => {
	test("resolves skills with no dependencies", () => {
		const skill: SkillDefinition = {
			name: "standalone",
			version: "1.0.0",
			description: "No deps",
			input: "none",
			output: "none",
			async run() {
				return {};
			},
		};

		const resolved = resolveSkillDependencies(skill, [skill]);
		expect(resolved).toHaveLength(1);
		expect(resolved[0].name).toBe("standalone");
	});

	test("resolves skills in dependency order", () => {
		const a: SkillDefinition = {
			name: "a",
			version: "1.0.0",
			description: "Base skill",
			input: "none",
			output: "none",
			async run() {
				return {};
			},
		};

		const b: SkillDefinition = {
			name: "b",
			version: "1.0.0",
			description: "Depends on a",
			input: "none",
			output: "none",
			dependencies: ["a"],
			async run() {
				return {};
			},
		};

		const resolved = resolveSkillDependencies(b, [a, b]);
		expect(resolved).toHaveLength(2);
		expect(resolved[0].name).toBe("a");
		expect(resolved[1].name).toBe("b");
	});

	test("throws on circular dependencies", () => {
		const a: SkillDefinition = {
			name: "a",
			version: "1.0.0",
			description: "Depends on b",
			input: "none",
			output: "none",
			dependencies: ["b"],
			async run() {
				return {};
			},
		};

		const b: SkillDefinition = {
			name: "b",
			version: "1.0.0",
			description: "Depends on a",
			input: "none",
			output: "none",
			dependencies: ["a"],
			async run() {
				return {};
			},
		};

		expect(() => resolveSkillDependencies(a, [a, b])).toThrow("Circular skill dependency");
	});

	test("throws on missing dependency", () => {
		const skill: SkillDefinition = {
			name: "needs-missing",
			version: "1.0.0",
			description: "Depends on nonexistent",
			input: "none",
			output: "none",
			dependencies: ["nonexistent"],
			async run() {
				return {};
			},
		};

		expect(() => resolveSkillDependencies(skill, [skill])).toThrow(
			'depends on "nonexistent", which was not found',
		);
	});

	test("handles deep dependency chains", () => {
		const a: SkillDefinition = {
			name: "a",
			version: "1.0.0",
			description: "Base",
			input: "none",
			output: "none",
			async run() {
				return {};
			},
		};
		const b: SkillDefinition = {
			name: "b",
			version: "1.0.0",
			description: "Dep on a",
			input: "none",
			output: "none",
			dependencies: ["a"],
			async run() {
				return {};
			},
		};
		const c: SkillDefinition = {
			name: "c",
			version: "1.0.0",
			description: "Dep on b",
			input: "none",
			output: "none",
			dependencies: ["b"],
			async run() {
				return {};
			},
		};

		const resolved = resolveSkillDependencies(c, [a, b, c]);
		expect(resolved).toHaveLength(3);
		expect(resolved[0].name).toBe("a");
		expect(resolved[1].name).toBe("b");
		expect(resolved[2].name).toBe("c");
	});
});

// ─── Registry tests ─────────────────────────────────────────────

describe("skill registry", () => {
	test("createSkill scaffolds a new skill", async () => {
		const root = await makeTempVault();
		const path = await createSkill(root, "my-new-skill", { author: "testuser" });

		expect(existsSync(path)).toBe(true);
		expect(existsSync(join(path, "index.ts"))).toBe(true);
		expect(existsSync(join(path, "skill.json"))).toBe(true);

		const pkg = JSON.parse(await readFile(join(path, "skill.json"), "utf-8"));
		expect(pkg.name).toBe("my-new-skill");
		expect(pkg.author).toBe("testuser");

		const indexContent = await readFile(join(path, "index.ts"), "utf-8");
		expect(indexContent).toContain("my-new-skill");
		expect(indexContent).toContain("testuser");
	});

	test("createSkill throws if skill already exists", async () => {
		const root = await makeTempVault();
		await createSkill(root, "existing-skill");

		expect(createSkill(root, "existing-skill")).rejects.toThrow("already exists");
	});

	test("created skill can be loaded", async () => {
		const root = await makeTempVault();
		await createSkill(root, "loadable-skill");

		const skills = await loadSkills(root);
		const found = skills.find((s) => s.name === "loadable-skill");
		expect(found).toBeDefined();
		expect(found?.description).toContain("TODO");
	});

	test("uninstallSkill removes a directory-based skill", async () => {
		const root = await makeTempVault();
		const path = await createSkill(root, "removable-skill");

		expect(existsSync(path)).toBe(true);
		await uninstallSkill(root, "removable-skill");
		expect(existsSync(path)).toBe(false);
	});

	test("uninstallSkill removes a single-file skill", async () => {
		const root = await makeTempVault();
		const skillsDir = join(root, VAULT_DIR, SKILLS_DIR);
		const filePath = join(skillsDir, "single.ts");
		await writeFile(
			filePath,
			`export default { name: "single", version: "1.0.0", description: "test", input: "none", output: "none", async run() { return {}; } };`,
		);

		expect(existsSync(filePath)).toBe(true);
		await uninstallSkill(root, "single");
		expect(existsSync(filePath)).toBe(false);
	});

	test("uninstallSkill throws for non-existent skill", async () => {
		const root = await makeTempVault();
		expect(uninstallSkill(root, "ghost")).rejects.toThrow('Skill "ghost" is not installed');
	});
});

// ─── Hooks tests ────────────────────────────────────────────────

describe("skill hooks", () => {
	test("getHookedSkills returns skills registered for a hook", async () => {
		const root = await makeTempVault();

		// Install a skill with hooks
		const skillsDir = join(root, VAULT_DIR, SKILLS_DIR);
		await writeFile(
			join(skillsDir, "auto-tag.ts"),
			`export default {
				name: "auto-tag",
				version: "1.0.0",
				description: "Auto-tag after compile",
				input: "wiki",
				output: "report",
				hooks: ["post-compile"],
				async run() { return { content: "tagged" }; },
			};`,
		);

		const hooked = await getHookedSkills(root, "post-compile");
		expect(hooked).toContain("auto-tag");
	});

	test("getHookedSkills includes config-based hooks", async () => {
		const root = await makeTempVault();
		const { loadConfig } = await import("../vault.js");
		const config = await loadConfig(root);
		config.skills = {
			hooks: {
				"post-compile": ["summarize"],
				"post-ingest": [],
				"post-lint": [],
			},
			config: {},
		};

		const hooked = await getHookedSkills(root, "post-compile", config);
		expect(hooked).toContain("summarize");
	});

	test("runSkillHooks runs all hooks and collects results", async () => {
		const root = await makeTempVault();
		await writeWiki(root, "concepts/a.md", articleMd("A", "a", "Content"));

		const skillsDir = join(root, VAULT_DIR, SKILLS_DIR);
		await writeFile(
			join(skillsDir, "hook-skill.ts"),
			`export default {
				name: "hook-skill",
				version: "1.0.0",
				description: "Runs after compile",
				input: "none",
				output: "stdout",
				hooks: ["post-compile"],
				async run() { return { content: "hook ran!" }; },
			};`,
		);

		const results = await runSkillHooks(root, "post-compile");
		expect(results.length).toBeGreaterThanOrEqual(1);
		expect(results.some((r) => r.skill === "hook-skill" && r.content === "hook ran!")).toBe(true);
	});

	test("runSkillHooks reports errors without throwing", async () => {
		const root = await makeTempVault();

		const { loadConfig } = await import("../vault.js");
		const config = await loadConfig(root);
		config.skills = {
			hooks: {
				"post-compile": ["nonexistent-skill"],
				"post-ingest": [],
				"post-lint": [],
			},
			config: {},
		};

		const results = await runSkillHooks(root, "post-compile", { config });
		expect(results.some((r) => r.skill === "nonexistent-skill" && r.error)).toBe(true);
	});
});

// ─── Builtins tests ─────────────────────────────────────────────

describe("built-in skills", () => {
	test("all built-in skills have valid definitions", () => {
		const builtins = getBuiltinSkills();

		for (const skill of builtins) {
			expect(skill.name).toBeTruthy();
			expect(skill.version).toBeTruthy();
			expect(skill.description).toBeTruthy();
			expect(typeof skill.run).toBe("function");
		}
	});

	test("built-in skills have unique names", () => {
		const builtins = getBuiltinSkills();
		const names = builtins.map((s) => s.name);
		const unique = new Set(names);
		expect(unique.size).toBe(names.length);
	});

	test("all LLM-requiring skills have systemPrompt", () => {
		const builtins = getBuiltinSkills();

		for (const skill of builtins) {
			if (skill.llm?.required) {
				expect(skill.llm.systemPrompt).toBeTruthy();
				expect(skill.llm.systemPrompt.length).toBeGreaterThan(10);
			}
		}
	});

	test("returns 10 built-in skills", () => {
		const builtins = getBuiltinSkills();
		expect(builtins).toHaveLength(10);
	});
});

// ─── Schema tests ───────────────────────────────────────────────

describe("skill schemas", () => {
	test("SkillDefinitionSchema validates new fields", async () => {
		const { SkillDefinitionSchema } = await import("./schema.js");

		const result = SkillDefinitionSchema.safeParse({
			name: "test-skill",
			description: "A test",
			input: "wiki",
			output: "report",
			dependencies: ["summarize"],
			hooks: ["post-compile"],
			category: "outputs",
		});

		expect(result.success).toBe(true);
	});

	test("SkillDefinitionSchema rejects invalid hooks", async () => {
		const { SkillDefinitionSchema } = await import("./schema.js");

		const result = SkillDefinitionSchema.safeParse({
			name: "test",
			description: "test",
			input: "none",
			output: "none",
			hooks: ["invalid-hook"],
		});

		expect(result.success).toBe(false);
	});

	test("SkillPackageSchema validates skill.json", async () => {
		const { SkillPackageSchema } = await import("./schema.js");

		const result = SkillPackageSchema.safeParse({
			name: "my-skill",
			version: "1.0.0",
			description: "A cool skill",
			author: "test",
			main: "index.ts",
			dependencies: ["other-skill"],
		});

		expect(result.success).toBe(true);
	});

	test("SkillConfigSchema validates config section", async () => {
		const { SkillConfigSchema } = await import("./schema.js");

		const result = SkillConfigSchema.safeParse({
			hooks: {
				"post-compile": ["suggest-tags"],
				"post-ingest": [],
				"post-lint": [],
			},
			config: {
				"suggest-tags": { maxTags: 5 },
			},
		});

		expect(result.success).toBe(true);
	});
});
