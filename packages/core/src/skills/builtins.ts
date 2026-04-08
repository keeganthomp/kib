import type { SkillDefinition } from "../types.js";

/**
 * All built-in skills that ship with kib.
 */
export function getBuiltinSkills(): SkillDefinition[] {
	return [
		summarize,
		flashcards,
		connections,
		findContradictions,
		weeklyDigest,
		exportSlides,
		timeline,
		compare,
		explain,
		suggestTags,
	];
}

// ─── Original skills ────────────────────────────────────────────

const summarize: SkillDefinition = {
	name: "summarize",
	version: "1.0.0",
	description: "Summarize a wiki article or raw source",
	input: "selection",
	output: "stdout",
	llm: {
		required: true,
		model: "fast",
		systemPrompt:
			"Summarize the following content concisely. Highlight key points, main arguments, and conclusions. Output markdown.",
		maxTokens: 1024,
		temperature: 0,
	},
	async run(ctx) {
		const articles = await ctx.vault.readWiki();
		if (articles.length === 0) {
			ctx.logger.warn("No articles to summarize.");
			return {};
		}
		const content = articles.map((a) => `# ${a.title}\n\n${a.content}`).join("\n\n---\n\n");
		const result = await ctx.llm.complete({
			system: this.llm!.systemPrompt,
			messages: [{ role: "user", content }],
			maxTokens: this.llm!.maxTokens,
			temperature: this.llm!.temperature,
		});
		return { content: result.content };
	},
};

const flashcards: SkillDefinition = {
	name: "flashcards",
	version: "1.0.0",
	description: "Generate flashcards from wiki articles",
	input: "wiki",
	output: "report",
	llm: {
		required: true,
		model: "default",
		systemPrompt: `Generate flashcards from the following knowledge base articles.
Output format:
Q: [question]
A: [answer]

Create 5-10 flashcards per article. Focus on key concepts, definitions, and relationships.`,
		maxTokens: 4096,
		temperature: 0,
	},
	async run(ctx) {
		const articles = await ctx.vault.readWiki();
		if (articles.length === 0) {
			ctx.logger.warn("No articles to generate flashcards from.");
			return {};
		}
		const content = articles
			.slice(0, 5)
			.map((a) => `# ${a.title}\n\n${a.content}`)
			.join("\n\n---\n\n");
		const result = await ctx.llm.complete({
			system: this.llm!.systemPrompt,
			messages: [{ role: "user", content }],
			maxTokens: this.llm!.maxTokens,
			temperature: this.llm!.temperature,
		});
		return { content: result.content };
	},
};

const connections: SkillDefinition = {
	name: "connections",
	version: "1.0.0",
	description: "Suggest new connections between existing articles",
	input: "index",
	output: "report",
	llm: {
		required: true,
		model: "default",
		systemPrompt: `Analyze the following wiki index and suggest connections between articles that aren't currently linked.
For each suggestion, explain why the connection is relevant.
Output as a markdown list.`,
		maxTokens: 2048,
		temperature: 0.3,
	},
	async run(ctx) {
		const index = await ctx.vault.readIndex();
		const graph = await ctx.vault.readGraph();
		const result = await ctx.llm.complete({
			system: this.llm!.systemPrompt,
			messages: [
				{
					role: "user",
					content: `CURRENT INDEX:\n${index}\n\nCURRENT GRAPH:\n${graph}`,
				},
			],
			maxTokens: this.llm!.maxTokens,
			temperature: this.llm!.temperature,
		});
		return { content: result.content };
	},
};

// ─── New v0.8.0 skills ─────────────────────────────────────────

