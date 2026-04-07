import { loadConfig, loadManifest, resolveVaultRoot, VaultNotFoundError } from "@kibhq/core";
import * as log from "../ui/logger.js";

interface StatusOpts {
	json?: boolean;
}

export async function status(opts: StatusOpts) {
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

	const manifest = await loadManifest(root);
	const config = await loadConfig(root);

	const sourceCount = Object.keys(manifest.sources).length;
	const articleCount = Object.keys(manifest.articles).length;
	const pendingCount = Object.values(manifest.sources).filter(
		(s) => !s.lastCompiled || s.lastCompiled < s.ingestedAt,
	).length;

	if (opts.json) {
		console.log(
			JSON.stringify(
				{
					vault: manifest.vault.name,
					path: root,
					provider: config.provider.default,
					model: config.provider.model,
					sources: sourceCount,
					articles: articleCount,
					pendingCompilation: pendingCount,
					totalWords: manifest.stats.totalWords,
					lastCompiled: manifest.vault.lastCompiled,
					lastLint: manifest.stats.lastLintAt,
				},
				null,
				2,
			),
		);
		return;
	}

	log.header("vault status");

	log.keyValue("vault", manifest.vault.name);
	log.keyValue("provider", `${config.provider.default} (${config.provider.model})`);
	log.keyValue("path", root);
	log.blank();

	log.keyValue(
		"SOURCES",
		`${sourceCount} total${pendingCount > 0 ? ` | ${pendingCount} pending compilation` : ""}`,
	);
	log.keyValue(
		"ARTICLES",
		`${articleCount} total | ${manifest.stats.totalWords.toLocaleString()} words`,
	);

	if (manifest.vault.lastCompiled) {
		const ago = timeAgo(new Date(manifest.vault.lastCompiled));
		log.keyValue("LAST COMPILED", ago);
	} else {
		log.keyValue("LAST COMPILED", "never");
	}

	if (manifest.stats.lastLintAt) {
		const ago = timeAgo(new Date(manifest.stats.lastLintAt));
		log.keyValue("LAST LINT", ago);
	}

	if (pendingCount > 0) {
		log.blank();
		log.warn(`${pendingCount} sources pending — run kib compile`);
	}

	log.blank();
}

function timeAgo(date: Date): string {
	const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
	if (seconds < 60) return "just now";
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
	const days = Math.floor(hours / 24);
	return `${days} day${days === 1 ? "" : "s"} ago`;
}
