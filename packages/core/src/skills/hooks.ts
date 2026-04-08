import type { LLMProvider, VaultConfig } from "../types.js";
import { loadSkills } from "./loader.js";
import { runSkill } from "./runner.js";
import type { SkillHook } from "./schema.js";

export interface HookResult {
	skill: string;
	content?: string;
	error?: string;
}

/**
 * Run all skills registered for a given hook event.
 *
 * Skills are discovered from two sources:
 *   1. Skills with `hooks` field in their definition (built-in or installed)
 *   2. Skills listed in `config.toml` under `[skills.hooks]`
 */
export async function runSkillHooks(
	root: string,
	hook: SkillHook,
	opts?: { provider?: LLMProvider; config?: VaultConfig },
): Promise<HookResult[]> {
	const allSkills = await loadSkills(root);
	const results: HookResult[] = [];

	// Collect skill names to run from both sources
	const skillNames = new Set<string>();

	// 1. Skills with hooks declared in their definition
	for (const skill of allSkills) {
		if (skill.hooks?.includes(hook)) {
			skillNames.add(skill.name);
		}
	}

	// 2. Skills listed in config.toml [skills.hooks]
	if (opts?.config?.skills?.hooks) {
		const configHooks = opts.config.skills.hooks[hook];
		if (configHooks) {
			for (const name of configHooks) {
				skillNames.add(name);
			}
		}
	}

	// Run each hook skill
	for (const name of skillNames) {
		const skill = allSkills.find((s) => s.name === name);
		if (!skill) {
			results.push({ skill: name, error: `Skill "${name}" not found` });
			continue;
		}

		try {
			const result = await runSkill(root, skill, { provider: opts?.provider });
			results.push({ skill: name, content: result.content });
		} catch (err) {
			results.push({ skill: name, error: (err as Error).message });
		}
	}

	return results;
}

/**
 * Get all skills registered for a given hook.
 */
export async function getHookedSkills(
	root: string,
	hook: SkillHook,
	config?: VaultConfig,
): Promise<string[]> {
	const allSkills = await loadSkills(root);
	const names = new Set<string>();

	for (const skill of allSkills) {
		if (skill.hooks?.includes(hook)) {
			names.add(skill.name);
		}
	}

	if (config?.skills?.hooks) {
		const configHooks = config.skills.hooks[hook];
		if (configHooks) {
			for (const name of configHooks) {
				names.add(name);
			}
		}
	}

	return [...names];
}