const findContradictions: SkillDefinition = {
	name: "find-contradictions",
	version: "1.0.0",
	description: "Detect contradictory claims across articles",
	input: "wiki",
	output: "report",
	llm: {
		required: true,
		model: "default",
		systemPrompt: `You are an expert fact-checker. Analyze the following knowledge base articles and identify any contradictory claims, inconsistencies, or conflicting information between articles.

For each contradiction found, output:

## Contradiction N
- **Article A**: [title] — "[claim]"
- **Article B**: [title] — "[conflicting claim]"
- **Analysis**: [explain the contradiction and suggest how to resolve it]

If no contradictions are found, say "No contradictions detected."`,
		maxTokens: 4096,
		temperature: 0,
	},
	async run(ctx) {
		const articles = await ctx.vault.readWiki();
		if (articles.length < 2) {
			ctx.logger.warn("Need at least 2 articles to check for contradictions.");
			return { content: "No contradictions detected — fewer than 2 articles in vault." };
		}
		const content = articles
			.slice(0, 15)
			.map((a) => `# ${a.title}\n\n${a.content}`)
			.join("\n\n---\n\n");
		const result = await ctx.llm.complete({
			system: this.llm!.systemPrompt,
			messages: [{ role: "user", content }],
			maxTokens: this.llm!.maxTokens,
			temperature: this.llm!.temperature,
		});
		return { content: result.content };
	},
};

const weeklyDigest: SkillDefinition = {
	name: "weekly-digest",
	version: "1.0.0",
	description: "Generate a weekly summary of new additions",
	input: "vault",
	output: "report",
	llm: {
		required: true,
		model: "fast",
		systemPrompt: `Generate a concise weekly digest of knowledge base activity. Summarize:
1. New articles added this week
2. Key themes and topics covered
3. Notable connections between new and existing content
4. Suggested areas to explore next

Format as a clean markdown newsletter with sections.`,
		maxTokens: 2048,
		temperature: 0.2,
	},
	async run(ctx) {
		const manifest = ctx.vault.manifest;
		const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

		// Find recently added/updated articles
		const recentArticles: string[] = [];
		for (const [slug, entry] of Object.entries(manifest.articles)) {
			if (entry.lastUpdated >= oneWeekAgo || entry.createdAt >= oneWeekAgo) {
				recentArticles.push(slug);
			}
		}

		// Find recently ingested sources
		const recentSources: string[] = [];
		for (const [id, entry] of Object.entries(manifest.sources)) {
			if (entry.ingestedAt >= oneWeekAgo) {
				recentSources.push(entry.metadata.title ?? id);
			}
		}

		const articles = await ctx.vault.readWiki();
		const recentContent = articles
			.filter((a) => recentArticles.includes(a.slug))
			.map((a) => `# ${a.title}\n\n${a.content}`)
			.join("\n\n---\n\n");

		const prompt = `VAULT STATS:
- Total sources: ${manifest.stats.totalSources}
- Total articles: ${manifest.stats.totalArticles}
- Recent sources (last 7 days): ${recentSources.length}
- Recent articles (last 7 days): ${recentArticles.length}

RECENT SOURCES INGESTED:
${recentSources.length > 0 ? recentSources.map((s) => `- ${s}`).join("\n") : "None"}

RECENT ARTICLES:
${recentContent || "No new articles this week."}`;

		const result = await ctx.llm.complete({
			system: this.llm!.systemPrompt,
			messages: [{ role: "user", content: prompt }],
			maxTokens: this.llm!.maxTokens,
			temperature: this.llm!.temperature,
		});
		return { content: result.content };
	},
};

