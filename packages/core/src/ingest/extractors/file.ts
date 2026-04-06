import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import type { ExtractOptions, Extractor, ExtractResult } from "./interface.js";

const CODE_EXTENSIONS = new Set([
	".ts",
	".js",
	".tsx",
	".jsx",
	".py",
	".go",
	".rs",
	".java",
	".c",
	".cpp",
	".h",
	".hpp",
	".rb",
	".sh",
	".bash",
	".zsh",
	".sql",
	".swift",
	".kt",
	".scala",
	".cs",
	".php",
	".r",
	".lua",
	".zig",
	".hs",
	".ex",
	".exs",
	".clj",
	".ml",
	".fs",
]);

const LANGUAGE_MAP: Record<string, string> = {
	".ts": "typescript",
	".js": "javascript",
	".tsx": "tsx",
	".jsx": "jsx",
	".py": "python",
	".go": "go",
	".rs": "rust",
	".java": "java",
	".c": "c",
	".cpp": "cpp",
	".h": "c",
	".hpp": "cpp",
	".rb": "ruby",
	".sh": "bash",
	".bash": "bash",
	".zsh": "zsh",
	".sql": "sql",
	".swift": "swift",
	".kt": "kotlin",
	".scala": "scala",
	".cs": "csharp",
	".php": "php",
	".r": "r",
	".lua": "lua",
	".zig": "zig",
	".hs": "haskell",
	".ex": "elixir",
	".exs": "elixir",
	".clj": "clojure",
	".ml": "ocaml",
	".fs": "fsharp",
};

export function createFileExtractor(): Extractor {
	return {
		type: "file",

		async extract(filePath: string, options?: ExtractOptions): Promise<ExtractResult> {
			const content = await readFile(filePath, "utf-8");
			const ext = extname(filePath).toLowerCase();
			const name = basename(filePath, ext);
			const title = options?.title ?? extractMarkdownTitle(content) ?? formatTitle(name);

			// Code files get wrapped in fenced code blocks
			if (CODE_EXTENSIONS.has(ext)) {
				const lang = LANGUAGE_MAP[ext] ?? "";
				const wrappedContent = `# ${title}\n\nSource: \`${basename(filePath)}\`\n\n\`\`\`${lang}\n${content}\n\`\`\``;
				return {
					title,
					content: wrappedContent,
					metadata: { fileType: ext, language: lang },
				};
			}

			// HTML files get a basic strip
			if (ext === ".html" || ext === ".htm") {
				const { extractFromHtml } = await import("./web.js");
				return extractFromHtml(content, `file://${filePath}`, options);
			}

			// JSON/YAML/TOML get wrapped in code blocks
			if (
				ext === ".json" ||
				ext === ".yaml" ||
				ext === ".yml" ||
				ext === ".toml" ||
				ext === ".xml" ||
				ext === ".csv"
			) {
				const lang = ext.replace(".", "");
				const wrappedContent = `# ${title}\n\nSource: \`${basename(filePath)}\`\n\n\`\`\`${lang}\n${content}\n\`\`\``;
				return {
					title,
					content: wrappedContent,
					metadata: { fileType: ext },
				};
			}

			// Markdown and text files pass through directly
			return {
				title,
				content,
				metadata: { fileType: ext },
			};
		},
	};
}

function formatTitle(filename: string): string {
	return filename.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Extract the first H1 heading from markdown content. */
function extractMarkdownTitle(content: string): string | null {
	const match = content.match(/^#\s+(.+)$/m);
	return match?.[1]?.trim() ?? null;
}
