/** Directory names within a vault */
export const VAULT_DIR = ".kb";
export const RAW_DIR = "raw";
export const WIKI_DIR = "wiki";
export const INBOX_DIR = "inbox";
export const CACHE_DIR = "cache";
export const SKILLS_DIR = "skills";
export const LOGS_DIR = "logs";

/** Files within .kb/ */
export const MANIFEST_FILE = "manifest.json";
export const CONFIG_FILE = "config.toml";

/** Files within wiki/ */
export const INDEX_FILE = "INDEX.md";
export const GRAPH_FILE = "GRAPH.md";

/** Wiki categories (subdirectories of wiki/) */
export const DEFAULT_CATEGORIES = ["concepts", "topics", "references", "outputs"] as const;

/** Raw source categories (subdirectories of raw/) */
export const RAW_CATEGORIES = ["articles", "papers", "repos", "images", "transcripts"] as const;

/** Default config values */
export const DEFAULTS = {
	provider: "anthropic",
	model: "claude-sonnet-4-20250514",
	fastModel: "claude-haiku-4-5-20251001",
	maxSourcesPerPass: 10,
	searchMaxResults: 20,
	cacheTtlHours: 168, // 7 days
	cacheMaxSizeMb: 500,
	watchPollIntervalMs: 2000,
	maxFileSizeMb: 50,
	compileArticleMinWords: 200,
	compileArticleMaxWords: 1000,
	contextWindow: 200_000, // tokens — conservative default for Claude Sonnet
	maxSourceTokens: 32_000, // auto-summarize sources larger than this
	maxParallel: 3, // max concurrent source compilations
	tokensPerChar: 0.25, // rough estimate: ~4 chars per token
} as const;

/** Manifest version */
export const MANIFEST_VERSION = "1" as const;
