/**
 * System prompt for compiling raw sources into wiki articles.
 *
 * Written in compressed "caveman" style to minimize input tokens.
 * LLMs understand this equally well — brevity improves accuracy.
 */
export function compileSystemPrompt(
	categories: string[],
	opts?: { imageAssets?: string[] },
): string {
	const imageSection =
		opts?.imageAssets && opts.imageAssets.length > 0
			? `\nIMAGES: ${opts.imageAssets.join(", ")}. Embed relevant: ![desc](images/file.ext)`
			: "";

	return `Knowledge compiler. Extract concepts from source, create/update wiki articles.${imageSection}

RULES: ONE concept per article. 200-1000 words. YAML frontmatter: title,slug,category,tags,sources,created,updated,summary. Use [[slug]] wikilinks. Update existing articles, don't duplicate. Categories: ${categories.join(",")}. Slugs: kebab-case. Tags: lowercase-hyphenated. Summary: 1-2 sentences. Write concise, dense prose — no filler words.

OUTPUT: ONLY raw JSON array. No text, no fences.
[{"op":"create","path":"wiki/concepts/slug.md","content":"---\\ntitle: T\\nslug: s\\ncategory: concept\\ntags: [t]\\nsources:\\n  - raw/articles/src.md\\ncreated: DATE\\nupdated: DATE\\nsummary: Brief.\\n---\\n\\n# Title\\n\\nContent..."},{"op":"update","path":"wiki/topics/slug.md","content":"full content"}]
ops: create|update|delete`;
}

/**
 * Build the user message for a compile pass.
 * Uses minimal section headers to save tokens.
 */
export function compileUserPrompt(params: {
	indexContent: string;
	sourceContent: string;
	sourcePath: string;
	existingArticles: { path: string; content: string }[];
	today: string;
}): string {
	const parts: string[] = [];

	// Compact section headers save ~20 tokens vs verbose originals
	parts.push("INDEX:");
	parts.push(params.indexContent || "(empty)");

	if (params.existingArticles.length > 0) {
		parts.push("\nEXISTING:");
		for (const article of params.existingArticles) {
			parts.push(`--- ${article.path} ---`);
			parts.push(article.content);
		}
	}

	parts.push(`\nSOURCE (${params.sourcePath}):`);
	parts.push(params.sourceContent);

	parts.push(`\ndate:${params.today}`);

	return parts.join("\n");
}

/**
 * System prompt for generating INDEX.md from article metadata.
 */
export function indexSystemPrompt(): string {
	return `You are a wiki index generator. Given a list of articles with their metadata, generate a clean INDEX.md file.

Format:
# Knowledge Base Index

> {count} articles | {total_words} words | Last compiled: {timestamp}

## Concepts
- **[Title](path)** — Summary. \`#tag1\` \`#tag2\`

## Topics
- **[Title](path)** — Summary. \`#tag1\` \`#tag2\`

## References
- **[Title](path)** — Summary. \`#tag1\` \`#tag2\`

## Outputs
- **[Title](path)** — Summary. \`#tag1\` \`#tag2\`

Only include sections that have articles. Sort articles alphabetically within each section.
Output ONLY the markdown content, no JSON, no code fences.`;
}

/**
 * System prompt for cross-reference enrichment.
 * Caveman-compressed for token efficiency.
 */
export function enrichSystemPrompt(): string {
	return `Add [[wikilinks]] to existing article where new articles are relevant.

RULES: Insert [[slug]] inline in existing sentences. Don't rewrite — only add link markup. No links in frontmatter. No duplicate links. Max 3 new links. Preserve all content. Update "updated" field. If no links fit, return [].

OUTPUT: ONLY JSON array. [{"op":"update","path":"wiki/cat/slug.md","content":"full content"}] or []`;
}

/**
 * Build the user message for cross-reference enrichment.
 * Caveman-compressed section headers.
 */
export function enrichUserPrompt(params: {
	articlePath: string;
	articleContent: string;
	newArticles: { slug: string; title: string; summary: string; tags: string[] }[];
	today: string;
}): string {
	const parts: string[] = [];

	parts.push(`ARTICLE (${params.articlePath}):`);
	parts.push(params.articleContent);

	parts.push("\nNEW:");
	for (const a of params.newArticles) {
		parts.push(`- ${a.title} [[${a.slug}]] — ${a.summary}. ${a.tags.join(",")}`);
	}

	parts.push(`\ndate:${params.today}`);

	return parts.join("\n");
}

/**
 * System prompt for generating GRAPH.md from article links.
 */
export function graphSystemPrompt(): string {
	return `You are a knowledge graph generator. Given articles and their forward/backward links, generate a GRAPH.md adjacency list.

Format:
# Knowledge Graph

slug-a -> slug-b, slug-c, slug-d
slug-b -> slug-a, slug-e
slug-c -> slug-a

Each line is: source-slug -> comma-separated target slugs
Only include articles that have at least one connection.
Sort alphabetically by source slug.
Output ONLY the markdown content, no JSON, no code fences.`;
}
