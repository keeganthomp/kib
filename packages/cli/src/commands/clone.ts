import { basename, resolve } from "node:path";
import * as log from "../ui/logger.js";
import { createSpinner } from "../ui/spinner.js";

interface CloneOpts {
	json?: boolean;
}

export async function clone(remoteUrl: string, dir: string | undefined, opts: CloneOpts) {
	if (!remoteUrl) {
		log.error("Usage: kib clone <remote-url> [directory]");
		process.exit(1);
	}

	// Default dir name from URL: git@github.com:user/my-vault.git → my-vault
	const defaultDir = basename(remoteUrl, ".git").replace(/[^a-zA-Z0-9_-]/g, "-");
	const targetDir = resolve(dir ?? defaultDir);

	const spinner = opts.json ? null : createSpinner("Cloning shared vault...");
	spinner?.start();

	try {
		const { cloneVault, loadManifest, loadConfig } = await import("@kibhq/core");
		const root = await cloneVault(remoteUrl, targetDir);
		const manifest = await loadManifest(root);
		const config = await loadConfig(root);

		spinner?.stop();

		if (opts.json) {
			console.log(
				JSON.stringify(
					{
						path: root,
						vault: manifest.vault.name,
						sources: Object.keys(manifest.sources).length,
						articles: Object.keys(manifest.articles).length,
					},
					null,
					2,
				),
			);
			return;
		}

		const sourceCount = Object.keys(manifest.sources).length;
		const articleCount = Object.keys(manifest.articles).length;

		log.header("vault cloned");
		log.success(`Path: ${root}`);
		log.success(`Vault: ${manifest.vault.name}`);
		log.success(`Provider: ${config.provider.default} (${config.provider.model})`);
		log.keyValue("sources", `${sourceCount}`);
		log.keyValue("articles", `${articleCount}`);
		log.blank();
		log.dim("start working:");
		log.dim(`  cd ${targetDir}`);
		log.dim("  kib ingest <source>     — add content");
		log.dim("  kib pull                — get latest");
		log.dim("  kib push                — share changes");
		log.blank();
	} catch (err) {
		spinner?.stop();
		log.error((err as Error).message);
		process.exit(1);
	}
}
