import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { SKILLS_DIR, VAULT_DIR } from "../constants.js";
import type { SkillDefinition } from "../types.js";
import { SkillDefinitionSchema } from "./schema.js";

/**
 * Load all available skills (built-in + installed).
 */
export async function loadSkills(root: string): Promise<SkillDefinition[]> {
	const builtIns = getBuiltinSkills();
	const installed = await loadInstalledSkills(root);
	return [...builtIns, ...installed];
}

/**
 * Find a skill by name.
 */
export async function findSkill(
	root: string,
	name: string,
): Promise<SkillDefinition | null> {
	const skills = await loadSkills(root);
	return skills.find((s) => s.name === name) ?? null;
}

/**
 * Load user-installed skills from .kb/skills/.
 */
async function loadInstalledSkills(root: string): Promise<SkillDefinition[]> {
	const skillsDir = join(root, VAULT_DIR, SKILLS_DIR);
	if (!existsSync(skillsDir)) return [];

	const files = await readdir(skillsDir);
	const tsFiles = files.filter((f) => f.endsWith(".ts") || f.endsWith(".js"));

	const skills: SkillDefinition[] = [];

	for (const file of tsFiles) {
		try {
			const mod = await import(join(skillsDir, file));
			const definition = mod.default ?? mod;

			// Validate the skill definition
			const parsed = SkillDefinitionSchema.safeParse(definition);
			if (parsed.success) {
				skills.push({
					...definition,
					run: definition.run,
				});
			}
		} catch {
			// Skip malformed skills
		}
	}

	return skills;
}

/**
 * Built-in skills that ship with kib.
 */
function getBuiltinSkills(): SkillDefinition[] {
	return [
		{
			name: "summarize",
			version: "1.0.0",
			description: "Summarize a wiki article or raw source",
			input: "selection",
			output: "stdout",
			llm: {
				required: true,
				model: "fast",
				systemPrompt:
					"Summarize the following content concisely. Highlight key points, main arguments, and conclusions. Output markdown.",
				maxTokens: 1024,
				temperature: 0,
			},
			async run(ctx) {
				const articles = await ctx.vault.readWiki();
				if (articles.length === 0) {
					ctx.logger.warn("No articles to summarize.");
					return {};
				}
				const content = articles.map((a) => `# ${a.title}\n\n${a.content}`).join("\n\n---\n\n");
				const result = await ctx.llm.complete({
					system: this.llm!.systemPrompt,
					messages: [{ role: "user", content }],
					maxTokens: this.llm!.maxTokens,
					temperature: this.llm!.temperature,
				});
				return { content: result.content };
			},
		},
		{
			name: "flashcards",
			version: "1.0.0",
			description: "Generate flashcards from wiki articles",
			input: "wiki",
			output: "report",
			llm: {
				required: true,
				model: "default",
				systemPrompt: `Generate flashcards from the following knowledge base articles.
Output format:
Q: [question]
A: [answer]

Create 5-10 flashcards per article. Focus on key concepts, definitions, and relationships.`,
				maxTokens: 4096,
				temperature: 0,
			},
			async run(ctx) {
				const articles = await ctx.vault.readWiki();
				if (articles.length === 0) {
					ctx.logger.warn("No articles to generate flashcards from.");
					return {};
				}
				const content = articles
					.slice(0, 5)
					.map((a) => `# ${a.title}\n\n${a.content}`)
					.join("\n\n---\n\n");
				const result = await ctx.llm.complete({
					system: this.llm!.systemPrompt,
					messages: [{ role: "user", content }],
					maxTokens: this.llm!.maxTokens,
					temperature: this.llm!.temperature,
				});
				return { content: result.content };
			},
		},
		{
			name: "connections",
			version: "1.0.0",
			description: "Suggest new connections between existing articles",
			input: "index",
			output: "report",
			llm: {
				required: true,
				model: "default",
				systemPrompt: `Analyze the following wiki index and suggest connections between articles that aren't currently linked.
For each suggestion, explain why the connection is relevant.
Output as a markdown list.`,
				maxTokens: 2048,
				temperature: 0.3,
			},
			async run(ctx) {
				const index = await ctx.vault.readIndex();
				const graph = await ctx.vault.readGraph();
				const result = await ctx.llm.complete({
					system: this.llm!.systemPrompt,
					messages: [
						{
							role: "user",
							content: `CURRENT INDEX:\n${index}\n\nCURRENT GRAPH:\n${graph}`,
						},
					],
					maxTokens: this.llm!.maxTokens,
					temperature: this.llm!.temperature,
				});
				return { content: result.content };
			},
		},
	];
}
