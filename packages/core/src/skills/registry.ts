import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { SKILLS_DIR, VAULT_DIR } from "../constants.js";
import type { SkillDefinition } from "../types.js";
import { SkillDefinitionSchema, SkillPackageSchema } from "./schema.js";

export interface InstallResult {
	name: string;
	version: string;
	source: "github" | "npm" | "local";
	path: string;
}

/**
 * Install a skill from GitHub or npm.
 *
 * Supported formats:
 *   - `github:user/repo` — clone from GitHub
 *   - `<npm-package>` — install from npm
 */
export async function installSkill(root: string, source: string): Promise<InstallResult> {
	const skillsDir = join(root, VAULT_DIR, SKILLS_DIR);
	await mkdir(skillsDir, { recursive: true });

	if (source.startsWith("github:")) {
		return installFromGitHub(root, source.slice(7), skillsDir);
	}

	return installFromNpm(root, source, skillsDir);
}

/**
 * Uninstall a skill by name.
 */
export async function uninstallSkill(root: string, name: string): Promise<void> {
	const skillsDir = join(root, VAULT_DIR, SKILLS_DIR);
	const skillDir = join(skillsDir, name);

	if (!existsSync(skillDir)) {
		// Try single-file skills
		const singleFile = join(skillsDir, `${name}.ts`);
		const singleFileJs = join(skillsDir, `${name}.js`);
		if (existsSync(singleFile)) {
			await rm(singleFile);
			return;
		}
		if (existsSync(singleFileJs)) {
			await rm(singleFileJs);
			return;
		}
		throw new Error(`Skill "${name}" is not installed`);
	}

	await rm(skillDir, { recursive: true, force: true });
}

/**
 * Scaffold a new skill from a template.
 */
export async function createSkill(
	root: string,
	name: string,
	opts?: { author?: string },
): Promise<string> {
	const skillsDir = join(root, VAULT_DIR, SKILLS_DIR);
	await mkdir(skillsDir, { recursive: true });

	const skillDir = join(skillsDir, name);
	if (existsSync(skillDir)) {
		throw new Error(`Skill "${name}" already exists at ${skillDir}`);
	}

	await mkdir(skillDir, { recursive: true });

	const packageJson = {
		name,
		version: "1.0.0",
		description: `Custom skill: ${name}`,
		author: opts?.author ?? "",
		main: "index.ts",
	};

	await writeFile(join(skillDir, "skill.json"), JSON.stringify(packageJson, null, 2));

	const template = `import type { SkillContext } from "@kibhq/core";

export default {
  name: "${name}",
  version: "1.0.0",
  description: "TODO: describe what this skill does",
  author: "${opts?.author ?? ""}",

  input: "wiki" as const,
  output: "report" as const,

  llm: {
    required: true,
    model: "default" as const,
    systemPrompt: "You are a helpful assistant. Analyze the provided content and produce a report.",
    maxTokens: 4096,
    temperature: 0,
  },

  async run(ctx: SkillContext) {
    const articles = await ctx.vault.readWiki();
    if (articles.length === 0) {
      ctx.logger.warn("No articles found.");
      return {};
    }

    const content = articles
      .map((a) => \`# \${a.title}\\n\\n\${a.content}\`)
      .join("\\n\\n---\\n\\n");

    const result = await ctx.llm.complete({
      system: this.llm!.systemPrompt,
      messages: [{ role: "user", content }],
      maxTokens: this.llm!.maxTokens,
      temperature: this.llm!.temperature,
    });

    return { content: result.content };
  },
};
`;

	await writeFile(join(skillDir, "index.ts"), template);

	return skillDir;
}

/**
 * Generate a publishable skill package from the skill directory.
 * Returns the path to the package tarball directory.
 */
export async function publishSkill(root: string, name: string): Promise<string> {
	const skillsDir = join(root, VAULT_DIR, SKILLS_DIR);
	const skillDir = join(skillsDir, name);

	if (!existsSync(skillDir)) {
		throw new Error(`Skill "${name}" not found at ${skillDir}`);
	}

	const packagePath = join(skillDir, "skill.json");
	if (!existsSync(packagePath)) {
		throw new Error(`No skill.json found in ${skillDir}. Run "kib skill create" first.`);
	}

	const raw = await readFile(packagePath, "utf-8");
	const pkg = SkillPackageSchema.parse(JSON.parse(raw));

	// Validate the skill loads correctly
	const mainPath = join(skillDir, pkg.main);
	if (!existsSync(mainPath)) {
		throw new Error(`Skill entry point "${pkg.main}" not found`);
	}

	const mod = await import(mainPath);
	const definition = mod.default ?? mod;
	const parsed = SkillDefinitionSchema.safeParse(definition);
	if (!parsed.success) {
		throw new Error(`Skill validation failed: ${parsed.error.message}`);
	}

	// Return the directory — actual publishing to npm/registry is handled by the CLI
	return skillDir;
}

/**
 * List installed skills (metadata only, no loading).
 */
