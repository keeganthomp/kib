import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CompletionParams, CompletionResult, LLMProvider, StreamChunk } from "../types.js";
import { initVault, writeWiki } from "../vault.js";
import { SearchIndex } from "../search/engine.js";
import { queryVault } from "./query.js";

let tempDir: string;

afterEach(async () => {
	if (tempDir) await rm(tempDir, { recursive: true, force: true });
});

async function makeTempVault() {
	tempDir = await mkdtemp(join(tmpdir(), "kib-query-test-"));
	await initVault(tempDir, { name: "test" });
	return tempDir;
}

function mockProvider(response: string): LLMProvider {
	return {
		name: "mock",
		async complete(): Promise<CompletionResult> {
			return {
				content: response,
				usage: { inputTokens: 500, outputTokens: 100 },
				stopReason: "end_turn",
			};
		},
		async *stream(): AsyncIterable<StreamChunk> {
			for (const char of response) {
				yield { type: "text", text: char };
			}
			yield { type: "usage", usage: { inputTokens: 500, outputTokens: 100 } };
		},
	};
}

function articleMd(title: string, slug: string, content: string): string {
	return `---
title: ${title}
slug: ${slug}
category: concept
tags: []
summary: ""
---

# ${title}

${content}`;
}

describe("queryVault", () => {
	test("queries relevant articles and returns answer", async () => {
		const root = await makeTempVault();

		await writeWiki(
			root,
			"concepts/transformers.md",
			articleMd(
				"Transformer Architecture",
				"transformer-architecture",
				"The transformer is a neural network architecture based on self-attention.",
			),
		);
		await writeWiki(
			root,
			"concepts/attention.md",
			articleMd(
				"Attention Mechanisms",
				"attention-mechanisms",
				"Attention computes weighted sums over value vectors.",
			),
		);

		// Build search index so query can find articles
		const index = new SearchIndex();
		await index.build(root, "wiki");
		await index.save(root);

		const provider = mockProvider(
			"The transformer architecture uses self-attention [Transformer Architecture].",
		);

		const result = await queryVault(root, "How do transformers work?", provider);

		expect(result.answer).toContain("transformer");
		expect(result.sourcePaths.length).toBeGreaterThan(0);
		expect(result.usage.inputTokens).toBeGreaterThan(0);
	});

	test("returns answer even with empty wiki", async () => {
		const root = await makeTempVault();

		const provider = mockProvider(
			"No relevant articles found in the knowledge base.",
		);

		const result = await queryVault(root, "What is a transformer?", provider);
		expect(result.answer).toBeTruthy();
	});

	test("supports streaming mode", async () => {
		const root = await makeTempVault();
		await writeWiki(
			root,
			"concepts/test.md",
			articleMd("Test", "test", "Test content for streaming."),
		);

		const index = new SearchIndex();
		await index.build(root, "wiki");
		await index.save(root);

		const provider = mockProvider("Streamed answer.");

		const chunks: string[] = [];
		const result = await queryVault(root, "test", provider, {
			onChunk: (text) => chunks.push(text),
		});

		expect(chunks.length).toBeGreaterThan(0);
		expect(chunks.join("")).toBe("Streamed answer.");
		expect(result.answer).toBe("Streamed answer.");
	});

	test("supports conversation history", async () => {
		const root = await makeTempVault();
		await writeWiki(
			root,
			"concepts/test.md",
			articleMd("Test", "test", "Test content."),
		);

		const index = new SearchIndex();
		await index.build(root, "wiki");
		await index.save(root);

		// Track what gets sent to the provider
		let receivedMessages: any[] = [];
		const provider: LLMProvider = {
			name: "mock",
			async complete(params: CompletionParams): Promise<CompletionResult> {
				receivedMessages = params.messages;
				return {
					content: "Answer with history.",
					usage: { inputTokens: 100, outputTokens: 50 },
					stopReason: "end_turn",
				};
			},
			async *stream(): AsyncIterable<StreamChunk> {
				yield { type: "text", text: "stream" };
			},
		};

		await queryVault(root, "follow up question", provider, {
			history: [
				{ role: "user", content: "previous question" },
				{ role: "assistant", content: "previous answer" },
			],
		});

		// Should include history + new question
		expect(receivedMessages.length).toBe(3);
		expect(receivedMessages[0]!.content).toBe("previous question");
		expect(receivedMessages[1]!.content).toBe("previous answer");
		expect(receivedMessages[2]!.content).toContain("follow up question");
	});
});
