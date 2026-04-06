import type { CompletionParams, CompletionResult, LLMProvider, StreamChunk } from "../types.js";

interface OpenAIClient {
	chat: {
		completions: {
			create(params: Record<string, unknown>): Promise<{
				choices: {
					message?: { content: string };
					finish_reason: string;
					delta?: { content?: string };
				}[];
				usage?: { prompt_tokens: number; completion_tokens: number };
			}>;
		};
	};
}

// Lazy-loaded SDK
let OpenAIClass: (new () => OpenAIClient) | null = null;

async function getClient(): Promise<OpenAIClient> {
	if (!OpenAIClass) {
		const mod = await import("openai");
		OpenAIClass = mod.default as unknown as new () => OpenAIClient;
	}
	return new OpenAIClass();
}

export function createOpenAIProvider(model: string): LLMProvider {
	return {
		name: "openai",

		async complete(params: CompletionParams): Promise<CompletionResult> {
			const client = await getClient();
			const response = await client.chat.completions.create({
				model,
				max_tokens: params.maxTokens ?? 4096,
				temperature: params.temperature ?? 0,
				messages: [
					{ role: "system", content: params.system },
					...params.messages.map((m) => ({
						role: m.role as "user" | "assistant",
						content: m.content,
					})),
				],
			});

			return {
				content: response.choices[0]?.message?.content ?? "",
				usage: {
					inputTokens: response.usage?.prompt_tokens ?? 0,
					outputTokens: response.usage?.completion_tokens ?? 0,
				},
				stopReason: response.choices[0]?.finish_reason === "stop" ? "end_turn" : "max_tokens",
			};
		},

		async *stream(params: CompletionParams): AsyncIterable<StreamChunk> {
			const client = await getClient();
			const stream = await client.chat.completions.create({
				model,
				max_tokens: params.maxTokens ?? 4096,
				temperature: params.temperature ?? 0,
				stream: true,
				messages: [
					{ role: "system", content: params.system },
					...params.messages.map((m) => ({
						role: m.role as "user" | "assistant",
						content: m.content,
					})),
				],
			});

			for await (const chunk of stream) {
				const delta = chunk.choices[0]?.delta?.content;
				if (delta) {
					yield { type: "text", text: delta };
				}
			}
		},
	};
}
