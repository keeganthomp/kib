export class KibError extends Error {
	constructor(
		message: string,
		public readonly code: string,
	) {
		super(message);
		this.name = "KibError";
	}
}

export class VaultNotFoundError extends KibError {
	constructor(path?: string) {
		super(
			path
				? `No vault found at ${path}. Run 'kib init' to create one.`
				: "No vault found. Run 'kib init' to create one.",
			"VAULT_NOT_FOUND",
		);
		this.name = "VaultNotFoundError";
	}
}

export class VaultExistsError extends KibError {
	constructor(path: string) {
		super(`Vault already exists at ${path}. Use --force to reinitialize.`, "VAULT_EXISTS");
		this.name = "VaultExistsError";
	}
}

export class ProviderError extends KibError {
	constructor(message: string) {
		super(message, "PROVIDER_ERROR");
		this.name = "ProviderError";
	}
}

export class NoProviderError extends KibError {
	constructor(provider?: string) {
		const messages: Record<string, string> = {
			anthropic:
				"No Anthropic API key found. Set ANTHROPIC_API_KEY in your environment or add it to ~/.config/kib/credentials",
			openai:
				"No OpenAI API key found. Set OPENAI_API_KEY in your environment or add it to ~/.config/kib/credentials",
			ollama: "Ollama is not running. Start it with: ollama serve",
		};
		super(
			messages[provider ?? ""] ??
				"No LLM provider configured. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or start Ollama.",
			"NO_PROVIDER",
		);
		this.name = "NoProviderError";
	}
}

export class IngestError extends KibError {
	constructor(message: string) {
		super(message, "INGEST_ERROR");
		this.name = "IngestError";
	}
}

export class CompileError extends KibError {
	constructor(message: string) {
		super(message, "COMPILE_ERROR");
		this.name = "CompileError";
	}
}

export class ManifestError extends KibError {
	constructor(message: string) {
		super(message, "MANIFEST_ERROR");
		this.name = "ManifestError";
	}
}

export type ShareErrorCode =
	| "GIT_NOT_INSTALLED"
	| "GIT_NO_IDENTITY"
	| "AUTH_FAILED"
	| "REMOTE_NOT_FOUND"
	| "NETWORK_ERROR"
	| "PUSH_REJECTED"
	| "NOT_SHARED"
	| "NOT_A_VAULT"
	| "SHARE_ERROR";

export class ShareError extends KibError {
	public readonly hint: string;

	constructor(message: string, code: ShareErrorCode, hint: string) {
		super(message, code);
		this.name = "ShareError";
		this.hint = hint;
	}
}
