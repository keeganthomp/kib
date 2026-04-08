import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseFrontmatter } from "../compile/diff.js";
import { WIKI_DIR } from "../constants.js";
import { SearchIndex } from "../search/engine.js";
import type {
	LLMProvider,
	Manifest,
	SkillContext,
	SkillDefinition,
	VaultConfig,
} from "../types.js";
import { listRaw, listWiki, loadConfig, loadManifest, readIndex, writeWiki } from "../vault.js";
import { findSkill } from "./loader.js";
import { resolveSkillDependencies } from "./registry.js";

export interface RunSkillOptions {
	/** Additional CLI args */
	args?: Record<string, unknown>;
	/** LLM provider (required if skill.llm.required is true) */
	provider?: LLMProvider;
	/** Max depth for skill-to-skill invocation (prevents infinite recursion) */
	maxDepth?: number;
}

export interface RunSkillResult {
	content?: string;
}

/**
 * Execute a skill against a vault.
 * Resolves dependencies and runs them first if needed.
 */
export async function runSkill(
	root: string,
	skill: SkillDefinition,
	options: RunSkillOptions = {},
): Promise<RunSkillResult> {
	const manifest = await loadManifest(root);
	const config = await loadConfig(root);

	if (skill.llm?.required && !options.provider) {
		throw new Error(`Skill "${skill.name}" requires an LLM provider`);
	}

	// Resolve and run dependencies first
	if (skill.dependencies?.length) {
		const { loadSkills } = await import("./loader.js");
		const allSkills = await loadSkills(root);
		const deps = resolveSkillDependencies(skill, allSkills);
		// Run dependencies (all except the skill itself, which is last)
		for (const dep of deps.slice(0, -1)) {
			await runSkill(root, dep, options);
		}
	}

	const ctx = buildContext(root, manifest, config, options, skill);
	return skill.run(ctx);
}

function buildContext(
	root: string,
	manifest: Manifest,
	config: VaultConfig,
	options: RunSkillOptions,
	skill: SkillDefinition,
	depth = 0,
): SkillContext {
	const maxDepth = options.maxDepth ?? 5;

	return {
		vault: {
			async readIndex() {
				return readIndex(root);
			},
			async readGraph() {
				try {
					return await readFile(join(root, WIKI_DIR, "GRAPH.md"), "utf-8");
				} catch {
					return "";
				}
			},
			async readWiki() {
				const files = await listWiki(root);
				const articles: { title: string; slug: string; content: string }[] = [];
				for (const f of files) {
					if (f.endsWith("INDEX.md") || f.endsWith("GRAPH.md")) continue;
					const raw = await readFile(f, "utf-8");
					const { frontmatter, body } = parseFrontmatter(raw);
					articles.push({
						title: (frontmatter.title as string) ?? "",
						slug: (frontmatter.slug as string) ?? "",
						content: body,
					});
				}
				return articles;
			},
			async readRaw() {
				const files = await listRaw(root);
				const sources: { path: string; content: string }[] = [];
				for (const f of files) {
					const content = await readFile(f, "utf-8");
					sources.push({ path: f, content });
				}
				return sources;
			},
			async readFile(path: string) {
				return readFile(join(root, path), "utf-8");
			},
			async writeFile(path: string, content: string) {
				await writeWiki(root, path, content);
			},
			async listFiles(glob: string) {
				// Simple implementation — just list wiki files matching pattern
				const allFiles = await listWiki(root);
				if (!glob || glob === "*") return allFiles;
				return allFiles.filter((f) => f.includes(glob.replace("*", "")));
			},
			manifest,
			config,
		},

		llm: {
			async complete(params) {
				if (!options.provider) throw new Error("No LLM provider available");
				return options.provider.complete(params);
			},
			async *stream(params) {
				if (!options.provider) throw new Error("No LLM provider available");
				yield* options.provider.stream(params);
			},
		},

		search: {
			async query(term, opts) {
				const index = new SearchIndex();
				const loaded = await index.load(root);
				if (!loaded) await index.build(root, "wiki");
				return index.search(term, opts);
			},
		},

		async invoke(skillName: string, args?: Record<string, unknown>) {
			if (depth >= maxDepth) {
				throw new Error(
					`Skill invocation depth limit (${maxDepth}) reached. Possible circular invocation.`,
				);
			}

			const targetSkill = await findSkill(root, skillName);
			if (!targetSkill) {
				throw new Error(`Skill "${skillName}" not found`);
			}

			return runSkill(root, targetSkill, {
				...options,
				args: { ...options.args, ...args },
				maxDepth: maxDepth - depth,
			});
		},

		logger: {
			info: (msg) => console.log(`  [${skill.name}] ${msg}`),
			warn: (msg) => console.warn(`  [${skill.name}] ⚠ ${msg}`),
			error: (msg) => console.error(`  [${skill.name}] ✗ ${msg}`),
		},

		args: options.args ?? {},
	};
}
