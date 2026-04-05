import { readFile } from "node:fs/promises";
import { mkdir, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import {
	WIKI_DIR,
	VaultNotFoundError,
	resolveVaultRoot,
	listWiki,
} from "@kib/core";
import * as log from "../ui/logger.js";
import { createSpinner } from "../ui/spinner.js";

interface ExportOpts {
	format: string;
	output?: string;
}

export async function exportVault(opts: ExportOpts) {
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

	const format = opts.format ?? "markdown";
	const outputDir = opts.output ?? join(root, "export");

	log.header(`exporting wiki as ${format}`);

	const spinner = createSpinner("Exporting...");
	spinner.start();

	try {
		switch (format) {
			case "markdown":
				await exportMarkdown(root, outputDir);
				break;
			case "html":
				await exportHtml(root, outputDir);
				break;
			default:
				spinner.fail(`Unsupported format: ${format}`);
				log.dim("Supported formats: markdown, html");
				process.exit(1);
		}

		spinner.succeed(`Exported to ${outputDir}`);
		log.blank();
	} catch (err) {
		spinner.fail("Export failed");
		log.error((err as Error).message);
		process.exit(1);
	}
}

/**
 * Export as clean markdown bundle (strip frontmatter, resolve links).
 */
async function exportMarkdown(root: string, outputDir: string) {
	const wikiDir = join(root, WIKI_DIR);
	const files = await listWiki(root);

	for (const filePath of files) {
		const content = await readFile(filePath, "utf-8");
		const relPath = relative(wikiDir, filePath);
		const outPath = join(outputDir, relPath);

		await mkdir(join(outPath, ".."), { recursive: true });

		// Strip frontmatter
		const cleaned = content.replace(/^---[\s\S]*?---\s*\n/, "");
		// Resolve [[wikilinks]] to standard markdown links
		const resolved = cleaned.replace(
			/\[\[([^\]]+)\]\]/g,
			(_, slug: string) => `[${slug}](${slug}.md)`,
		);

		await writeFile(outPath, resolved, "utf-8");
	}
}

/**
 * Export as a simple HTML static site.
 */
async function exportHtml(root: string, outputDir: string) {
	const wikiDir = join(root, WIKI_DIR);
	const files = await listWiki(root);
	const { parseFrontmatter } = await import("@kib/core");

	await mkdir(outputDir, { recursive: true });

	const articles: { title: string; relPath: string; htmlPath: string }[] = [];

	for (const filePath of files) {
		const content = await readFile(filePath, "utf-8");
		const relPath = relative(wikiDir, filePath);
		const { frontmatter, body } = parseFrontmatter(content);
		const title = (frontmatter.title as string) ?? relPath.replace(/\.md$/, "");
		const htmlPath = relPath.replace(/\.md$/, ".html");

		// Simple markdown → HTML (headings, paragraphs, bold, italic, code, links)
		const html = simpleMarkdownToHtml(body);

		const page = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; max-width: 720px; margin: 2rem auto; padding: 0 1rem; line-height: 1.6; color: #1a1a1a; }
    a { color: #0066cc; }
    code { background: #f4f4f4; padding: 0.2em 0.4em; border-radius: 3px; font-size: 0.9em; }
    pre { background: #f4f4f4; padding: 1rem; border-radius: 6px; overflow-x: auto; }
    pre code { background: none; padding: 0; }
    nav { margin-bottom: 2rem; padding-bottom: 1rem; border-bottom: 1px solid #eee; }
    nav a { margin-right: 1rem; }
  </style>
</head>
<body>
  <nav><a href="index.html">Index</a></nav>
  <h1>${escapeHtml(title)}</h1>
  ${html}
</body>
</html>`;

		const outPath = join(outputDir, htmlPath);
		await mkdir(join(outPath, ".."), { recursive: true });
		await writeFile(outPath, page, "utf-8");

		articles.push({ title, relPath, htmlPath });
	}

	// Generate index.html
	const indexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Knowledge Base</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; max-width: 720px; margin: 2rem auto; padding: 0 1rem; line-height: 1.6; color: #1a1a1a; }
    a { color: #0066cc; }
    ul { list-style: none; padding: 0; }
    li { margin: 0.5rem 0; }
  </style>
</head>
<body>
  <h1>Knowledge Base</h1>
  <p>${articles.length} articles</p>
  <ul>
    ${articles
			.sort((a, b) => a.title.localeCompare(b.title))
			.map((a) => `<li><a href="${a.htmlPath}">${escapeHtml(a.title)}</a></li>`)
			.join("\n    ")}
  </ul>
</body>
</html>`;

	await writeFile(join(outputDir, "index.html"), indexHtml, "utf-8");
}

function simpleMarkdownToHtml(md: string): string {
	return (
		md
			// Code blocks
			.replace(/```(\w*)\n([\s\S]*?)```/g, "<pre><code>$2</code></pre>")
			// Headers
			.replace(/^### (.+)$/gm, "<h3>$1</h3>")
			.replace(/^## (.+)$/gm, "<h2>$1</h2>")
			.replace(/^# (.+)$/gm, "<h1>$1</h1>")
			// Bold
			.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
			// Italic
			.replace(/\*(.+?)\*/g, "<em>$1</em>")
			// Inline code
			.replace(/`([^`]+)`/g, "<code>$1</code>")
			// Wikilinks → HTML links
			.replace(/\[\[([^\]]+)\]\]/g, '<a href="$1.html">$1</a>')
			// Standard links
			.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
			// Lists
			.replace(/^- (.+)$/gm, "<li>$1</li>")
			// Paragraphs
			.replace(/\n\n/g, "</p><p>")
			.replace(/^/, "<p>")
			.replace(/$/, "</p>")
			// Clean up list items
			.replace(/<p><li>/g, "<ul><li>")
			.replace(/<\/li><\/p>/g, "</li></ul>")
	);
}

function escapeHtml(str: string): string {
	return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
