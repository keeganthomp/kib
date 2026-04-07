import { readFile } from "node:fs/promises";
import { listWiki } from "../vault.js";
import { extractWikilinks, parseFrontmatter } from "./diff.js";

export interface LinkGraph {
	/** slug → set of slugs this article links to */
	forwardLinks: Map<string, Set<string>>;
	/** slug → set of slugs that link to this article */
	backlinks: Map<string, Set<string>>;
}

/**
 * Scan all wiki articles and build the full link graph.
 */
export async function buildLinkGraph(root: string): Promise<LinkGraph> {
	const forwardLinks = new Map<string, Set<string>>();
	const backlinks = new Map<string, Set<string>>();

	const allFiles = await listWiki(root);
	const files = allFiles.filter(
		(f) => !f.endsWith("INDEX.md") && !f.endsWith("GRAPH.md") && !f.endsWith("LOG.md"),
	);

	for (const filePath of files) {
		const content = await readFile(filePath, "utf-8");
		const { frontmatter } = parseFrontmatter(content);
		const slug = (frontmatter.slug as string) ?? extractSlugFromPath(filePath);

		if (!slug) continue;

		// Extract forward links
		const links = extractWikilinks(content);
		forwardLinks.set(slug, new Set(links));

		// Initialize backlinks set for this article
		if (!backlinks.has(slug)) {
			backlinks.set(slug, new Set());
		}

		// Add backlinks for each target
		for (const target of links) {
			if (!backlinks.has(target)) {
				backlinks.set(target, new Set());
			}
			backlinks.get(target)!.add(slug);
		}
	}

	return { forwardLinks, backlinks };
}

function extractSlugFromPath(filePath: string): string {
	// Extract slug from path like .../wiki/concepts/my-article.md → my-article
	const parts = filePath.split("/");
	const filename = parts[parts.length - 1] ?? "";
	return filename.replace(/\.md$/, "");
}

/**
 * Generate GRAPH.md content from the link graph.
 */
export function generateGraphMd(graph: LinkGraph): string {
	const lines: string[] = ["# Knowledge Graph", ""];

	// Sort by slug for consistent output
	const slugs = [...graph.forwardLinks.keys()].sort();

	for (const slug of slugs) {
		const targets = graph.forwardLinks.get(slug);
		if (targets && targets.size > 0) {
			const sorted = [...targets].sort();
			lines.push(`${slug} -> ${sorted.join(", ")}`);
		}
	}

	if (lines.length === 2) {
		lines.push("(no connections yet)");
	}

	return `${lines.join("\n")}\n`;
}
