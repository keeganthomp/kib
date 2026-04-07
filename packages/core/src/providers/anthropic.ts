import type { CompletionParams, CompletionResult, LLMProvider, StreamChunk } from "../types.js";

interface ContentBlock {
	type: string;
	text?: string;
}

// Lazy-loaded SDK
let AnthropicClass: (new () => AnthropicClient) | null = null;

interface AnthropicClient {
	messages: {
		create(params: Record<string, unknown>): Promise<{
			content: ContentBlock[];
			usage: { input_tokens: number; output_tokens: number };
			stop_reason: string;
		}>;
		stream(params: Record<string, unknown>): AsyncIterable<{
			type: string;
			delta: { type: string; text: string };
			usage?: { input_tokens: number; output_tokens: number };
		}>;
	};
}

async function getClient(): Promise<AnthropicClient> {
	if (!AnthropicClass) {
		const mod = await import("@anthropic-ai/sdk");
		AnthropicClass = mod.default as unknown as new () => AnthropicClient;
	}
	return new AnthropicClass();
}

export function createAnthropicProvider(model: string): LLMProvider {
	return {
		name: "anthropic",

		async complete(params: CompletionParams): Promise<CompletionResult> {
			const client = await getClient();
			const response = await client.messages.create({
				model,
				max_tokens: params.maxTokens ?? 4096,
				temperature: params.temperature ?? 0,
				system: params.system,
				messages: params.messages.map((m) => ({
					role: m.role,
					content: m.content,
				})),
			});

			const content = response.content
				.filter((b) => b.type === "text")
				.map((b) => b.text ?? "")
				.join("");

			return {
				content,
				usage: {
					inputTokens: response.usage.input_tokens,
					outputTokens: response.usage.output_tokens,
				},
				stopReason: response.stop_reason === "end_turn" ? "end_turn" : "max_tokens",
			};
		},

		async *stream(params: CompletionParams): AsyncIterable<StreamChunk> {
			const client = await getClient();
			const stream = await client.messages.stream({
				model,
				max_tokens: params.maxTokens ?? 4096,
				temperature: params.temperature ?? 0,
				system: params.system,
				messages: params.messages.map((m) => ({
					role: m.role,
					content: m.content,
				})),
			});

			for await (const event of stream) {
				if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
					yield { type: "text", text: event.delta.text };
				}
				if (event.type === "message_delta" && event.usage) {
					yield {
						type: "usage",
						usage: {
							inputTokens: event.usage.input_tokens ?? 0,
							outputTokens: event.usage.output_tokens ?? 0,
						},
					};
				}
			}
		},

		async vision(params: { image: Buffer; prompt: string; mimeType?: string }): Promise<string> {
			const client = await getClient();
			const response = await client.messages.create({
				model,
				max_tokens: 4096,
				messages: [
					{
						role: "user",
						content: [
							{
								type: "image",
								source: {
									type: "base64",
									media_type: params.mimeType ?? "image/png",
									data: params.image.toString("base64"),
								},
							},
							{
								type: "text",
								text: params.prompt,
							},
						],
					},
				],
			});

			return response.content
				.filter((b) => b.type === "text")
				.map((b) => b.text ?? "")
				.join("");
		},
	};
}
