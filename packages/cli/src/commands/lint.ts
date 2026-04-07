import { resolveVaultRoot, VaultNotFoundError } from "@kibhq/core";
import { debug, debugTime } from "../ui/debug.js";
import * as log from "../ui/logger.js";
import { createSpinner } from "../ui/spinner.js";

interface LintOpts {
	fix?: boolean;
	check?: string;
	json?: boolean;
}

export async function lint(opts: LintOpts) {
	let root: string;
	try {
		root = resolveVaultRoot();
	} catch (err) {
		if (err instanceof VaultNotFoundError) {
			log.error(err.message);
			process.exit(1);
		}
		throw err;
	}

	const { lintVault, createProvider, loadConfig } = await import("@kibhq/core");

	log.header("linting wiki");

	// Try to load LLM provider for AI-powered rules (contradiction detection)
	let provider: import("@kibhq/core").LLMProvider | undefined;
	try {
		const config = await loadConfig(root);
		provider = await createProvider(config.provider.default, config.provider.model);
	} catch {
		// No provider available — AI-powered lint rules will be skipped
	}

	debug(`vault root: ${root}`);
	if (opts.check) debug(`rule filter: ${opts.check}`);
	if (opts.fix) debug("fix mode enabled");
	debug(`provider available: ${!!provider}`);

	const spinner = createSpinner("Checking articles...");
	spinner.start();
	const endLint = debugTime("lintVault");

	const result = await lintVault(root, {
		ruleFilter: opts.check,
		provider,
		onProgress: (msg) => {
			spinner.text = `  ${msg}`;
		},
	});

	endLint();
	debug(
		`found ${result.diagnostics.length} issues (${result.errors} errors, ${result.warnings} warnings)`,
	);
	spinner.stop();

	if (opts.json) {
		console.log(JSON.stringify(result, null, 2));
		return;
	}

	const total = result.diagnostics.length;
	if (total === 0) {
		log.success("No issues found");
		log.blank();
		return;
	}

	console.log(`  ${total} issue${total === 1 ? "" : "s"} found:`);
	log.blank();

	const severityLabel = {
		error: "\x1b[31mERROR\x1b[0m  ",
		warning: "\x1b[33mWARN\x1b[0m   ",
		info: "\x1b[36mINFO\x1b[0m   ",
	};

	const ruleLabel: Record<string, string> = {
		orphan: "ORPHAN ",
		"broken-link": "LINK   ",
		stale: "STALE  ",
		frontmatter: "FMATTER",
		missing: "MISSING",
		contradiction: "CONTRA ",
	};

	for (const d of result.diagnostics) {
		const sev = severityLabel[d.severity];
		const rule = ruleLabel[d.rule] ?? d.rule.padEnd(7);
		const path = d.path ? `\x1b[2m${d.path}\x1b[0m` : "";

		console.log(`  ${sev} ${rule}  ${d.message}`);
		if (path) {
			console.log(`                   ${path}`);
		}
		console.log();
	}

	// Summary
	const parts: string[] = [];
	if (result.errors > 0) parts.push(`${result.errors} error${result.errors === 1 ? "" : "s"}`);
	if (result.warnings > 0)
		parts.push(`${result.warnings} warning${result.warnings === 1 ? "" : "s"}`);
	if (result.infos > 0) parts.push(`${result.infos} info${result.infos === 1 ? "" : "s"}`);
	log.dim(parts.join(", "));

	const fixable = result.diagnostics.filter((d) => d.fixable).length;

	if (fixable > 0 && opts.fix) {
		log.blank();
		const fixSpinner = createSpinner("Fixing issues...");
		fixSpinner.start();

		// Only load provider if there are stale issues to fix
		const hasStale = result.diagnostics.some((d) => d.fixable && d.rule === "stale");
		let provider: import("@kibhq/core").LLMProvider | undefined;
		let config: import("@kibhq/core").VaultConfig | undefined;
		if (hasStale) {
			try {
				const { createProvider, loadConfig } = await import("@kibhq/core");
				config = await loadConfig(root);
				provider = await createProvider(config.provider.default, config.provider.model);
			} catch {
				// Provider not available — stale fixes will be skipped
			}
		}

		const { fixLintIssues } = await import("@kibhq/core");
		const fixResult = await fixLintIssues(root, result.diagnostics, provider, config);

		fixSpinner.stop();

		if (fixResult.fixed > 0) {
			log.success(`Fixed ${fixResult.fixed} issue${fixResult.fixed === 1 ? "" : "s"}`);
		}
		if (fixResult.skipped > 0) {
			log.warn(`Skipped ${fixResult.skipped} issue${fixResult.skipped === 1 ? "" : "s"}`);
		}
		for (const err of fixResult.errors) {
			log.dim(err);
		}
	} else if (fixable > 0) {
		log.blank();
		log.dim(`${fixable} fixable issue${fixable === 1 ? "" : "s"} — run kib lint --fix`);
	}

	log.blank();

	// Exit with error code if there are errors (but not when fixing)
	if (result.errors > 0 && !opts.fix) {
		process.exit(1);
	}
}
