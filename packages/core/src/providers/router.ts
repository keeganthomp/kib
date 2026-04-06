import { DEFAULTS } from "../constants.js";
import { NoProviderError } from "../errors.js";
import type { LLMProvider } from "../types.js";

interface DetectedProvider {
	name: string;
	model: string;
}

/**
 * Auto-detect LLM provider from environment variables.
 */
export function detectProvider(): DetectedProvider {
	if (process.env.ANTHROPIC_API_KEY) {
		return { name: "anthropic", model: DEFAULTS.model };
	}
	if (process.env.OPENAI_API_KEY) {
		return { name: "openai", model: "gpt-4o" };
	}
	// Ollama detection is async — handled in createProvider
	return { name: "ollama", model: "llama3" };
}

/**
 * Create an LLM provider instance.
 * Lazy-loads the SDK for the selected provider.
 */
export async function createProvider(providerName?: string, model?: string): Promise<LLMProvider> {
	const detected = detectProvider();
	const name = providerName ?? detected.name;
	const selectedModel = model ?? detected.model;

	switch (name) {
		case "anthropic": {
			if (!process.env.ANTHROPIC_API_KEY) {
				throw new NoProviderError();
			}
			const { createAnthropicProvider } = await import("./anthropic.js");
			return createAnthropicProvider(selectedModel);
		}
		case "openai": {
			if (!process.env.OPENAI_API_KEY) {
				throw new NoProviderError();
			}
			const { createOpenAIProvider } = await import("./openai.js");
			return createOpenAIProvider(selectedModel);
		}
		case "ollama": {
			// Check if Ollama is running
			try {
				const res = await fetch("http://localhost:11434/api/tags");
				if (!res.ok) throw new Error("Not running");
			} catch {
				throw new NoProviderError();
			}
			const { createOllamaProvider } = await import("./ollama.js");
			return createOllamaProvider(selectedModel);
		}
		default:
			throw new NoProviderError();
	}
}
