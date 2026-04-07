import { readFile } from "node:fs/promises";
import { WIKI_DIR } from "../constants.js";
import type { LintDiagnostic, LLMProvider, Manifest } from "../types.js";

const SYSTEM_PROMPT = `You are a fact-checker reviewing wiki articles for contradictions.

You receive two related articles from the same knowledge base. Your job is to identify any factual contradictions — cases where the two articles make conflicting claims about the same thing.

RULES:
- Only report genuine contradictions, not differences in scope or emphasis
- A contradiction is when Article A says X and Article B says NOT-X about the same fact
- Different perspectives or opinions are NOT contradictions
- Missing information is NOT a contradiction
- Be specific: quote the conflicting claims from each article

OUTPUT FORMAT:
Respond with ONLY a JSON array. Each entry is a contradiction found:
[
  {
    "claim_a": "brief quote or paraphrase from article A",
    "claim_b": "brief quote or paraphrase from article B",
    "description": "one-sentence explanation of the contradiction"
  }
]

If no contradictions found, respond with:
[]`;

interface Contradiction {
	claim_a: string;
	claim_b: string;
	description: string;
}

/**
 * Find article pairs that are likely to discuss overlapping topics.
 * Returns pairs of [slugA, slugB] where slugA < slugB (to avoid duplicates).
 */
function findRelatedPairs(
	manifest: Manifest,
	maxPairs: number,
): { slugA: string; slugB: string; score: number }[] {
	const pairs: { slugA: string; slugB: string; score: number }[] = [];
	const slugs = Object.keys(manifest.articles);

	for (let i = 0; i < slugs.length; i++) {
		for (let j = i + 1; j < slugs.length; j++) {
			const a = manifest.articles[slugs[i]!]!;
			const b = manifest.articles[slugs[j]!]!;

			let score = 0;

			// Tag overlap
			for (const tag of a.tags) {
				if (b.tags.includes(tag)) score += 2;
			}

			// Direct link between them
			if (a.forwardLinks.includes(slugs[j]!) || b.forwardLinks.includes(slugs[i]!)) {
				score += 3;
			}

			if (score >= 3) {
				pairs.push({ slugA: slugs[i]!, slugB: slugs[j]!, score });
			}
		}
	}

	return pairs.sort((a, b) => b.score - a.score).slice(0, maxPairs);
}

const CATEGORY_DIRS: Record<string, string> = {
	concept: "concepts",
	topic: "topics",
	reference: "references",
	output: "outputs",
};

/**
 * LLM-powered lint rule: detect contradictions between related articles.
 */
export async function contradictionRule(
	root: string,
	manifest: Manifest,
	provider: LLMProvider,
): Promise<LintDiagnostic[]> {
	const diagnostics: LintDiagnostic[] = [];
	const pairs = findRelatedPairs(manifest, 10);

	if (pairs.length === 0) return diagnostics;

	const wikiDir = `${root}/${WIKI_DIR}`;

	for (const { slugA, slugB } of pairs) {
		const articleA = manifest.articles[slugA]!;
		const articleB = manifest.articles[slugB]!;

		const dirA = CATEGORY_DIRS[articleA.category] ?? "topics";
		const dirB = CATEGORY_DIRS[articleB.category] ?? "topics";

		let contentA: string;
		let contentB: string;
		try {
			contentA = await readFile(`${wikiDir}/${dirA}/${slugA}.md`, "utf-8");
			contentB = await readFile(`${wikiDir}/${dirB}/${slugB}.md`, "utf-8");
		} catch {
			continue; // File missing, skip pair
		}

		try {
			const response = await provider.complete({
				system: SYSTEM_PROMPT,
				messages: [
					{
						role: "user",
						content: `ARTICLE A (${slugA}):\n${contentA}\n\nARTICLE B (${slugB}):\n${contentB}`,
					},
				],
				temperature: 0,
				maxTokens: 2048,
			});

			const contradictions = parseContradictions(response.content);

			for (const c of contradictions) {
				diagnostics.push({
					rule: "contradiction",
					severity: "warning",
					message: `${c.description} — "${c.claim_a}" vs "${c.claim_b}"`,
					path: `${dirA}/${slugA}.md ↔ ${dirB}/${slugB}.md`,
					fixable: false,
				});
			}
		} catch {
			// LLM call failed — skip this pair silently
		}
	}

	return diagnostics;
}

function parseContradictions(content: string): Contradiction[] {
	try {
		// Strip markdown code fences if present
		let cleaned = content.trim();
		if (cleaned.startsWith("```")) {
			cleaned = cleaned.replace(/^```\w*\n?/, "").replace(/\n?```$/, "");
		}

		const parsed = JSON.parse(cleaned);
		if (!Array.isArray(parsed)) return [];

		return parsed.filter(
			(c) =>
				typeof c === "object" &&
				c !== null &&
				typeof c.claim_a === "string" &&
				typeof c.claim_b === "string" &&
				typeof c.description === "string",
		);
	} catch {
		return [];
	}
}
