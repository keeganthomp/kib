import { z } from "zod";
import { DEFAULT_CATEGORIES, DEFAULTS, MANIFEST_VERSION } from "./constants.js";

// ─── Source Types ────────────────────────────────────────────────

export const SourceTypeSchema = z.enum(["web", "pdf", "youtube", "github", "image", "file"]);

// ─── Source Pipeline Status ─────────────────────────────────────

export const SourceStatusSchema = z.enum([
	"queued",
	"extracting",
	"ingested",
	"compiling",
	"compiled",
	"enriched",
	"failed",
]);

// ─── Article Categories ──────────────────────────────────────────

export const ArticleCategorySchema = z.enum(["concept", "topic", "reference", "output"]);

// ─── Source Entry (in manifest) ──────────────────────────────────

export const SourceEntrySchema = z.object({
	hash: z.string(),
	ingestedAt: z.string().datetime(),
	lastCompiled: z.string().datetime().nullable(),
	sourceType: SourceTypeSchema,
	originalUrl: z.string().optional(),
	producedArticles: z.array(z.string()),
	/** Pipeline status — tracked in pipeline.db, mirrored here for portability */
	status: SourceStatusSchema.default("ingested"),
	metadata: z.object({
		title: z.string().optional(),
		author: z.string().optional(),
		date: z.string().optional(),
		wordCount: z.number().int().nonnegative(),
		imageAsset: z.string().optional(),
	}),
});

// ─── Article Entry (in manifest) ─────────────────────────────────

export const ArticleEntrySchema = z.object({
	hash: z.string(),
	createdAt: z.string().datetime(),
	lastUpdated: z.string().datetime(),
	derivedFrom: z.array(z.string()),
	backlinks: z.array(z.string()),
	forwardLinks: z.array(z.string()),
	tags: z.array(z.string()),
	summary: z.string(),
	wordCount: z.number().int().nonnegative(),
	category: ArticleCategorySchema,
});

// ─── Manifest ────────────────────────────────────────────────────

export const ManifestSchema = z.object({
	version: z.literal(MANIFEST_VERSION),
	vault: z.object({
		name: z.string(),
		created: z.string().datetime(),
		lastCompiled: z.string().datetime().nullable(),
		provider: z.string(),
		model: z.string(),
	}),
	sources: z.record(z.string(), SourceEntrySchema),
	articles: z.record(z.string(), ArticleEntrySchema),
	stats: z.object({
		totalSources: z.number().int().nonnegative(),
		totalArticles: z.number().int().nonnegative(),
		totalWords: z.number().int().nonnegative(),
		lastLintAt: z.string().datetime().nullable(),
	}),
});

// ─── Vault Config ────────────────────────────────────────────────

export const VaultConfigSchema = z.object({
	provider: z.object({
		default: z.string().default(DEFAULTS.provider),
		model: z.string().default(DEFAULTS.model),
		fast_model: z.string().default(DEFAULTS.fastModel),
	}),
	compile: z.object({
		auto_index: z.boolean().default(true),
		auto_graph: z.boolean().default(true),
		max_sources_per_pass: z.number().int().positive().default(DEFAULTS.maxSourcesPerPass),
		categories: z.array(z.string()).default([...DEFAULT_CATEGORIES]),
		enrich_cross_refs: z.boolean().default(true),
		max_enrich_articles: z.number().int().positive().default(10),
		max_tokens_per_pass: z.number().int().positive().optional(),
		context_window: z.number().int().positive().default(DEFAULTS.contextWindow),
		max_source_tokens: z.number().int().positive().default(DEFAULTS.maxSourceTokens),
		parallel: z.boolean().default(false),
		max_parallel: z.number().int().positive().default(DEFAULTS.maxParallel),
		model: z.string().optional(),
	}),
	ingest: z.object({
		download_images: z.boolean().default(true),
		max_file_size_mb: z.number().positive().default(DEFAULTS.maxFileSizeMb),
		default_category: z.string().default("articles"),
	}),
	watch: z.object({
		enabled: z.boolean().default(false),
		inbox_path: z.string().default("inbox"),
		auto_compile: z.boolean().default(true),
		poll_interval_ms: z.number().int().positive().default(DEFAULTS.watchPollIntervalMs),
		auto_compile_threshold: z.number().int().positive().default(DEFAULTS.autoCompileThreshold),
		auto_compile_delay_ms: z.number().int().nonnegative().default(DEFAULTS.autoCompileDelayMs),
		log_max_mb: z.number().positive().default(DEFAULTS.watchLogMaxMb),
		folders: z
			.array(
				z.object({
					path: z.string(),
					glob: z.string().default("*"),
					recursive: z.boolean().default(false),
				}),
			)
			.default([]),
		clipboard: z
			.object({
				enabled: z.boolean().default(false),
				min_length: z.number().int().positive().default(DEFAULTS.clipboardMinLength),
				poll_interval_ms: z.number().int().positive().default(DEFAULTS.clipboardPollIntervalMs),
			})
			.default({}),
		screenshots: z
			.object({
				enabled: z.boolean().default(false),
				path: z.string().optional(),
				glob: z.string().default(DEFAULTS.screenshotGlob),
			})
			.default({}),
	}),
	search: z.object({
		engine: z.enum(["builtin", "vector", "hybrid"]).default("builtin"),
		max_results: z.number().int().positive().default(DEFAULTS.searchMaxResults),
	}),
	query: z.object({
		file_output: z.boolean().default(true),
		auto_file: z.boolean().default(true),
		auto_file_threshold: z.number().int().positive().default(3),
		model: z.string().optional(),
	}),
	cache: z.object({
		enabled: z.boolean().default(true),
		ttl_hours: z.number().int().positive().default(DEFAULTS.cacheTtlHours),
		max_size_mb: z.number().positive().default(DEFAULTS.cacheMaxSizeMb),
	}),
	skills: z
		.object({
			hooks: z
				.object({
					"post-compile": z.array(z.string()).default([]),
					"post-ingest": z.array(z.string()).default([]),
					"post-lint": z.array(z.string()).default([]),
				})
				.default({}),
			config: z.record(z.string(), z.record(z.string(), z.unknown())).default({}),
		})
		.default({}),
	sharing: z
		.object({
			enabled: z.boolean().default(false),
			remote: z.string().default(""),
			auto_push: z.boolean().default(false),
			auto_pull: z.boolean().default(false),
		})
		.default({}),
});

