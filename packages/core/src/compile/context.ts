/**
 * Optimized context generation for compilation.
 *
 * Instead of sending the full INDEX.md (which grows linearly with vault size),
 * we generate a compact topic map: a dense representation of the vault's
 * knowledge structure that uses far fewer tokens.
 *
 * Instead of sending all existing articles from a source, we select only
 * articles whose tags overlap with the source's likely topics.
 *
 * Token savings: ~40-70% reduction in context tokens per compilation.
 */
import { DEFAULTS } from "../constants.js";
import type { Manifest } from "../types.js";

// ─── Compact Topic Map ──────────────────────────────────────────

/**
 * Generate a compact topic map from manifest metadata.
 *
 * Instead of the full INDEX.md (with summaries, links, formatting),
 * this produces a dense, structured representation:
 *
 *   TOPIC MAP (47 articles):
 *   concepts: transformer-architecture[deep-learning,nlp], attention-mechanism[nlp,math], ...
 *   topics: machine-learning[ai,ml], neural-networks[deep-learning], ...
 *   references: arxiv-1706-03762[papers,transformer], ...
 *
 * This is ~3-5x more token-efficient than INDEX.md while giving the LLM
 * everything it needs to avoid duplicates and create proper cross-references.
 */
export function generateTopicMap(manifest: Manifest): string {
	const articleCount = Object.keys(manifest.articles).length;
	if (articleCount === 0) return "(empty — first compilation)";

	const byCategory = new Map<string, string[]>();

	for (const [slug, article] of Object.entries(manifest.articles)) {
		const cat = article.category;
		if (!byCategory.has(cat)) byCategory.set(cat, []);

		// Compact format: slug[tag1,tag2]
		const tags = article.tags.slice(0, 4).join(",");
		byCategory.get(cat)!.push(tags ? `${slug}[${tags}]` : slug);
	}

	const lines = [`TOPIC MAP (${articleCount} articles):`];
	for (const [category, entries] of byCategory) {
		lines.push(`${category}: ${entries.join(", ")}`);
	}

	return lines.join("\n");
}

/**
 * Estimate the token savings vs full INDEX.md.
 */
export function estimateTopicMapSavings(
	indexContent: string,
	manifest: Manifest,
): {
	indexTokens: number;
	topicMapTokens: number;
	savedTokens: number;
	savingsPercent: number;
} {
	const topicMap = generateTopicMap(manifest);
	const indexTokens = Math.ceil(indexContent.length * DEFAULTS.tokensPerChar);
	const topicMapTokens = Math.ceil(topicMap.length * DEFAULTS.tokensPerChar);
	const savedTokens = indexTokens - topicMapTokens;
	const savingsPercent = indexTokens > 0 ? Math.round((savedTokens / indexTokens) * 100) : 0;

	return { indexTokens, topicMapTokens, savedTokens, savingsPercent };
}

// ─── Relevant Article Selection ─────────────────────────────────

/**
 * Extract likely topic tags from raw source content using lightweight heuristics.
 * No LLM needed — just looks at frontmatter, headings, and frequent terms.
 */
export function extractSourceTopics(sourceContent: string): Set<string> {
	const topics = new Set<string>();

	// Extract from frontmatter tags if present
	const tagMatch = sourceContent.match(/^tags:\s*\[([^\]]+)\]/m);
	if (tagMatch) {
		for (const tag of tagMatch[1]!.split(",")) {
			topics.add(tag.trim().toLowerCase().replace(/['"]/g, ""));
		}
	}

	// Extract from headings (# lines)
	const headings = sourceContent.match(/^#{1,3}\s+(.+)$/gm) ?? [];
	for (const heading of headings) {
		const text = heading.replace(/^#+\s+/, "").toLowerCase();
		// Split heading into meaningful words
		for (const word of text.split(/[\s,;:]+/)) {
			const clean = word.replace(/[^a-z0-9-]/g, "");
			if (clean.length >= 4) topics.add(clean);
		}
	}

	// Extract hyphenated terms (often technical concepts)
	const hyphenated = sourceContent.match(/\b[a-z]+-[a-z]+(?:-[a-z]+)*\b/g) ?? [];
	for (const term of hyphenated.slice(0, 20)) {
		if (term.length >= 5) topics.add(term);
	}

	return topics;
}

/**
 * Select only the articles relevant to the source being compiled.
 *
 * Instead of sending ALL articles a source previously produced,
 * this scores articles by tag/topic overlap and returns the top N.
 * Articles with zero relevance are excluded entirely.
 *
 * For re-compilations (source already has producedArticles), those
 * articles are always included regardless of score.
 */
export function selectRelevantArticles(
	manifest: Manifest,
	sourceTopics: Set<string>,
	producedArticleSlugs: string[],
	maxArticles = 8,
): string[] {
	// Always include articles this source previously produced
	const required = new Set(producedArticleSlugs);

	// Score all other articles by topic overlap
	const scored: { slug: string; score: number }[] = [];

	for (const [slug, article] of Object.entries(manifest.articles)) {
		if (required.has(slug)) continue;

		let score = 0;
		for (const tag of article.tags) {
			if (sourceTopics.has(tag)) score += 3;
		}
		// Slug word overlap
		for (const part of slug.split("-")) {
			if (sourceTopics.has(part) && part.length >= 4) score += 1;
		}

		if (score > 0) {
			scored.push({ slug, score });
		}
	}

	// Sort by score descending, take top N
	scored.sort((a, b) => b.score - a.score);
	const relevant = scored.slice(0, maxArticles - required.size).map((s) => s.slug);

	return [...required, ...relevant];
}

// ─── Fast Model Routing ─────────────────────────────────────────

/**
 * Determine whether a source should use the fast model for compilation.
 *
 * Short/simple sources (< 2000 words, no code blocks, no complex structure)
 * can be compiled with the fast model at significantly lower cost and latency.
 */
export function shouldUseFastModel(sourceContent: string, wordCount: number): boolean {
	// Short sources are fast-model candidates
	if (wordCount > 2000) return false;

	// Sources with code blocks need the full model
	const codeBlocks = (sourceContent.match(/```/g) ?? []).length / 2;
	if (codeBlocks > 3) return false;

	// Sources with many headings are structurally complex
	const headings = (sourceContent.match(/^#{1,6}\s/gm) ?? []).length;
	if (headings > 10) return false;

	// Sources with tables need more reasoning
	if (sourceContent.includes("|---") || sourceContent.includes("| ---")) return false;

	return true;
}
