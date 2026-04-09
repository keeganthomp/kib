export type { BackupEntry } from "./backup.js";
export { createBackup, listBackups, pruneBackups, restoreBackup } from "./backup.js";
export { buildLinkGraph, generateGraphMd } from "./compile/backlinks.js";
export { CompileCache } from "./compile/cache.js";
export type { ArticleEvent, CompileOptions } from "./compile/compiler.js";
export { compileVault } from "./compile/compiler.js";
export { extractWikilinks, parseCompileOutput, parseFrontmatter } from "./compile/diff.js";
export { enrichCrossReferences } from "./compile/enrichment.js";
export { computeStats, generateIndexMd } from "./compile/index-manager.js";
export * from "./constants.js";
export * from "./daemon/index.js";
export * from "./errors.js";
export * from "./hash.js";
export { ingestSource } from "./ingest/ingest.js";
export { countWords, slugify } from "./ingest/normalize.js";
export { detectSourceType } from "./ingest/router.js";
export type { IntegrityIssue } from "./integrity.js";
export { validateManifestIntegrity } from "./integrity.js";
export { fixLintIssues, lintVault } from "./lint/lint.js";
export { ALL_RULES } from "./lint/rules.js";
export { acquireLock, isLocked, releaseLock, VaultLockError, withLock } from "./lockfile.js";
export { createProvider, detectProvider } from "./providers/router.js";
export { queryVault } from "./query/query.js";
export type { RecoveryIssue } from "./recovery.js";
export { detectIssues, repairVault } from "./recovery.js";
export * from "./schemas.js";
export { highlightSnippet, parseQuery, SearchIndex } from "./search/engine.js";
export { HybridSearch } from "./search/hybrid.js";
export { VectorIndex } from "./search/vector.js";
export { getBuiltinSkills } from "./skills/builtins.js";
export { getHookedSkills, runSkillHooks } from "./skills/hooks.js";
export { findSkill, loadSkills } from "./skills/loader.js";
export {
	createSkill,
	installSkill,
	listInstalledSkills,
	publishSkill,
	resolveSkillDependencies,
	uninstallSkill,
} from "./skills/registry.js";
export { runSkill } from "./skills/runner.js";
export {
	SkillConfigSchema,
	SkillDefinitionSchema,
	SkillHookSchema,
	SkillPackageSchema,
} from "./skills/schema.js";
export * from "./types.js";
export * from "./vault.js";