export async function listInstalledSkills(root: string): Promise<{ name: string; path: string }[]> {
	const skillsDir = join(root, VAULT_DIR, SKILLS_DIR);
	if (!existsSync(skillsDir)) return [];

	const entries = await readdir(skillsDir, { withFileTypes: true });
	const results: { name: string; path: string }[] = [];

	for (const entry of entries) {
		if (entry.isDirectory()) {
			results.push({ name: entry.name, path: join(skillsDir, entry.name) });
		} else if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".js"))) {
			results.push({
				name: entry.name.replace(/\.(ts|js)$/, ""),
				path: join(skillsDir, entry.name),
			});
		}
	}

	return results;
}

/**
 * Resolve skill dependencies — returns skills in execution order.
 * Throws on circular dependencies.
 */
export function resolveSkillDependencies(
	skill: SkillDefinition,
	allSkills: SkillDefinition[],
): SkillDefinition[] {
	const resolved: SkillDefinition[] = [];
	const seen = new Set<string>();

	function visit(s: SkillDefinition, chain: Set<string>) {
		if (seen.has(s.name)) return;
		if (chain.has(s.name)) {
			throw new Error(`Circular skill dependency: ${[...chain, s.name].join(" → ")}`);
		}

		chain.add(s.name);

		for (const dep of s.dependencies ?? []) {
			const depSkill = allSkills.find((sk) => sk.name === dep);
			if (!depSkill) {
				throw new Error(`Skill "${s.name}" depends on "${dep}", which was not found`);
			}
			visit(depSkill, new Set(chain));
		}

		chain.delete(s.name);
		seen.add(s.name);
		resolved.push(s);
	}

	visit(skill, new Set());
	return resolved;
}

// ─── Private helpers ────────────────────────────────────────────

async function installFromGitHub(
	_root: string,
	repo: string,
	skillsDir: string,
): Promise<InstallResult> {
	// repo format: "user/repo" or "user/repo#branch"
	const [repoPath, branch] = repo.split("#") as [string, string | undefined];
	const parts = repoPath.split("/");
	if (parts.length !== 2 || !parts[1]) {
		throw new Error(`Invalid GitHub repo format: "${repo}". Expected "user/repo"`);
	}

	const repoName: string = parts[1];
	const destDir = join(skillsDir, repoName);

	if (existsSync(destDir)) {
		throw new Error(`Skill "${repoName}" is already installed. Uninstall first.`);
	}

	const url = `https://github.com/${repoPath}.git`;
	const args = ["git", "clone", "--depth", "1"];
	if (branch) args.push("--branch", branch);
	args.push(url, destDir);

	const proc = Bun.spawn(args, { stdout: "pipe", stderr: "pipe" });
	const exitCode = await proc.exited;

	if (exitCode !== 0) {
		const stderr = await new Response(proc.stderr).text();
		throw new Error(`Failed to clone ${url}: ${stderr.trim()}`);
	}

	// Clean up .git directory — we don't need it
	const gitDir = join(destDir, ".git");
	if (existsSync(gitDir)) {
		await rm(gitDir, { recursive: true, force: true });
	}

	// Read skill metadata
	const pkgPath = join(destDir, "skill.json");
	let name = repoName;
	let version = "1.0.0";

	if (existsSync(pkgPath)) {
		const raw = await readFile(pkgPath, "utf-8");
		const pkg = SkillPackageSchema.safeParse(JSON.parse(raw));
		if (pkg.success) {
			name = pkg.data.name;
			version = pkg.data.version;
		}
	}

	return { name, version, source: "github", path: destDir };
}

async function installFromNpm(
	_root: string,
	packageName: string,
	skillsDir: string,
): Promise<InstallResult> {
	// Use bun to install the package into the skills directory
	const destDir = join(skillsDir, packageName.replace(/^@/, "").replace("/", "-"));

	if (existsSync(destDir)) {
		throw new Error(`Skill "${packageName}" is already installed. Uninstall first.`);
	}

	await mkdir(destDir, { recursive: true });

	// Initialize a minimal package.json so bun can install into it
	await writeFile(
		join(destDir, "package.json"),
		JSON.stringify({ name: "kib-skill-wrapper", private: true, dependencies: {} }),
	);

	const proc = Bun.spawn(["bun", "add", packageName], {
		cwd: destDir,
		stdout: "pipe",
		stderr: "pipe",
	});
	const exitCode = await proc.exited;

	if (exitCode !== 0) {
		await rm(destDir, { recursive: true, force: true });
		const stderr = await new Response(proc.stderr).text();
		throw new Error(`Failed to install ${packageName}: ${stderr.trim()}`);
	}

	// Find the installed package
	const nodeModulesDir = join(destDir, "node_modules", packageName);
	let name = packageName;
	let version = "1.0.0";

	// Check for skill.json or package.json for metadata
	const skillJsonPath = join(nodeModulesDir, "skill.json");
	const pkgJsonPath = join(nodeModulesDir, "package.json");

	if (existsSync(skillJsonPath)) {
		const raw = await readFile(skillJsonPath, "utf-8");
		const pkg = SkillPackageSchema.safeParse(JSON.parse(raw));
		if (pkg.success) {
			name = pkg.data.name;
			version = pkg.data.version;
		}
	} else if (existsSync(pkgJsonPath)) {
		const raw = await readFile(pkgJsonPath, "utf-8");
		const pkg = JSON.parse(raw);
		name = pkg.name ?? packageName;
		version = pkg.version ?? "1.0.0";
	}

	return { name, version, source: "npm", path: destDir };
}
