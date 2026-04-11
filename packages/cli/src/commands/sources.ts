import { loadManifest, resolveVaultRoot, VaultNotFoundError } from "@kibhq/core";
import chalk from "chalk";
import * as log from "../ui/logger.js";

interface SourcesOpts {
	status?: string;
	json?: boolean;
	limit?: number;
}

const STATUS_COLORS: Record<string, (s: string) => string> = {
	queued: chalk.gray,
	extracting: chalk.blue,
	ingested: chalk.yellow,
	compiling: chalk.magenta,
	compiled: chalk.green,
	enriched: chalk.cyan,
	failed: chalk.red,
};

const STATUS_ICONS: Record<string, string> = {
	queued: "○",
	extracting: "◐",
	ingested: "◑",
	compiling: "◒",
	compiled: "●",
	enriched: "◉",
	failed: "✗",
};

export async function sources(opts: SourcesOpts) {
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

	const limit = opts.limit ?? 50;

	// Try to use pipeline DB for real-time status
	let usePipelineDB = false;
	let pipelineDB: import("@kibhq/core/src/pipeline/db.js").PipelineDB | null = null;

	try {
		const { openPipelineDB, syncManifestToPipeline } = await import("@kibhq/core");
		pipelineDB = openPipelineDB(root);
		// Bootstrap: sync manifest entries into pipeline DB on first use
		await syncManifestToPipeline(root, pipelineDB);
		usePipelineDB = true;
	} catch {
		// Fallback to manifest-only mode
	}

	if (usePipelineDB && pipelineDB) {
		return showPipelineSources(pipelineDB, opts, limit);
	}

	// Fallback: derive status from manifest
	return showManifestSources(root, opts, limit);
}

async function showPipelineSources(
	pipelineDB: import("@kibhq/core/src/pipeline/db.js").PipelineDB,
	opts: SourcesOpts,
	limit: number,
) {
	const stats = pipelineDB.stats();

	if (opts.json) {
		const allSources = opts.status
			? pipelineDB.listByStatus(
					opts.status as import("@kibhq/core/src/pipeline/db.js").SourceStatus,
					limit,
				)
			: pipelineDB.listAll(limit);
		console.log(JSON.stringify({ stats, sources: allSources }, null, 2));
		pipelineDB.close();
		return;
	}

	log.header("source pipeline");

	// Status summary bar
	const statusParts: string[] = [];
	if (stats.queued > 0) statusParts.push(chalk.gray(`${stats.queued} queued`));
	if (stats.extracting > 0) statusParts.push(chalk.blue(`${stats.extracting} extracting`));
	if (stats.ingested > 0) statusParts.push(chalk.yellow(`${stats.ingested} pending compile`));
	if (stats.compiling > 0) statusParts.push(chalk.magenta(`${stats.compiling} compiling`));
	if (stats.compiled > 0) statusParts.push(chalk.green(`${stats.compiled} compiled`));
	if (stats.enriched > 0) statusParts.push(chalk.cyan(`${stats.enriched} ready`));
	if (stats.failed > 0) statusParts.push(chalk.red(`${stats.failed} failed`));

	log.keyValue("TOTAL", `${stats.total} sources`);
	if (statusParts.length > 0) {
		console.log(`  ${statusParts.join(chalk.dim(" · "))}`);
	}

	if (stats.total_input_tokens > 0) {
		const totalTokens = stats.total_input_tokens + stats.total_output_tokens;
		log.dim(
			`${totalTokens.toLocaleString()} total tokens (${stats.total_input_tokens.toLocaleString()} in / ${stats.total_output_tokens.toLocaleString()} out)`,
		);
	}
	log.blank();

	// Source list
	const allSources = opts.status
		? pipelineDB.listByStatus(
				opts.status as import("@kibhq/core/src/pipeline/db.js").SourceStatus,
				limit,
			)
		: pipelineDB.listAll(limit);

	if (allSources.length === 0) {
		log.dim("No sources found. Ingest something with: kib ingest <url>");
		pipelineDB.close();
		return;
	}

	for (const src of allSources) {
		const statusColor = STATUS_COLORS[src.status] ?? chalk.white;
		const icon = STATUS_ICONS[src.status] ?? "?";
		const title = src.title ?? src.uri;
		const truncTitle = title.length > 50 ? `${title.slice(0, 47)}...` : title;
		const type = src.source_type ? chalk.dim(`[${src.source_type}]`) : "";
		const articles =
			src.articles_produced > 0 ? chalk.dim(`→ ${src.articles_produced} articles`) : "";

		console.log(`  ${statusColor(icon)} ${truncTitle} ${type} ${articles}`);

		// Show error for failed sources
		if (src.status === "failed" && src.error) {
			console.log(`    ${chalk.red(chalk.dim(src.error.slice(0, 80)))}`);
		}
	}

	log.blank();
	pipelineDB.close();
}

async function showManifestSources(root: string, opts: SourcesOpts, limit: number) {
	const manifest = await loadManifest(root);
	const entries = Object.entries(manifest.sources);

	if (opts.json) {
		const sources = entries.slice(0, limit).map(([id, src]) => ({
			id,
			title: src.metadata.title ?? id,
			sourceType: src.sourceType,
			status: src.lastCompiled ? "compiled" : "ingested",
			wordCount: src.metadata.wordCount,
			ingestedAt: src.ingestedAt,
			lastCompiled: src.lastCompiled,
			articles: src.producedArticles.length,
		}));
		console.log(JSON.stringify({ total: entries.length, sources }, null, 2));
		return;
	}

	log.header("sources");

	const compiled = entries.filter(([, s]) => s.lastCompiled).length;
	const pending = entries.length - compiled;

	log.keyValue("TOTAL", `${entries.length} sources`);
	if (compiled > 0) log.keyValue("COMPILED", `${compiled}`);
	if (pending > 0) log.keyValue("PENDING", chalk.yellow(`${pending}`));
	log.blank();

	// Sort by ingestedAt descending
	const sorted = entries.sort(
		([, a], [, b]) => new Date(b.ingestedAt).getTime() - new Date(a.ingestedAt).getTime(),
	);

	for (const [, src] of sorted.slice(0, limit)) {
		const status = src.lastCompiled ? "compiled" : "ingested";
		const statusColor = STATUS_COLORS[status] ?? chalk.white;
		const icon = STATUS_ICONS[status] ?? "?";
		const title = src.metadata.title ?? "Untitled";
		const truncTitle = title.length > 50 ? `${title.slice(0, 47)}...` : title;
		const type = chalk.dim(`[${src.sourceType}]`);
		const articles =
			src.producedArticles.length > 0 ? chalk.dim(`→ ${src.producedArticles.length} articles`) : "";

		console.log(`  ${statusColor(icon)} ${truncTitle} ${type} ${articles}`);
	}

	if (entries.length > limit) {
		log.blank();
		log.dim(`Showing ${limit} of ${entries.length} sources. Use --limit to see more.`);
	}

	log.blank();
}
