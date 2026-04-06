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

export async function skill(subcommand: string, name?: string, _opts?: unknown) {
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

	const { loadSkills, findSkill, runSkill } = await import("@kibhq/core");

	switch (subcommand) {
		case "list": {
			log.header("available skills");

			const skills = await loadSkills(root);

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

			log.header(`running skill: ${s.name}`);

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

			const spinner = createSpinner(`Running ${s.name}...`);
			spinner.start();

			try {
				const result = await runSkill(root, s, { provider });
				spinner.succeed(`${s.name} completed`);

				if (result.content) {
					log.blank();
					console.log(result.content);
					log.blank();
				}
			} catch (err) {
				spinner.fail(`${s.name} failed`);
				log.error((err as Error).message);
				process.exit(1);
			}
			break;
		}

		default:
			log.error(`Unknown subcommand: ${subcommand}`);
			log.dim("Available: list, run");
			process.exit(1);
	}
}