const exportSlides: SkillDefinition = {
	name: "export-slides",
	version: "1.0.0",
	description: "Generate a Marp slide deck from articles",
	input: "wiki",
	output: "report",
	llm: {
		required: true,
		model: "default",
		systemPrompt: `Convert the following knowledge base articles into a Marp-compatible markdown slide deck.

Rules:
- Use "---" to separate slides
- First slide should be a title slide
- Each major concept gets its own slide
- Use bullet points, keep text concise
- Add speaker notes with "<!-- notes: ... -->" where helpful
- Include a summary/conclusion slide at the end
- Start the document with the Marp frontmatter:

---
marp: true
theme: default
paginate: true
---`,
		maxTokens: 8192,
		temperature: 0.1,
	},
	async run(ctx) {
		const articles = await ctx.vault.readWiki();
		if (articles.length === 0) {
			ctx.logger.warn("No articles to export as slides.");
			return {};
		}
		const content = articles
			.slice(0, 8)
			.map((a) => `# ${a.title}\n\n${a.content}`)
			.join("\n\n---\n\n");
		const result = await ctx.llm.complete({
			system: this.llm!.systemPrompt,
			messages: [{ role: "user", content }],
			maxTokens: this.llm!.maxTokens,
			temperature: this.llm!.temperature,
		});
		return { content: result.content };
	},
};

const timeline: SkillDefinition = {
	name: "timeline",
	version: "1.0.0",
	description: "Generate a chronological timeline from articles",
	input: "wiki",
	output: "report",
	llm: {
		required: true,
		model: "default",
		systemPrompt: `Analyze the following knowledge base articles and extract a chronological timeline of events, milestones, and developments.

Output format:
## Timeline

| Date/Period | Event | Source Article |
|---|---|---|
| [date] | [what happened] | [article title] |

After the table, add a "Key Observations" section noting trends and patterns.
If no temporal information is found, explain that and suggest articles that would benefit from dates.`,
		maxTokens: 4096,
		temperature: 0,
	},
	async run(ctx) {
		const articles = await ctx.vault.readWiki();
		if (articles.length === 0) {
			ctx.logger.warn("No articles to build timeline from.");
			return {};
		}
		const content = articles
			.slice(0, 15)
			.map((a) => `# ${a.title}\n\n${a.content}`)
			.join("\n\n---\n\n");
		const result = await ctx.llm.complete({
			system: this.llm!.systemPrompt,
			messages: [{ role: "user", content }],
			maxTokens: this.llm!.maxTokens,
			temperature: this.llm!.temperature,
		});
		return { content: result.content };
	},
};

const compare: SkillDefinition = {
	name: "compare",
	version: "1.0.0",
	description: "Compare two articles or topics side by side",
	input: "selection",
	output: "report",
	llm: {
		required: true,
		model: "default",
		systemPrompt: `Compare the following articles/topics side by side. Create a structured comparison:

## Comparison: [Topic A] vs [Topic B]

### Similarities
- [shared aspects]

### Differences
| Aspect | [Topic A] | [Topic B] |
|---|---|---|
| [aspect] | [detail] | [detail] |

### Key Takeaways
- [insights from the comparison]

### When to Use Which
- [practical guidance]`,
		maxTokens: 4096,
		temperature: 0,
	},
	async run(ctx) {
		const articles = await ctx.vault.readWiki();
		if (articles.length < 2) {
			ctx.logger.warn("Need at least 2 articles to compare.");
			return { content: "Cannot compare — need at least 2 articles." };
		}
		// Compare first two articles (CLI can pass specific articles via args)
		const toCompare = ctx.args.articles
			? articles.filter((a) =>
					(ctx.args.articles as string[]).some(
						(name) =>
							a.title.toLowerCase().includes(name.toLowerCase()) ||
							a.slug.includes(name.toLowerCase()),
					),
				)
			: articles.slice(0, 2);

		if (toCompare.length < 2) {
			ctx.logger.warn("Could not find 2 matching articles to compare.");
			return { content: "Could not find 2 matching articles." };
		}

		const content = toCompare.map((a) => `# ${a.title}\n\n${a.content}`).join("\n\n---\n\n");
		const result = await ctx.llm.complete({
			system: this.llm!.systemPrompt,
			messages: [{ role: "user", content }],
			maxTokens: this.llm!.maxTokens,
			temperature: this.llm!.temperature,
		});
		return { content: result.content };
	},
};

