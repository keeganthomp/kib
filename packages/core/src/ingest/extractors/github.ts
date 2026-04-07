import type { ExtractOptions, Extractor, ExtractResult } from "./interface.js";

export function createGithubExtractor(): Extractor {
	return {
		type: "github",

		async extract(url: string, options?: ExtractOptions): Promise<ExtractResult> {
			const parsed = parseGithubUrl(url);
			if (!parsed) {
				throw new Error(`Could not parse GitHub URL: ${url}`);
			}

			const { owner, repo, branch } = parsed;
			const apiBase = `https://api.github.com/repos/${owner}/${repo}`;

			const headers: Record<string, string> = {
				Accept: "application/vnd.github.v3+json",
				"User-Agent": "kib/0.1",
			};

			// Use GITHUB_TOKEN if available for higher rate limits
			if (process.env.GITHUB_TOKEN) {
				headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
			}

			// Fetch repo metadata
			const repoResponse = await fetch(apiBase, { headers });
			if (!repoResponse.ok) {
				throw new Error(
					`Failed to fetch repo info: ${repoResponse.status} ${repoResponse.statusText}`,
				);
			}
			const repoData = (await repoResponse.json()) as {
				full_name?: string;
				description?: string;
				stargazers_count?: number;
				language?: string;
				default_branch?: string;
				topics?: string[];
			};

			// Fetch README
			let readme = "";
			try {
				const readmeResponse = await fetch(`${apiBase}/readme`, {
					headers: { ...headers, Accept: "application/vnd.github.v3.raw" },
				});
				if (readmeResponse.ok) {
					readme = await readmeResponse.text();
				}
			} catch {
				// No README
			}

			// Fetch file tree (top level only)
			let fileTree = "";
			try {
				const ref = branch ?? repoData.default_branch ?? "main";
				const treeResponse = await fetch(`${apiBase}/git/trees/${ref}`, { headers });
				if (treeResponse.ok) {
					const treeData = (await treeResponse.json()) as {
						tree?: { type: string; path: string }[];
					};
					const files = (treeData.tree ?? [])
						.map((f) => `${f.type === "tree" ? "📁" : "📄"} ${f.path}`)
						.slice(0, 50); // Cap at 50 entries
					fileTree = files.join("\n");
				}
			} catch {
				// No tree
			}

			const title = options?.title ?? `${owner}/${repo}`;
			const description = repoData.description ?? "";
			const stars = repoData.stargazers_count ?? 0;
			const language = repoData.language ?? "Unknown";
			const topics = repoData.topics ?? [];

			const sections: string[] = [
				`# ${title}`,
				"",
				description ? `> ${description}` : "",
				"",
				`**Language:** ${language} | **Stars:** ${stars.toLocaleString()} | **URL:** ${url}`,
			];

			if (topics.length > 0) {
				sections.push(`**Topics:** ${topics.join(", ")}`);
			}

			if (fileTree) {
				sections.push("", "## File Structure", "", "```", fileTree, "```");
			}

			if (readme) {
				sections.push("", "## README", "", readme);
			}

			return {
				title,
				content: sections.filter((s) => s !== undefined).join("\n"),
				metadata: {
					owner,
					repo,
					stars,
					language,
					topics,
					url,
				},
			};
		},
	};
}

interface ParsedGithubUrl {
	owner: string;
	repo: string;
	branch?: string;
}

export function parseGithubUrl(url: string): ParsedGithubUrl | null {
	try {
		const parsed = new URL(url.trim());
		if (parsed.hostname !== "github.com" && parsed.hostname !== "www.github.com") {
			return null;
		}

		const parts = parsed.pathname.split("/").filter(Boolean);
		if (parts.length < 2) return null;

		const owner = parts[0]!;
		const repo = parts[1]!;

		// Check for /tree/branch pattern
		let branch: string | undefined;
		if (parts[2] === "tree" && parts[3]) {
			branch = parts[3];
		}

		return { owner, repo, branch };
	} catch {
		return null;
	}
}
