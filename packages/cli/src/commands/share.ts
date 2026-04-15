import { resolveVaultRoot, ShareError, VaultNotFoundError } from "@kibhq/core";
import { debug } from "../ui/debug.js";
import * as log from "../ui/logger.js";
import { createSpinner } from "../ui/spinner.js";

interface ShareOpts {
	json?: boolean;
	status?: boolean;
}

export async function share(remoteUrl: string | undefined, opts: ShareOpts) {
	// kib share --status (or no args)
	if (opts.status || !remoteUrl) {
		return showStatus(opts);
	}

	// kib share <url> — connect vault to remote
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

	debug(`vault root: ${root}`);
	debug(`remote: ${remoteUrl}`);

	const spinner = opts.json ? null : createSpinner("Setting up shared vault...");
	spinner?.start();

	try {
		const { shareVault, parseRemoteName } = await import("@kibhq/core");
		const result = await shareVault(root, remoteUrl);

		spinner?.stop();

		if (opts.json) {
			console.log(JSON.stringify(result, null, 2));
			return;
		}

		const projectName = parseRemoteName(remoteUrl);

		log.header("vault shared");
		if (projectName) {
			log.success(`Project: ${projectName}`);
		}
		log.success(`Remote: ${result.remote}`);
		log.success(`Branch: ${result.branch}`);
		log.blank();
		log.dim("team members can join with:");
		log.dim(`  kib clone ${remoteUrl}`);
		log.blank();
		log.dim("day-to-day:");
		log.dim("  kib pull    — get latest from team");
		log.dim("  kib push    — share your changes");
		log.blank();
	} catch (err) {
		spinner?.stop();
		if (err instanceof ShareError) {
			log.error(err.message);
			log.blank();
			log.dim(err.hint);
			log.blank();
		} else {
			log.error((err as Error).message);
		}
		process.exit(1);
	}
}

async function showStatus(opts: ShareOpts) {
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

	const { shareStatus, checkShareSetup } = await import("@kibhq/core");
	const status = await shareStatus(root);

	if (opts.json) {
		console.log(JSON.stringify(status, null, 2));
		return;
	}

	log.header("share status");

	if (!status.shared) {
		// Show a friendly setup checklist
		const setup = checkShareSetup(root);

		log.dim("This vault is not shared yet. Here's what you need:");
		log.blank();
		log.info(`${setup.gitInstalled ? "\u2713" : "\u2717"} Git installed`);
		log.info(
			`${setup.gitIdentity ? "\u2713" : "\u2717"} Git identity configured${setup.gitIdentity ? ` (${setup.gitIdentity.name})` : ""}`,
		);
		log.info(`${setup.vaultFound ? "\u2713" : "\u2717"} Vault found`);
		log.info(`${setup.remoteConfigured ? "\u2713" : "\u2717"} Remote configured`);

		if (!setup.gitInstalled) {
			log.blank();
			log.dim("Install Git: https://git-scm.com");
		} else if (!setup.gitIdentity) {
			log.blank();
			log.dim("Set up your identity:");
			log.dim('  git config --global user.name "Your Name"');
			log.dim('  git config --global user.email "you@example.com"');
		} else {
			log.blank();
			log.dim("Get started:");
			log.dim("  1. Create a repo on GitHub, GitLab, or any Git host");
			log.dim("  2. Run: kib share <remote-url>");
			log.blank();
			log.dim("Example:");
			log.dim("  kib share git@github.com:your-org/knowledge-base.git");
		}

		log.blank();
		return;
	}

	if (status.remoteName) {
		log.keyValue("project", status.remoteName);
	}
	log.keyValue("remote", status.remote ?? "unknown");
	log.keyValue("branch", status.branch ?? "unknown");
	log.keyValue("status", formatSyncStatus(status.ahead, status.behind));
	log.keyValue("local changes", status.dirty ? "yes" : "clean");

	if (status.lastSync) {
		log.keyValue("last sync", status.lastSync);
	}

	if (status.contributors.length > 0) {
		log.blank();
		log.dim("contributors:");
		for (const c of status.contributors.slice(0, 10)) {
			log.dim(`  ${c.name} — ${c.commits} commit${c.commits === 1 ? "" : "s"}`);
		}
	}

	log.blank();
}

function formatSyncStatus(ahead: number, behind: number): string {
	if (ahead === 0 && behind === 0) return "up to date";
	const parts: string[] = [];
	if (ahead > 0) parts.push(`${ahead} ahead`);
	if (behind > 0) parts.push(`${behind} behind`);
	return parts.join(", ");
}
