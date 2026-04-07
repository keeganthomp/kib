import type { z } from "zod";
import type {
	ArticleCategorySchema,
	ArticleEntrySchema,
	ArticleFrontmatterSchema,
	CompileResultSchema,
	CompletionParamsSchema,
	CompletionResultSchema,
	FileOperationSchema,
	IngestResultSchema,
	LintDiagnosticSchema,
	LintRuleSchema,
	LintSeveritySchema,
	ManifestSchema,
	MessageRoleSchema,
	MessageSchema,
	SearchResultSchema,
	SourceEntrySchema,
	SourceTokenUsageSchema,
	SourceTypeSchema,
	VaultConfigSchema,
} from "./schemas.js";

// ─── Core Data Types ─────────────────────────────────────────────

export type SourceType = z.infer<typeof SourceTypeSchema>;
export type ArticleCategory = z.infer<typeof ArticleCategorySchema>;
export type SourceEntry = z.infer<typeof SourceEntrySchema>;
export type ArticleEntry = z.infer<typeof ArticleEntrySchema>;
export type Manifest = z.infer<typeof ManifestSchema>;
export type VaultConfig = z.infer<typeof VaultConfigSchema>;
export type ArticleFrontmatter = z.infer<typeof ArticleFrontmatterSchema>;

// ─── LLM Types ───────────────────────────────────────────────────

export type MessageRole = z.infer<typeof MessageRoleSchema>;
export type Message = z.infer<typeof MessageSchema>;
export type CompletionParams = z.infer<typeof CompletionParamsSchema>;
export type CompletionResult = z.infer<typeof CompletionResultSchema>;

// ─── Operation Types ─────────────────────────────────────────────

export type FileOperation = z.infer<typeof FileOperationSchema>;
export type SourceTokenUsage = z.infer<typeof SourceTokenUsageSchema>;
export type SearchResult = z.infer<typeof SearchResultSchema>;
export type IngestResult = z.infer<typeof IngestResultSchema>;
export type CompileResult = z.infer<typeof CompileResultSchema>;

// ─── Lint Types ──────────────────────────────────────────────────

export type LintSeverity = z.infer<typeof LintSeveritySchema>;
export type LintRule = z.infer<typeof LintRuleSchema>;
export type LintDiagnostic = z.infer<typeof LintDiagnosticSchema>;

// ─── Provider Interface ──────────────────────────────────────────

export interface StreamChunk {
	type: "text" | "usage";
	text?: string;
	usage?: { inputTokens: number; outputTokens: number };
}

export interface LLMProvider {
	name: string;

	complete(params: CompletionParams): Promise<CompletionResult>;

	stream(params: CompletionParams): AsyncIterable<StreamChunk>;

	/** Optional: for vision-based ingest */
	vision?(params: { image: Buffer; prompt: string; mimeType?: string }): Promise<string>;

	/** Optional: generate embeddings for semantic search */
	embed?(texts: string[]): Promise<Float32Array[]>;
}

// ─── Skill Types ─────────────────────────────────────────────────

export interface SkillContext {
	vault: {
		readIndex(): Promise<string>;
		readGraph(): Promise<string>;
		readWiki(): Promise<{ title: string; slug: string; content: string }[]>;
		readRaw(): Promise<{ path: string; content: string }[]>;
		readFile(path: string): Promise<string>;
		writeFile(path: string, content: string): Promise<void>;
		listFiles(glob: string): Promise<string[]>;
		manifest: Manifest;
		config: VaultConfig;
	};

	llm: {
		complete(params: CompletionParams): Promise<CompletionResult>;
		stream(params: CompletionParams): AsyncIterable<StreamChunk>;
	};

	search: {
		query(term: string, opts?: { limit?: number }): Promise<SearchResult[]>;
	};

	logger: {
		info(msg: string): void;
		warn(msg: string): void;
		error(msg: string): void;
	};

	args: Record<string, unknown>;
}

export interface SkillDefinition {
	name: string;
	version: string;
	description: string;
	author?: string;

	input: "wiki" | "raw" | "vault" | "selection" | "index" | "none";
	output: "articles" | "report" | "mutations" | "stdout" | "none";

	llm?: {
		required: boolean;
		model: "default" | "fast";
		systemPrompt: string;
		maxTokens?: number;
		temperature?: number;
	};

	run(ctx: SkillContext): Promise<{ content?: string }>;
}

// ─── Extract Types ───────────────────────────────────────────────

export interface ExtractResult {
	title: string;
	content: string;
	metadata: Record<string, unknown>;
}

export interface Extractor {
	type: SourceType;
	extract(input: string): Promise<ExtractResult>;
}
