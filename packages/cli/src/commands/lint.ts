import { resolveVaultRoot, VaultNotFoundError } from "@kibhq/core";
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

	const { lintVault } = await import("@kibhq/core");

	log.header("linting wiki");

	const spinner = createSpinner("Checking articles...");
	spinner.start();

	const result = await lintVault(root, {
		ruleFilter: opts.check,
		onProgress: (msg) => {
			spinner.text = `  ${msg}`;
		},
	});

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

	const ruleLabel = {
		orphan: "ORPHAN ",
		"broken-link": "LINK   ",
		stale: "STALE  ",
		frontmatter: "FMATTER",
		missing: "MISSING",
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
	if (fixable > 0 && !opts.fix) {
		log.blank();
		log.dim(`${fixable} fixable issue${fixable === 1 ? "" : "s"} — run kib lint --fix`);
	}

	log.blank();

	// Exit with error code if there are errors
	if (result.errors > 0) {
		process.exit(1);
	}
}
