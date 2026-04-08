import type { LLMProvider } from "@kibhq/core";
import {
	createProvider,
	loadConfig,
	NoProviderError,
	resolveVaultRoot,
	VaultNotFoundError,
} from "@kibhq/core";
import * as log from "../ui/logger.js";
import { setupProvider } from "../ui/setup-provider.js";
import { createSpinner } from "../ui/spinner.js";

interface SkillOpts {
	json?: boolean;
}

export async function skill(subcommand: string, name?: string, opts?: SkillOpts) {
	let root: string;
	try {
		root = resolveVaultRoot();
	} catch (err) {
		if (err instanceof VaultNotFoundError) {
			log.error(err.message);
			process.exit(1);
		}
		throw err;
	}

	const {
		loadSkills,
		findSkill,
		runSkill,
		installSkill,
		uninstallSkill,
		createSkill,
		publishSkill,
		listInstalledSkills,
	} = await import("@kibhq/core");

	switch (subcommand) {
		case "list": {
			const skills = await loadSkills(root);

			if (opts?.json) {
				console.log(
					JSON.stringify(
						skills.map((s) => ({ name: s.name, description: s.description })),
						null,
						2,
					),
				);
				break;
			}

			log.header("available skills");

			for (const s of skills) {
				console.log(`  ${s.name.padEnd(20)} ${s.description}`);
			}
			log.blank();
			log.dim(`Run a skill: kib skill run <name>`);
			log.blank();
			break;
		}

		case "run": {
			if (!name) {
				log.error("Skill name required. Usage: kib skill run <name>");
				process.exit(1);
			}

			const s = await findSkill(root, name);
			if (!s) {
				log.error(`Skill "${name}" not found. Run kib skill list to see available skills.`);
				process.exit(1);
			}

			if (!opts?.json) {
				log.header(`running skill: ${s.name}`);
			}

			let provider: LLMProvider | undefined;
			if (s.llm?.required) {
				const config = await loadConfig(root);
				const modelKey = s.llm.model === "fast" ? "fast_model" : "model";
				const model = config.provider[modelKey];
				try {
					provider = await createProvider(config.provider.default, model);
				} catch (err) {
					if (err instanceof NoProviderError) {
						provider = await setupProvider(root);
					} else {
						log.error((err as Error).message);
						process.exit(1);
					}
				}
			}

			const spinner = opts?.json ? null : createSpinner(`Running ${s.name}...`);
			spinner?.start();

			try {
				const result = await runSkill(root, s, { provider });

				if (opts?.json) {
					console.log(JSON.stringify({ skill: s.name, content: result.content ?? null }, null, 2));
					break;
				}

				spinner?.succeed(`${s.name} completed`);

				if (result.content) {
					log.blank();
					console.log(result.content);
					log.blank();
				}
			} catch (err) {
				spinner?.fail(`${s.name} failed`);
				log.error((err as Error).message);
				process.exit(1);
			}
			break;
		}

		case "install": {
			if (!name) {
				log.error(
					"Source required. Usage: kib skill install github:user/repo or kib skill install <npm-package>",
				);
				process.exit(1);
			}

			const spinner = opts?.json ? null : createSpinner(`Installing skill from ${name}...`);
			spinner?.start();

			try {
				const result = await installSkill(root, name);

				if (opts?.json) {
					console.log(JSON.stringify(result, null, 2));
					break;
				}

				spinner?.succeed(`Installed "${result.name}" v${result.version} from ${result.source}`);
				log.dim(`  Path: ${result.path}`);
				log.blank();
			} catch (err) {
				spinner?.fail("Install failed");
				log.error((err as Error).message);
				process.exit(1);
			}
			break;
		}

		case "uninstall":
		case "remove": {
			if (!name) {
				log.error("Skill name required. Usage: kib skill uninstall <name>");
				process.exit(1);
			}

			const spinner = opts?.json ? null : createSpinner(`Uninstalling "${name}"...`);
			spinner?.start();

			try {
				await uninstallSkill(root, name);

				if (opts?.json) {
					console.log(JSON.stringify({ uninstalled: name }, null, 2));
					break;
				}

				spinner?.succeed(`Uninstalled "${name}"`);
				log.blank();
			} catch (err) {
				spinner?.fail("Uninstall failed");
				log.error((err as Error).message);
				process.exit(1);
			}
			break;
		}

		case "create": {
			if (!name) {
				log.error("Skill name required. Usage: kib skill create <name>");
				process.exit(1);
			}

			const spinner = opts?.json ? null : createSpinner(`Creating skill "${name}"...`);
			spinner?.start();

			try {
				const path = await createSkill(root, name);

				if (opts?.json) {
					console.log(JSON.stringify({ name, path }, null, 2));
					break;
				}

				spinner?.succeed(`Created skill "${name}"`);
				log.dim(`  Path: ${path}`);
				log.dim("  Edit index.ts to implement your skill logic.");
				log.blank();
			} catch (err) {
				spinner?.fail("Create failed");
				log.error((err as Error).message);
				process.exit(1);
			}
			break;
		}

		case "publish": {
			if (!name) {
				log.error("Skill name required. Usage: kib skill publish <name>");
				process.exit(1);
			}

			const spinner = opts?.json ? null : createSpinner(`Validating skill "${name}"...`);
			spinner?.start();

			try {
				const path = await publishSkill(root, name);

				if (opts?.json) {
					console.log(JSON.stringify({ name, path, valid: true }, null, 2));
					break;
				}

				spinner?.succeed(`Skill "${name}" is valid and ready to publish`);
				log.dim(`  Path: ${path}`);
				log.dim("  To publish to npm: cd <path> && npm publish");
				log.blank();
			} catch (err) {
				spinner?.fail("Publish validation failed");
				log.error((err as Error).message);
				process.exit(1);
			}
			break;
		}

		case "installed": {
			const installed = await listInstalledSkills(root);

			if (opts?.json) {
				console.log(JSON.stringify(installed, null, 2));
				break;
			}

			if (installed.length === 0) {
				log.info("No installed skills. Use kib skill install to add some.");
				break;
			}

			log.header("installed skills");
			for (const s of installed) {
				console.log(`  ${s.name.padEnd(20)} ${s.path}`);
			}
			log.blank();
			break;
		}

		default:
			log.error(`Unknown subcommand: ${subcommand}`);
			log.dim("Available: list, run, install, uninstall, create, publish, installed");
			process.exit(1);
	}
}
