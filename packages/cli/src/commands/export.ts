import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import {
	listImageAssets,
	listWiki,
	resolveVaultRoot,
	VaultNotFoundError,
	WIKI_DIR,
} from "@kibhq/core";
import * as log from "../ui/logger.js";
import { createSpinner } from "../ui/spinner.js";

interface ExportOpts {
	format: string;
	output?: string;
	json?: boolean;
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

	if (!opts.json) {
		log.header(`exporting wiki as ${format}`);
	}

	const spinner = opts.json ? null : createSpinner("Exporting...");
	spinner?.start();

	try {
		let fileCount = 0;
		switch (format) {
			case "markdown":
				fileCount = await exportMarkdown(root, outputDir);
				break;
			case "html":
				fileCount = await exportHtml(root, outputDir);
				break;
			default:
				spinner?.fail(`Unsupported format: ${format}`);
				log.dim("Supported formats: markdown, html");
				process.exit(1);
		}

		if (opts.json) {
			console.log(JSON.stringify({ format, output: outputDir, files: fileCount }, null, 2));
			return;
		}

		spinner?.succeed(`Exported to ${outputDir}`);
		log.blank();
	} catch (err) {
		spinner?.fail("Export failed");
		log.error((err as Error).message);
		process.exit(1);
	}
}

/**
 * Export as clean markdown bundle (strip frontmatter, resolve links).
 */
async function exportMarkdown(root: string, outputDir: string): Promise<number> {
	const wikiDir = join(root, WIKI_DIR);
	const files = await listWiki(root);

	// Copy image assets
	await copyImageAssets(root, outputDir);

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

	return files.length;
}

/** Shared CSS used across all HTML export pages */
const SHARED_CSS = `
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; max-width: 720px; margin: 2rem auto; padding: 0 1rem; line-height: 1.6; color: #1a1a1a; }
    a { color: #0066cc; }
    code { background: #f4f4f4; padding: 0.2em 0.4em; border-radius: 3px; font-size: 0.9em; }
    pre { background: #f4f4f4; padding: 1rem; border-radius: 6px; overflow-x: auto; }
    pre code { background: none; padding: 0; }
    nav { margin-bottom: 2rem; padding-bottom: 1rem; border-bottom: 1px solid #eee; }
    nav a { margin-right: 1rem; }
    img { max-width: 100%; height: auto; border-radius: 6px; margin: 1rem 0; }
    .gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 1.5rem; }
    .gallery-item { border: 1px solid #eee; border-radius: 8px; overflow: hidden; }
    .gallery-item img { width: 100%; height: 200px; object-fit: cover; margin: 0; border-radius: 0; }
    .gallery-item .caption { padding: 0.75rem; }
    .gallery-item .caption h3 { margin: 0 0 0.25rem; font-size: 0.95rem; }
    .gallery-item .caption p { margin: 0; font-size: 0.85rem; color: #666; }`;

/**
 * Export as a simple HTML static site.
 */
async function exportHtml(root: string, outputDir: string): Promise<number> {
	const wikiDir = join(root, WIKI_DIR);
	const files = await listWiki(root);
	const { parseFrontmatter } = await import("@kibhq/core");

	await mkdir(outputDir, { recursive: true });

	// Copy image assets to export/images/
	const imageFiles = await copyImageAssets(root, outputDir);

	const articles: { title: string; relPath: string; htmlPath: string }[] = [];

	for (const filePath of files) {
		const content = await readFile(filePath, "utf-8");
		const relPath = relative(wikiDir, filePath);
		const { frontmatter, body } = parseFrontmatter(content);
		const title = (frontmatter.title as string) ?? relPath.replace(/\.md$/, "");
		const htmlPath = relPath.replace(/\.md$/, ".html");

		// Determine depth for relative path to images/
		const depth = htmlPath.split("/").length - 1;
		const prefix = depth > 0 ? "../".repeat(depth) : "";

		// Simple markdown → HTML with image path resolution
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

		articles.push({ title, relPath, htmlPath });
	}

	// Generate index.html
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
  <p>${articles.length} articles${imageFiles.length > 0 ? ` | ${imageFiles.length} images` : ""}</p>
  <ul>
    ${articles
			.sort((a, b) => a.title.localeCompare(b.title))
			.map((a) => `<li><a href="${a.htmlPath}">${escapeHtml(a.title)}</a></li>`)
			.join("\n    ")}
  </ul>
  ${imageFiles.length > 0 ? `<p><a href="gallery.html">View image gallery</a></p>` : ""}
</body>
</html>`;

	await writeFile(join(outputDir, "index.html"), indexHtml, "utf-8");

	// Generate gallery.html if there are images
	if (imageFiles.length > 0) {
		await generateGalleryHtml(outputDir, imageFiles);
	}

	return articles.length;
}

/**
 * Copy image assets from wiki/images/ to export/images/.
 * Returns the list of copied filenames.
 */
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

/**
 * Generate an image gallery HTML page.
 */
async function generateGalleryHtml(outputDir: string, imageFiles: string[]): Promise<void> {
	const items = imageFiles
		.map((filename) => {
			const name = filename.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ");
			const title = name.replace(/\b\w/g, (c) => c.toUpperCase());
			return `<div class="gallery-item">
        <a href="images/${filename}"><img src="images/${filename}" alt="${escapeHtml(title)}" loading="lazy"></a>
        <div class="caption"><h3>${escapeHtml(title)}</h3><p>${filename}</p></div>
      </div>`;
		})
		.join("\n    ");

	const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Image Gallery</title>
  <style>${SHARED_CSS}</style>
</head>
<body>
  <nav><a href="index.html">Index</a> <a href="gallery.html">Gallery</a></nav>
  <h1>Image Gallery</h1>
  <p>${imageFiles.length} images</p>
  <div class="gallery">
    ${items}
  </div>
</body>
</html>`;

	await writeFile(join(outputDir, "gallery.html"), html, "utf-8");
}

function simpleMarkdownToHtml(md: string, imagePrefix = ""): string {
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
			// Markdown images → HTML img (resolve images/ paths with prefix)
			.replace(
				/!\[([^\]]*)\]\((images\/[^)]+)\)/g,
				(_, alt: string, src: string) =>
					`<img src="${imagePrefix}${src}" alt="${escapeHtml(alt)}">`,
			)
			// External images (http/https)
			.replace(
				/!\[([^\]]*)\]\((https?:\/\/[^)]+)\)/g,
				(_, alt: string, src: string) => `<img src="${src}" alt="${escapeHtml(alt)}">`,
			)
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
	return str
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}
