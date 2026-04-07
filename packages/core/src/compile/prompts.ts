/**
 * System prompt for compiling raw sources into wiki articles.
 */
export function compileSystemPrompt(categories: string[]): string {
	return `You are a knowledge compiler. You receive raw source material and an existing wiki index. Your job is to:

1. Extract key concepts, topics, and entities from the source
2. Create new wiki articles OR update existing ones
3. Add [[wiki-style]] links for cross-references between articles
4. Maintain consistent style and depth across the wiki

RULES:
- Each article should cover ONE concept or topic clearly
- Articles should be 200-1000 words
- Use YAML frontmatter with these fields: title, slug, category, tags, sources, created, updated, summary
- Use [[wiki-style]] links to reference other articles (use the slug as the link target)
- Prefer updating existing articles over creating duplicates
- If a concept already has a wiki article, update it with new information rather than creating a new one
- Categories: ${categories.join(", ")}
- Slugs should be kebab-case (e.g., "transformer-architecture")
- Tags should be lowercase, hyphenated (e.g., "deep-learning")
- Summary should be 1-2 sentences

OUTPUT FORMAT:
Respond with ONLY a JSON array of file operations. No other text, no markdown code fences, just the raw JSON array:
[
  {
    "op": "create",
    "path": "wiki/concepts/example-concept.md",
    "content": "---\\ntitle: Example Concept\\nslug: example-concept\\ncategory: concept\\ntags: [example, demo]\\nsources:\\n  - raw/articles/source-file.md\\ncreated: 2026-04-05\\nupdated: 2026-04-05\\nsummary: >\\n  A brief summary of this concept.\\n---\\n\\n# Example Concept\\n\\nArticle content here..."
  },
  {
    "op": "update",
    "path": "wiki/topics/existing-topic.md",
    "content": "full updated content including frontmatter"
  }
]

Valid operations:
- "create": Create a new article at the given path
- "update": Replace an existing article's content
- "delete": Remove an article (use sparingly)`;
}

/**
 * Build the user message for a compile pass.
 */
export function compileUserPrompt(params: {
	indexContent: string;
	sourceContent: string;
	sourcePath: string;
	existingArticles: { path: string; content: string }[];
	today: string;
}): string {
	const parts: string[] = [];

	parts.push("CURRENT WIKI INDEX:");
	if (params.indexContent) {
		parts.push(params.indexContent);
	} else {
		parts.push("(empty — this is the first compilation)");
	}

	if (params.existingArticles.length > 0) {
		parts.push("\n\nEXISTING ARTICLES THAT MAY NEED UPDATES:");
		for (const article of params.existingArticles) {
			parts.push(`\n--- ${article.path} ---`);
			parts.push(article.content);
		}
	}

	parts.push(`\n\nNEW SOURCE TO COMPILE (from ${params.sourcePath}):`);
	parts.push(params.sourceContent);

	parts.push(`\n\nToday's date: ${params.today}`);

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
 */
export function enrichSystemPrompt(): string {
	return `You are a knowledge graph enricher. You receive an existing wiki article and summaries of newly created articles. Your job is to add [[wikilinks]] to the new articles where they fit naturally in the existing text.

RULES:
- Only add links where the referenced concept is directly relevant to the surrounding text
- Insert [[slug]] links inline within existing sentences (e.g., "uses self-attention" → "uses [[self-attention]]")
- Do NOT rewrite sentences or paragraphs — only insert link markup
- Do NOT add links in YAML frontmatter
- Do NOT add links that already exist in the article
- Maximum 3 new links per article
- If no links are appropriate, return an empty array []
- Preserve ALL existing content exactly — only add [[ ]] around relevant terms or append brief mentions
- Update the "updated" field in frontmatter to today's date

OUTPUT FORMAT:
Respond with ONLY a JSON array of file operations. No other text:
[{"op": "update", "path": "wiki/category/slug.md", "content": "full updated article content"}]

Or if no changes needed:
[]`;
}

/**
 * Build the user message for cross-reference enrichment.
 */
export function enrichUserPrompt(params: {
	articlePath: string;
	articleContent: string;
	newArticles: { slug: string; title: string; summary: string; tags: string[] }[];
	today: string;
}): string {
	const parts: string[] = [];

	parts.push(`EXISTING ARTICLE TO ENRICH (${params.articlePath}):`);
	parts.push(params.articleContent);

	parts.push("\n\nNEWLY CREATED ARTICLES THAT MAY BE RELEVANT:");
	for (const a of params.newArticles) {
		parts.push(`- **${a.title}** ([[${a.slug}]]) — ${a.summary}. Tags: ${a.tags.join(", ")}`);
	}

	parts.push(`\n\nToday's date: ${params.today}`);

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
