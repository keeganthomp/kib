import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { listImageAssets, listWiki, parseFrontmatter, WIKI_DIR } from "@kibhq/core";

export async function exportVault(
	root: string,
	format: "markdown" | "html",
	output?: string,
): Promise<{ format: string; output: string; files: number }> {
	const outputDir = output ?? join(root, "export");

	let fileCount: number;
	switch (format) {
		case "markdown":
			fileCount = await exportMarkdown(root, outputDir);
			break;
		case "html":
			fileCount = await exportHtml(root, outputDir);
			break;
		default:
			throw new Error(`Unsupported format: ${format}. Use 'markdown' or 'html'.`);
	}

	return { format, output: outputDir, files: fileCount };
}

async function exportMarkdown(root: string, outputDir: string): Promise<number> {
	const wikiDir = join(root, WIKI_DIR);
	const files = await listWiki(root);

	await copyImageAssets(root, outputDir);

	for (const filePath of files) {
		const content = await readFile(filePath, "utf-8");
		const relPath = relative(wikiDir, filePath);
		const outPath = join(outputDir, relPath);

		await mkdir(join(outPath, ".."), { recursive: true });

		const cleaned = content.replace(/^---[\s\S]*?---\s*\n/, "");
		const resolved = cleaned.replace(
			/\[\[([^\]]+)\]\]/g,
			(_, slug: string) => `[${slug}](${slug}.md)`,
		);

		await writeFile(outPath, resolved, "utf-8");
	}

	return files.length;
}

const SHARED_CSS = `
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; max-width: 720px; margin: 2rem auto; padding: 0 1rem; line-height: 1.6; color: #1a1a1a; }
    a { color: #0066cc; }
    code { background: #f4f4f4; padding: 0.2em 0.4em; border-radius: 3px; font-size: 0.9em; }
    pre { background: #f4f4f4; padding: 1rem; border-radius: 6px; overflow-x: auto; }
    pre code { background: none; padding: 0; }
    nav { margin-bottom: 2rem; padding-bottom: 1rem; border-bottom: 1px solid #eee; }
    nav a { margin-right: 1rem; }
    img { max-width: 100%; height: auto; border-radius: 6px; margin: 1rem 0; }`;

async function exportHtml(root: string, outputDir: string): Promise<number> {
	const wikiDir = join(root, WIKI_DIR);
	const files = await listWiki(root);

	await mkdir(outputDir, { recursive: true });
	const imageFiles = await copyImageAssets(root, outputDir);

	const articles: { title: string; htmlPath: string }[] = [];

	for (const filePath of files) {
		const content = await readFile(filePath, "utf-8");
		const relPath = relative(wikiDir, filePath);
		const { frontmatter, body } = parseFrontmatter(content);
		const title = (frontmatter.title as string) ?? relPath.replace(/\.md$/, "");
		const htmlPath = relPath.replace(/\.md$/, ".html");

		const depth = htmlPath.split("/").length - 1;
		const prefix = depth > 0 ? "../".repeat(depth) : "";

		const html = simpleMarkdownToHtml(body, prefix);

		const page = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>${SHARED_CSS}</style>
</head>
<body>
  <nav><a href="${prefix}index.html">Index</a>${imageFiles.length > 0 ? ` <a href="${prefix}gallery.html">Gallery</a>` : ""}</nav>
  <h1>${escapeHtml(title)}</h1>
  ${html}
</body>
</html>`;

		const outPath = join(outputDir, htmlPath);
		await mkdir(join(outPath, ".."), { recursive: true });
		await writeFile(outPath, page, "utf-8");

		articles.push({ title, htmlPath });
	}

	const indexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Knowledge Base</title>
  <style>${SHARED_CSS}</style>
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

	return articles.length;
}

async function copyImageAssets(root: string, outputDir: string): Promise<string[]> {
	const imageFiles = await listImageAssets(root);
	if (imageFiles.length === 0) return [];

	const srcDir = join(root, WIKI_DIR, "images");
	const destDir = join(outputDir, "images");
	await mkdir(destDir, { recursive: true });

	for (const filename of imageFiles) {
		await copyFile(join(srcDir, filename), join(destDir, filename));
	}

	return imageFiles;
}

function simpleMarkdownToHtml(md: string, imagePrefix = ""): string {
	return md
		.replace(/```(\w*)\n([\s\S]*?)```/g, "<pre><code>$2</code></pre>")
		.replace(/^### (.+)$/gm, "<h3>$1</h3>")
		.replace(/^## (.+)$/gm, "<h2>$1</h2>")
		.replace(/^# (.+)$/gm, "<h1>$1</h1>")
		.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
		.replace(/\*(.+?)\*/g, "<em>$1</em>")
		.replace(/`([^`]+)`/g, "<code>$1</code>")
		.replace(
			/!\[([^\]]*)\]\((images\/[^)]+)\)/g,
			(_, alt: string, src: string) => `<img src="${imagePrefix}${src}" alt="${escapeHtml(alt)}">`,
		)
		.replace(
			/!\[([^\]]*)\]\((https?:\/\/[^)]+)\)/g,
			(_, alt: string, src: string) => `<img src="${src}" alt="${escapeHtml(alt)}">`,
		)
		.replace(/\[\[([^\]]+)\]\]/g, '<a href="$1.html">$1</a>')
		.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
		.replace(/^- (.+)$/gm, "<li>$1</li>")
		.replace(/\n\n/g, "</p><p>")
		.replace(/^/, "<p>")
		.replace(/$/, "</p>")
		.replace(/<p><li>/g, "<ul><li>")
		.replace(/<\/li><\/p>/g, "</li></ul>");
}

function escapeHtml(str: string): string {
	return str
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}
