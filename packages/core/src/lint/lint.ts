import type { LintDiagnostic } from "../types.js";
import { loadManifest } from "../vault.js";
import { ALL_RULES } from "./rules.js";

export interface LintOptions {
	/** Run only a specific rule */
	ruleFilter?: string;
	/** Callback for progress updates */
	onProgress?: (msg: string) => void;
}

export interface LintResult {
	diagnostics: LintDiagnostic[];
	errors: number;
	warnings: number;
	infos: number;
}

/**
 * Run lint checks on the wiki.
 */
export async function lintVault(root: string, options: LintOptions = {}): Promise<LintResult> {
	const manifest = await loadManifest(root);

	const rules = options.ruleFilter
		? ALL_RULES.filter((r) => r.name === options.ruleFilter)
		: ALL_RULES;

	const allDiagnostics: LintDiagnostic[] = [];

	for (const rule of rules) {
		options.onProgress?.(`Running ${rule.name} check...`);
		const diagnostics = await rule.fn(root, manifest);
		allDiagnostics.push(...diagnostics);
	}

	return {
		diagnostics: allDiagnostics,
		errors: allDiagnostics.filter((d) => d.severity === "error").length,
		warnings: allDiagnostics.filter((d) => d.severity === "warning").length,
		infos: allDiagnostics.filter((d) => d.severity === "info").length,
	};
}
