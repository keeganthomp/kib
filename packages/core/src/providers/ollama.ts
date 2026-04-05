import type { CompletionParams, CompletionResult, LLMProvider, StreamChunk } from "../types.js";

const OLLAMA_BASE = "http://localhost:11434";

export function createOllamaProvider(model: string): LLMProvider {
	return {
		name: "ollama",

		async complete(params: CompletionParams): Promise<CompletionResult> {
			const messages = [
				{ role: "system", content: params.system },
				...params.messages.map((m) => ({ role: m.role, content: m.content })),
			];

			const response = await fetch(`${OLLAMA_BASE}/api/chat`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					model,
					messages,
					stream: false,
					options: {
						temperature: params.temperature ?? 0,
						num_predict: params.maxTokens ?? 4096,
					},
				}),
			});

			if (!response.ok) {
				throw new Error(`Ollama request failed: ${response.status} ${response.statusText}`);
			}

			const data = (await response.json()) as any;
			return {
				content: data.message?.content ?? "",
				usage: {
					inputTokens: data.prompt_eval_count ?? 0,
					outputTokens: data.eval_count ?? 0,
				},
				stopReason: "end_turn",
			};
		},

		async *stream(params: CompletionParams): AsyncIterable<StreamChunk> {
			const messages = [
				{ role: "system", content: params.system },
				...params.messages.map((m) => ({ role: m.role, content: m.content })),
			];

			const response = await fetch(`${OLLAMA_BASE}/api/chat`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					model,
					messages,
					stream: true,
					options: {
						temperature: params.temperature ?? 0,
						num_predict: params.maxTokens ?? 4096,
					},
				}),
			});

			if (!response.ok) {
				throw new Error(`Ollama request failed: ${response.status} ${response.statusText}`);
			}

			const reader = response.body?.getReader();
			if (!reader) return;

			const decoder = new TextDecoder();
			let buffer = "";

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split("\n");
				buffer = lines.pop() ?? "";

				for (const line of lines) {
					if (!line.trim()) continue;
					const data = JSON.parse(line) as any;
					if (data.message?.content) {
						yield { type: "text", text: data.message.content };
					}
					if (data.done && data.eval_count) {
						yield {
							type: "usage",
							usage: {
								inputTokens: data.prompt_eval_count ?? 0,
								outputTokens: data.eval_count ?? 0,
							},
						};
					}
				}
			}
		},
	};
}