const explain: SkillDefinition = {
	name: "explain",
	version: "1.0.0",
	description: "Explain a topic at a specified reading level",
	input: "selection",
	output: "stdout",
	llm: {
		required: true,
		model: "default",
		systemPrompt: `Explain the following topic from the knowledge base at the specified reading level.

Reading levels:
- "beginner": ELI5 — simple analogies, no jargon, short sentences
- "intermediate": Assume basic familiarity, explain technical terms on first use
- "expert": Dense, precise, assume domain expertise
- "child": Use fun examples, metaphors, and simple language suitable for ages 8-12

Default to "intermediate" if no level specified.

Structure your explanation with:
1. One-sentence summary
2. Core explanation
3. Key takeaways (2-3 bullet points)
4. "Learn more" — suggest related topics from the knowledge base`,
		maxTokens: 2048,
		temperature: 0.2,
	},
	async run(ctx) {
		const articles = await ctx.vault.readWiki();
		if (articles.length === 0) {
			ctx.logger.warn("No articles to explain.");
			return {};
		}

		const level = (ctx.args.level as string) ?? "intermediate";
		const target = ctx.args.topic
			? articles.find(
					(a) =>
						a.title.toLowerCase().includes((ctx.args.topic as string).toLowerCase()) ||
						a.slug.includes((ctx.args.topic as string).toLowerCase()),
				)
			: articles[0];

		if (!target) {
			ctx.logger.warn("Could not find the specified topic.");
			return { content: "Topic not found in the knowledge base." };
		}

		const content = `# ${target.title}\n\n${target.content}`;
		const result = await ctx.llm.complete({
			system: this.llm!.systemPrompt,
			messages: [
				{
					role: "user",
					content: `Reading level: ${level}\n\n${content}`,
				},
			],
			maxTokens: this.llm!.maxTokens,
			temperature: this.llm!.temperature,
		});
		return { content: result.content };
	},
};

const suggestTags: SkillDefinition = {
	name: "suggest-tags",
	version: "1.0.0",
	description: "Auto-tag articles based on content analysis",
	input: "wiki",
	output: "report",
	llm: {
		required: true,
		model: "fast",
		systemPrompt: `Analyze the following knowledge base articles and suggest tags for each one.

Rules:
- Suggest 3-7 tags per article
- Use lowercase, hyphenated tags (e.g., "machine-learning", "web-development")
- Reuse existing tags where appropriate for consistency
- Tags should capture: topic, domain, type (tutorial, concept, reference), and key technologies

Output format:
## Tag Suggestions

### [Article Title]
Current tags: [existing tags or "none"]
Suggested tags: \`tag-1\`, \`tag-2\`, \`tag-3\`
Reason: [brief explanation]`,
		maxTokens: 4096,
		temperature: 0,
	},
	async run(ctx) {
		const articles = await ctx.vault.readWiki();
		if (articles.length === 0) {
			ctx.logger.warn("No articles to tag.");
			return {};
		}

		// Gather existing tags for consistency
		const existingTags = new Set<string>();
		for (const entry of Object.values(ctx.vault.manifest.articles)) {
			for (const tag of entry.tags) {
				existingTags.add(tag);
			}
		}

		const content = articles
			.slice(0, 20)
			.map((a) => {
				const entry = Object.values(ctx.vault.manifest.articles).find(
					(e) =>
						a.slug ===
						Object.keys(ctx.vault.manifest.articles).find(
							(k) => ctx.vault.manifest.articles[k] === e,
						),
				);
				const tags = entry?.tags ?? [];
				return `# ${a.title}\nCurrent tags: [${tags.join(", ")}]\n\n${a.content}`;
			})
			.join("\n\n---\n\n");

		const result = await ctx.llm.complete({
			system: this.llm!.systemPrompt,
			messages: [
				{
					role: "user",
					content: `EXISTING TAGS IN VAULT: ${[...existingTags].join(", ") || "none"}\n\n${content}`,
				},
			],
			maxTokens: this.llm!.maxTokens,
			temperature: this.llm!.temperature,
		});
		return { content: result.content };
	},
};
