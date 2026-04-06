import { readFile } from "node:fs/promises";
import { relative } from "node:path";
import { WIKI_DIR } from "../constants.js";
import { listWiki } from "../vault.js";
import { parseFrontmatter } from "./diff.js";

interface ArticleMeta {
	title: string;
	slug: string;
	category: string;
	tags: string[];
	summary: string;
	relativePath: string;
	wordCount: number;
}

/**
 * Generate INDEX.md content by reading all wiki articles' frontmatter.
 * This is deterministic — no LLM needed.
 */
export async function generateIndexMd(root: string): Promise<string> {
	const wikiDir = `${root}/${WIKI_DIR}`;
	const files = await listWiki(root);

	// Skip INDEX.md and GRAPH.md themselves
	const articleFiles = files.filter((f) => !f.endsWith("INDEX.md") && !f.endsWith("GRAPH.md"));

	const articles: ArticleMeta[] = [];

	for (const filePath of articleFiles) {
		const content = await readFile(filePath, "utf-8");
		const { frontmatter, body } = parseFrontmatter(content);

		const relPath = relative(wikiDir, filePath);
		const wordCount = body.split(/\s+/).filter(Boolean).length;

		articles.push({
			title: (frontmatter.title as string) ?? relPath.replace(/\.md$/, ""),
			slug: (frontmatter.slug as string) ?? "",
			category: (frontmatter.category as string) ?? categorize(relPath),
			tags: Array.isArray(frontmatter.tags) ? (frontmatter.tags as string[]) : [],
			summary: (frontmatter.summary as string) ?? "",
			relativePath: relPath,
			wordCount,
		});
	}

	// Group by category
	const grouped = new Map<string, ArticleMeta[]>();
	for (const article of articles) {
		const cat = article.category;
		if (!grouped.has(cat)) {
			grouped.set(cat, []);
		}
		grouped.get(cat)!.push(article);
	}

	// Sort articles within each category alphabetically
	for (const arts of grouped.values()) {
		arts.sort((a, b) => a.title.localeCompare(b.title));
	}

	// Compute stats
	const totalArticles = articles.length;
	const totalWords = articles.reduce((sum, a) => sum + a.wordCount, 0);
	const now = new Date().toISOString();

	// Build the index
	const lines: string[] = [
		"# Knowledge Base Index",
		"",
		`> ${totalArticles} articles | ${totalWords.toLocaleString()} words | Last compiled: ${now}`,
	];

	// Ordered category display
	const categoryOrder = ["concept", "topic", "reference", "output"];
	const categoryLabels: Record<string, string> = {
		concept: "Concepts",
		topic: "Topics",
		reference: "References",
		output: "Outputs",
	};

	for (const cat of categoryOrder) {
		const arts = grouped.get(cat);
		if (!arts || arts.length === 0) continue;

		lines.push("", `## ${categoryLabels[cat] ?? cat}`, "");

		for (const article of arts) {
			const tags = article.tags.map((t) => `\`#${t}\``).join(" ");
			const summary = article.summary ? ` -- ${article.summary}` : "";
			lines.push(
				`- **[${article.title}](${article.relativePath})**${summary}${tags ? ` ${tags}` : ""}`,
			);
		}
	}

	// Any categories not in the standard order
	for (const [cat, arts] of grouped) {
		if (categoryOrder.includes(cat)) continue;
		if (arts.length === 0) continue;

		const label = cat.charAt(0).toUpperCase() + cat.slice(1);
		lines.push("", `## ${label}`, "");

		for (const article of arts) {
			const tags = article.tags.map((t) => `\`#${t}\``).join(" ");
			const summary = article.summary ? ` -- ${article.summary}` : "";
			lines.push(
				`- **[${article.title}](${article.relativePath})**${summary}${tags ? ` ${tags}` : ""}`,
			);
		}
	}

	return `${lines.join("\n")}\n`;
}

/**
 * Infer category from path when not in frontmatter.
 */
function categorize(relPath: string): string {
	if (relPath.startsWith("concepts/")) return "concept";
	if (relPath.startsWith("topics/")) return "topic";
	if (relPath.startsWith("references/")) return "reference";
	if (relPath.startsWith("outputs/")) return "output";
	return "topic"; // default
}

/**
 * Compute stats from INDEX.md or articles directly.
 */
export async function computeStats(root: string): Promise<{
	totalArticles: number;
	totalWords: number;
}> {
	const files = await listWiki(root);
	const articleFiles = files.filter((f) => !f.endsWith("INDEX.md") && !f.endsWith("GRAPH.md"));

	let totalWords = 0;
	for (const filePath of articleFiles) {
		const content = await readFile(filePath, "utf-8");
		const { body } = parseFrontmatter(content);
		totalWords += body.split(/\s+/).filter(Boolean).length;
	}

	return { totalArticles: articleFiles.length, totalWords };
}
