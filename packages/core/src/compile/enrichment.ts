import { hash } from "../hash.js";
import { countWords } from "../ingest/normalize.js";
import type { CompileResult, LLMProvider, Manifest } from "../types.js";
import { readWiki, writeWiki } from "../vault.js";
import { extractWikilinks, parseCompileOutput, parseFrontmatter } from "./diff.js";
import { enrichSystemPrompt, enrichUserPrompt } from "./prompts.js";

// ─── Types ──────────────────────────────────────────────────────

export interface EnrichmentOptions {
	maxArticles?: number;
	dryRun?: boolean;
	onProgress?: (msg: string) => void;
}

export interface EnrichmentResult {
	articlesEnriched: number;
	operations: CompileResult["operations"];
}

interface EnrichmentCandidate {
	slug: string;
	score: number;
	relatedNewSlugs: string[];
}

// ─── Category → directory mapping ───────────────────────────────

const CATEGORY_DIRS: Record<string, string> = {
	concept: "concepts",
	topic: "topics",
	reference: "references",
	output: "outputs",
};

export function slugToWikiPath(slug: string, category: string): string {
	const dir = CATEGORY_DIRS[category] ?? "topics";
	return `${dir}/${slug}.md`;
}

// ─── Candidate Selection ────────────────────────────────────────

export function findEnrichmentCandidates(
	manifest: Manifest,
	newlyChangedSlugs: Set<string>,
	maxCandidates: number,
): EnrichmentCandidate[] {
	const candidates = new Map<string, EnrichmentCandidate>();

	for (const newSlug of newlyChangedSlugs) {
		const newArticle = manifest.articles[newSlug];
		if (!newArticle) continue;

		for (const [existingSlug, existingArticle] of Object.entries(manifest.articles)) {
			// Skip articles just compiled in this pass
			if (newlyChangedSlugs.has(existingSlug)) continue;
			// Skip if already links to the new article
			if (existingArticle.forwardLinks.includes(newSlug)) continue;

			let score = 0;

			// Tag overlap: +3 per shared tag
			for (const tag of newArticle.tags) {
				if (existingArticle.tags.includes(tag)) score += 3;
			}

			// Link proximity: +2 if existing links to something that links to new
			for (const fwdLink of existingArticle.forwardLinks) {
				const linked = manifest.articles[fwdLink];
				if (linked?.forwardLinks.includes(newSlug)) {
					score += 2;
					break;
				}
			}

			// Category affinity: +1 for same category
			if (existingArticle.category === newArticle.category) {
				score += 1;
			}

			if (score > 0) {
				if (!candidates.has(existingSlug)) {
					candidates.set(existingSlug, { slug: existingSlug, score: 0, relatedNewSlugs: [] });
				}
				const c = candidates.get(existingSlug)!;
				c.score += score;
				c.relatedNewSlugs.push(newSlug);
			}
		}
	}

	return [...candidates.values()].sort((a, b) => b.score - a.score).slice(0, maxCandidates);
}

// ─── Enrichment Engine ──────────────────────────────────────────

export async function enrichCrossReferences(
	root: string,
	provider: LLMProvider,
	manifest: Manifest,
	newlyChangedSlugs: Set<string>,
	options: EnrichmentOptions = {},
): Promise<EnrichmentResult> {
	const maxArticles = options.maxArticles ?? 10;
	const result: EnrichmentResult = { articlesEnriched: 0, operations: [] };

	const candidates = findEnrichmentCandidates(manifest, newlyChangedSlugs, maxArticles);
	if (candidates.length === 0) return result;

	const today = new Date().toISOString().split("T")[0]!;

	for (const candidate of candidates) {
		const article = manifest.articles[candidate.slug];
		if (!article) continue;

		const wikiPath = slugToWikiPath(candidate.slug, article.category);

		let articleContent: string;
		try {
			articleContent = await readWiki(root, wikiPath);
		} catch {
			continue; // File missing, skip
		}

		// Build summaries for related new articles
		const newArticleSummaries = candidate.relatedNewSlugs
			.map((slug) => {
				const a = manifest.articles[slug];
				if (!a) return null;
				return {
					slug,
					title: a.summary.split(".")[0] ?? slug,
					summary: a.summary,
					tags: a.tags,
				};
			})
			.filter((a) => a !== null);

		if (newArticleSummaries.length === 0) continue;

		options.onProgress?.(`Enriching ${candidate.slug}...`);

		try {
			const response = await provider.complete({
				system: enrichSystemPrompt(),
				messages: [
					{
						role: "user",
						content: enrichUserPrompt({
							articlePath: `wiki/${wikiPath}`,
							articleContent,
							newArticles: newArticleSummaries,
							today,
						}),
					},
				],
				temperature: 0,
				maxTokens: 4096,
			});

			const operations = parseCompileOutput(response.content);
			if (operations.length === 0) continue;

			for (const op of operations) {
				if (op.op !== "update" || !op.content) continue;

				if (!options.dryRun) {
					await writeWiki(root, wikiPath, op.content);
				}

				// Update manifest
				const { frontmatter, body } = parseFrontmatter(op.content);
				const contentHash = await hash(op.content);
				const wikilinks = extractWikilinks(op.content);

				manifest.articles[candidate.slug] = {
					...article,
					hash: contentHash,
					lastUpdated: new Date().toISOString(),
					forwardLinks: wikilinks,
					tags: Array.isArray(frontmatter.tags) ? (frontmatter.tags as string[]) : article.tags,
					wordCount: countWords(body),
				};

				result.articlesEnriched++;
				result.operations.push(op);
			}
		} catch (err) {
			options.onProgress?.(`Failed to enrich ${candidate.slug}: ${(err as Error).message}`);
			// Continue with other candidates
		}
	}

	return result;
}
