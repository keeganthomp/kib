import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { RAW_DIR, WIKI_DIR } from "./constants.js";
import type { Manifest } from "./types.js";

export interface IntegrityIssue {
	severity: "error" | "warning";
	category: "missing_file" | "orphan_file" | "stats_mismatch" | "broken_reference";
	message: string;
	path?: string;
}

/**
 * Validate manifest integrity against the actual filesystem state.
 * Checks that all referenced files exist, stats are correct, and
 * there are no orphaned entries.
 */
export async function validateManifestIntegrity(
	root: string,
	manifest: Manifest,
): Promise<IntegrityIssue[]> {
	const issues: IntegrityIssue[] = [];

	// Check source files exist on disk
	for (const [sourceId, source] of Object.entries(manifest.sources)) {
		const rawPath = deriveRawPath(source.metadata.title ?? sourceId, source.sourceType);
		const sourcePath = join(root, RAW_DIR, rawPath);
		if (!existsSync(sourcePath)) {
			issues.push({
				severity: "error",
				category: "missing_file",
				message: `Source file missing from disk: ${sourceId} (expected ${rawPath})`,
				path: sourcePath,
			});
		}

		// Check that produced articles exist in the manifest
		for (const articleSlug of source.producedArticles) {
			if (!manifest.articles[articleSlug]) {
				issues.push({
					severity: "warning",
					category: "broken_reference",
					message: `Source "${sourceId}" references article "${articleSlug}" which doesn't exist in manifest`,
					path: sourceId,
				});
			}
		}
	}

	// Check article files exist on disk
	for (const [slug, article] of Object.entries(manifest.articles)) {
		const found = await findArticleFile(root, slug);
		if (!found) {
			issues.push({
				severity: "error",
				category: "missing_file",
				message: `Article file missing from disk: ${slug}`,
				path: slug,
			});
		}

		// Check that derivedFrom sources exist
		for (const sourceId of article.derivedFrom) {
			if (!manifest.sources[sourceId]) {
				issues.push({
					severity: "warning",
					category: "broken_reference",
					message: `Article "${slug}" references source "${sourceId}" which doesn't exist in manifest`,
					path: slug,
				});
			}
		}
	}

	// Validate stats match reality
	const actualSourceCount = Object.keys(manifest.sources).length;
	const actualArticleCount = Object.keys(manifest.articles).length;
	const actualWordCount = Object.values(manifest.articles).reduce((sum, a) => sum + a.wordCount, 0);

	if (manifest.stats.totalSources !== actualSourceCount) {
		issues.push({
			severity: "warning",
			category: "stats_mismatch",
			message: `Stats say ${manifest.stats.totalSources} sources, but manifest has ${actualSourceCount}`,
		});
	}

	if (manifest.stats.totalArticles !== actualArticleCount) {
		issues.push({
			severity: "warning",
			category: "stats_mismatch",
			message: `Stats say ${manifest.stats.totalArticles} articles, but manifest has ${actualArticleCount}`,
		});
	}

	if (manifest.stats.totalWords !== actualWordCount) {
		issues.push({
			severity: "warning",
			category: "stats_mismatch",
			message: `Stats say ${manifest.stats.totalWords} words, but article entries sum to ${actualWordCount}`,
		});
	}

	return issues;
}

// ─── Helpers ────────────────────────────────────────────────────

/**
 * Derive the raw file path from source metadata, matching ingest's naming convention.
 */
function deriveRawPath(title: string, sourceType: string): string {
	const slug = title
		.toLowerCase()
		.replace(/[^a-z0-9\s-]/g, "")
		.replace(/\s+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "")
		.slice(0, 80);

	const category =
		sourceType === "pdf"
			? "papers"
			: sourceType === "youtube"
				? "transcripts"
				: sourceType === "github"
					? "repos"
					: sourceType === "image"
						? "images"
						: "articles";

	return `${category}/${slug}.md`;
}

/**
 * Find an article file by slug. Articles can be in any category subdirectory.
 */
async function findArticleFile(root: string, slug: string): Promise<string | null> {
	const wikiDir = join(root, WIKI_DIR);
	const filename = `${slug}.md`;

	try {
		const categories = await readdir(wikiDir, { withFileTypes: true });
		for (const cat of categories) {
			if (!cat.isDirectory()) continue;
			const filePath = join(wikiDir, cat.name, filename);
			if (existsSync(filePath)) return filePath;
		}
	} catch {
		// wiki dir might not exist
	}

	return null;
}
