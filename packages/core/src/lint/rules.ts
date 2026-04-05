import { readFile } from "node:fs/promises";
import { relative } from "node:path";
import { WIKI_DIR } from "../constants.js";
import type { LintDiagnostic, Manifest } from "../types.js";
import { listWiki } from "../vault.js";
import { extractWikilinks, parseFrontmatter } from "../compile/diff.js";

type LintRuleFn = (root: string, manifest: Manifest) => Promise<LintDiagnostic[]>;

/**
 * Find articles with no backlinks from other articles (orphans).
 */
export const orphanRule: LintRuleFn = async (root, manifest) => {
	const diagnostics: LintDiagnostic[] = [];

	for (const [slug, article] of Object.entries(manifest.articles)) {
		if (article.backlinks.length === 0 && article.category !== "output") {
			diagnostics.push({
				rule: "orphan",
				severity: "warning",
				message: `No backlinks from other articles`,
				path: `wiki/${article.category}s/${slug}.md`,
				fixable: false,
			});
		}
	}

	return diagnostics;
};

/**
 * Find [[wikilinks]] that point to non-existent articles.
 */
export const brokenLinkRule: LintRuleFn = async (root, manifest) => {
	const diagnostics: LintDiagnostic[] = [];
	const wikiDir = `${root}/${WIKI_DIR}`;
	const files = await listWiki(root);
	const articleFiles = files.filter(
		(f) => !f.endsWith("INDEX.md") && !f.endsWith("GRAPH.md"),
	);

	// Build set of known slugs
	const knownSlugs = new Set(Object.keys(manifest.articles));

	for (const filePath of articleFiles) {
		const content = await readFile(filePath, "utf-8");
		const links = extractWikilinks(content);
		const relPath = relative(wikiDir, filePath);

		for (const link of links) {
			if (!knownSlugs.has(link)) {
				diagnostics.push({
					rule: "broken-link",
					severity: "error",
					message: `Broken wikilink [[${link}]] — no article with this slug exists`,
					path: relPath,
					fixable: false,
				});
			}
		}
	}

	return diagnostics;
};

/**
 * Find sources whose content hash changed but article hasn't been recompiled.
 */
export const staleRule: LintRuleFn = async (_root, manifest) => {
	const diagnostics: LintDiagnostic[] = [];

	for (const [sourceId, source] of Object.entries(manifest.sources)) {
		if (!source.lastCompiled || source.lastCompiled < source.ingestedAt) {
			diagnostics.push({
				rule: "stale",
				severity: "warning",
				message: `Source "${source.metadata.title ?? sourceId}" has not been compiled since last ingest`,
				path: source.producedArticles[0],
				fixable: true,
			});
		}
	}

	return diagnostics;
};

/**
 * Find articles with missing or malformed YAML frontmatter.
 */
export const frontmatterRule: LintRuleFn = async (root) => {
	const diagnostics: LintDiagnostic[] = [];
	const wikiDir = `${root}/${WIKI_DIR}`;
	const files = await listWiki(root);
	const articleFiles = files.filter(
		(f) => !f.endsWith("INDEX.md") && !f.endsWith("GRAPH.md"),
	);

	const requiredFields = ["title", "slug", "category"];

	for (const filePath of articleFiles) {
		const content = await readFile(filePath, "utf-8");
		const relPath = relative(wikiDir, filePath);

		// Check if frontmatter exists at all
		if (!content.startsWith("---")) {
			diagnostics.push({
				rule: "frontmatter",
				severity: "error",
				message: "Missing YAML frontmatter",
				path: relPath,
				fixable: false,
			});
			continue;
		}

		const { frontmatter } = parseFrontmatter(content);

		for (const field of requiredFields) {
			if (!frontmatter[field]) {
				diagnostics.push({
					rule: "frontmatter",
					severity: "error",
					message: `Missing required frontmatter field: ${field}`,
					path: relPath,
					fixable: false,
				});
			}
		}
	}

	return diagnostics;
};

/**
 * Find concepts/topics mentioned across multiple articles that don't have their own article.
 */
export const missingRule: LintRuleFn = async (root, manifest) => {
	const diagnostics: LintDiagnostic[] = [];
	const wikiDir = `${root}/${WIKI_DIR}`;
	const files = await listWiki(root);
	const articleFiles = files.filter(
		(f) => !f.endsWith("INDEX.md") && !f.endsWith("GRAPH.md"),
	);

	// Collect all wikilinks across all articles
	const linkCounts = new Map<string, number>();
	const knownSlugs = new Set(Object.keys(manifest.articles));

	for (const filePath of articleFiles) {
		const content = await readFile(filePath, "utf-8");
		const links = extractWikilinks(content);

		for (const link of links) {
			if (!knownSlugs.has(link)) {
				linkCounts.set(link, (linkCounts.get(link) ?? 0) + 1);
			}
		}
	}

	// Report topics mentioned in 3+ articles without a dedicated article
	for (const [slug, count] of linkCounts) {
		if (count >= 3) {
			diagnostics.push({
				rule: "missing",
				severity: "info",
				message: `"${slug}" is referenced in ${count} articles but has no dedicated article`,
				fixable: true,
			});
		}
	}

	return diagnostics;
};

/**
 * All lint rules.
 */
export const ALL_RULES: { name: string; fn: LintRuleFn }[] = [
	{ name: "orphan", fn: orphanRule },
	{ name: "broken-link", fn: brokenLinkRule },
	{ name: "stale", fn: staleRule },
	{ name: "frontmatter", fn: frontmatterRule },
	{ name: "missing", fn: missingRule },
];
