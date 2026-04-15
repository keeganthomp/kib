import { resolveVaultRoot, VaultNotFoundError } from "@kibhq/core";
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
		const { shareVault } = await import("@kibhq/core");
		const result = await shareVault(root, remoteUrl);

		spinner?.stop();

		if (opts.json) {
			console.log(JSON.stringify(result, null, 2));
			return;
		}

		log.header("vault shared");
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
		log.error((err as Error).message);
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

	const { shareStatus } = await import("@kibhq/core");
	const status = await shareStatus(root);

	if (opts.json) {
		console.log(JSON.stringify(status, null, 2));
		return;
	}

	log.header("share status");

	if (!status.shared) {
		log.dim("Vault is not shared.");
		log.dim("Run kib share <remote-url> to set up sharing.");
		log.blank();
		return;
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