// ─── Article Frontmatter ─────────────────────────────────────────

export const ArticleFrontmatterSchema = z.object({
	title: z.string(),
	slug: z.string(),
	category: ArticleCategorySchema,
	tags: z.array(z.string()),
	sources: z.array(z.string()),
	created: z.string(),
	updated: z.string(),
	summary: z.string(),
});

// ─── LLM Provider Types ─────────────────────────────────────────

export const MessageRoleSchema = z.enum(["user", "assistant"]);

export const MessageSchema = z.object({
	role: MessageRoleSchema,
	content: z.string(),
});

export const CompletionParamsSchema = z.object({
	system: z.string(),
	messages: z.array(MessageSchema),
	maxTokens: z.number().int().positive().optional(),
	temperature: z.number().min(0).max(2).optional(),
});

export const CompletionResultSchema = z.object({
	content: z.string(),
	usage: z.object({
		inputTokens: z.number().int().nonnegative(),
		outputTokens: z.number().int().nonnegative(),
	}),
	stopReason: z.enum(["end_turn", "max_tokens", "tool_use"]),
});

// ─── Compile File Operation ──────────────────────────────────────

export const FileOperationSchema = z.object({
	op: z.enum(["create", "update", "delete"]),
	path: z.string(),
	content: z.string().optional(),
});

// ─── Search Result ───────────────────────────────────────────────

export const SearchResultSchema = z.object({
	path: z.string(),
	score: z.number(),
	snippet: z.string(),
	title: z.string().optional(),
});

// ─── Ingest Result ───────────────────────────────────────────────

export const IngestResultSchema = z.object({
	sourceId: z.string(),
	path: z.string(),
	sourceType: SourceTypeSchema,
	title: z.string(),
	wordCount: z.number().int().nonnegative(),
	skipped: z.boolean(),
	skipReason: z.string().optional(),
});

// ─── Compile Result ──────────────────────────────────────────────

export const SourceTokenUsageSchema = z.object({
	sourceId: z.string(),
	sourcePath: z.string(),
	inputTokens: z.number().int().nonnegative(),
	outputTokens: z.number().int().nonnegative(),
	cached: z.boolean(),
	truncated: z.boolean(),
});

export const CompileResultSchema = z.object({
	sourcesCompiled: z.number().int().nonnegative(),
	articlesCreated: z.number().int().nonnegative(),
	articlesUpdated: z.number().int().nonnegative(),
	articlesDeleted: z.number().int().nonnegative(),
	articlesEnriched: z.number().int().nonnegative(),
	operations: z.array(FileOperationSchema),
	tokenUsage: z
		.object({
			totalInputTokens: z.number().int().nonnegative(),
			totalOutputTokens: z.number().int().nonnegative(),
			perSource: z.array(SourceTokenUsageSchema),
		})
		.optional(),
	warnings: z.array(z.string()).optional(),
});

// ─── Lint Diagnostic ─────────────────────────────────────────────

export const LintSeveritySchema = z.enum(["error", "warning", "info"]);
export const LintRuleSchema = z.enum([
	"orphan",
	"stale",
	"missing",
	"broken-link",
	"frontmatter",
	"contradiction",
]);

export const LintDiagnosticSchema = z.object({
	rule: LintRuleSchema,
	severity: LintSeveritySchema,
	message: z.string(),
	path: z.string().optional(),
	fixable: z.boolean(),
});
