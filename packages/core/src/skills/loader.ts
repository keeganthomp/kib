import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { SKILLS_DIR, VAULT_DIR } from "../constants.js";
import type { SkillDefinition } from "../types.js";
import { getBuiltinSkills } from "./builtins.js";
import { SkillDefinitionSchema, SkillPackageSchema } from "./schema.js";

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
export async function findSkill(root: string, name: string): Promise<SkillDefinition | null> {
	const skills = await loadSkills(root);
	return skills.find((s) => s.name === name) ?? null;
}

/**
 * Load user-installed skills from .kb/skills/.
 * Supports both single-file skills and directory-based packages.
 */
async function loadInstalledSkills(root: string): Promise<SkillDefinition[]> {
	const skillsDir = join(root, VAULT_DIR, SKILLS_DIR);
	if (!existsSync(skillsDir)) return [];

	const entries = await readdir(skillsDir, { withFileTypes: true });
	const skills: SkillDefinition[] = [];

	for (const entry of entries) {
		try {
			if (entry.isDirectory()) {
				// Directory-based skill — look for skill.json or index.ts/index.js
				const skill = await loadDirectorySkill(join(skillsDir, entry.name));
				if (skill) skills.push(skill);
			} else if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".js"))) {
				// Single-file skill
				const skill = await loadSingleFileSkill(join(skillsDir, entry.name));
				if (skill) skills.push(skill);
			}
		} catch {
			// Skip malformed skills
		}
	}

	return skills;
}

async function loadDirectorySkill(dir: string): Promise<SkillDefinition | null> {
	// Check for skill.json to find entry point
	const skillJsonPath = join(dir, "skill.json");
	let entryPoint = "index.ts";

	if (existsSync(skillJsonPath)) {
		const raw = await readFile(skillJsonPath, "utf-8");
		const pkg = SkillPackageSchema.safeParse(JSON.parse(raw));
		if (pkg.success && pkg.data.main) {
			entryPoint = pkg.data.main;
		}
	}

	// Try the entry point, fallback to common alternatives
	const candidates = [join(dir, entryPoint), join(dir, "index.ts"), join(dir, "index.js")];

	for (const candidate of candidates) {
		if (existsSync(candidate)) {
			return loadSingleFileSkill(candidate);
		}
	}

	return null;
}

async function loadSingleFileSkill(filePath: string): Promise<SkillDefinition | null> {
	const mod = await import(filePath);
	const definition = mod.default ?? mod;

	const parsed = SkillDefinitionSchema.safeParse(definition);
	if (!parsed.success) return null;

	return {
		...definition,
		run: definition.run,
	};
}
