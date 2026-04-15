import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { VAULT_DIR } from "./constants.js";
import { ShareError } from "./errors.js";
import type { Manifest } from "./types.js";
import { loadConfig, loadManifest, saveConfig, saveManifest } from "./vault.js";

// ─── Types ──────────────────────────────────────────────────────

export interface ShareResult {
	remote: string;
	branch: string;
}

export interface PullResult {
	updated: boolean;
	summary: string;
	newSources: number;
	newArticles: number;
	conflicts: string[];
}

export interface PushResult {
	pushed: boolean;
	commit: string;
	filesChanged: number;
}

export interface ShareStatus {
	shared: boolean;
	remote?: string;
	remoteName?: string;
	branch?: string;
	ahead: number;
	behind: number;
	dirty: boolean;
	lastSync?: string;
	contributors: Contributor[];
}

export interface Contributor {
	name: string;
	email: string;
	commits: number;
	lastActive: string;
}

export interface ShareSetupCheck {
	gitInstalled: boolean;
	gitIdentity: { name: string; email: string } | null;
	vaultFound: boolean;
	remoteConfigured: boolean;
	remoteName: string | null;
	remoteUrl: string | null;
}

// ─── Prerequisite Checks ────────────────────────────────────────

export function ensureGit(): void {
	try {
		execSync("git --version", { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
	} catch {
		throw new ShareError(
			"Git is not installed.",
			"GIT_NOT_INSTALLED",
			"Install Git from https://git-scm.com and try again.",
		);
	}
}

export function hasGitIdentity(): { name: string; email: string } | null {
	try {
		const name = execSync("git config user.name", {
			encoding: "utf-8",
			stdio: ["pipe", "pipe", "pipe"],
		}).trim();
		const email = execSync("git config user.email", {
			encoding: "utf-8",
			stdio: ["pipe", "pipe", "pipe"],
		}).trim();
		if (name) return { name, email };
		return null;
	} catch {
		return null;
	}
}

/**
 * Extract a human-readable project name from a git remote URL.
 *   git@github.com:user/my-vault.git → user/my-vault
 *   https://github.com/user/my-vault.git → user/my-vault
 *   https://github.com/user/my-vault → user/my-vault
 */
export function parseRemoteName(url: string): string | null {
	// SSH: git@host:owner/repo.git
	const sshMatch = url.match(/:([^/]+\/[^/]+?)(?:\.git)?$/);
	if (sshMatch?.[1]) return sshMatch[1];

	// HTTPS: https://host/owner/repo.git
	try {
		const parsed = new URL(url);
		const parts = parsed.pathname.replace(/^\//, "").replace(/\.git$/, "");
		if (parts.includes("/")) return parts;
	} catch {
		// not a URL
	}

	return null;
}

/**
 * Examine a git error message and return a user-friendly ShareError.
 */
export function diagnoseGitError(err: unknown, operation: string): ShareError {
	const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();

	if (
		msg.includes("permission denied (publickey)") ||
		msg.includes("could not read from remote repository")
	) {
		return new ShareError(
			`Authentication failed during ${operation}.`,
			"AUTH_FAILED",
			"Make sure your SSH key is added to the remote host (e.g. GitHub → Settings → SSH keys).\nOr use an HTTPS URL with a personal access token instead.",
		);
	}

	if (
		msg.includes("authentication failed") ||
		msg.includes("invalid credentials") ||
		msg.includes("logon failed")
	) {
		return new ShareError(
			`Authentication failed during ${operation}.`,
			"AUTH_FAILED",
			"Check your credentials. For HTTPS remotes, use a personal access token instead of a password.\nFor GitHub: https://github.com/settings/tokens",
		);
	}

	if (
		msg.includes("repository not found") ||
		msg.includes("does not exist") ||
		msg.includes("not found")
	) {
		return new ShareError(
			`Remote repository not found during ${operation}.`,
			"REMOTE_NOT_FOUND",
			"Check that the URL is correct and that you have access to the repository.",
		);
	}

	if (
		msg.includes("could not resolve host") ||
		msg.includes("unable to access") ||
		msg.includes("connection timed out") ||
		msg.includes("network is unreachable")
	) {
		return new ShareError(
			`Network error during ${operation}.`,
			"NETWORK_ERROR",
			"Check your internet connection and try again.",
		);
	}

	if (
		msg.includes("failed to push") ||
		msg.includes("rejected") ||
		msg.includes("non-fast-forward")
	) {
		return new ShareError(
			`Push rejected — the remote has newer changes.`,
			"PUSH_REJECTED",
			"Run 'kib pull' first to sync, then try pushing again.",
		);
	}

	// Fallback: return the original message but wrapped in ShareError
	return new ShareError(
		`Git error during ${operation}: ${(err instanceof Error ? err.message : String(err)).split("\n")[0]}`,
		"SHARE_ERROR",
		"Check the error above and try again. Run 'kib share --status' to check your setup.",
	);
}

/**
 * Check all prerequisites for sharing. Used by CLI and dashboard
 * to show a friendly setup checklist.
 */
export function checkShareSetup(root?: string): ShareSetupCheck {
	let gitInstalled = false;
	try {
		ensureGit();
		gitInstalled = true;
	} catch {
		// not installed
	}

	const gitIdentity = gitInstalled ? hasGitIdentity() : null;

	let vaultFound = false;
	let remoteConfigured = false;
	let remoteName: string | null = null;
	let remoteUrl: string | null = null;

	if (root) {
		vaultFound = existsSync(join(root, VAULT_DIR));
		if (vaultFound && isGitRepo(root)) {
			const url = getRemoteUrl(root);
			if (url) {
				remoteConfigured = true;
				remoteUrl = url;
				remoteName = parseRemoteName(url);
			}
		}
	}

	return { gitInstalled, gitIdentity, vaultFound, remoteConfigured, remoteName, remoteUrl };
}

// ─── Git Helpers ────────────────────────────────────────────────

function git(root: string, args: string): string {
	return execSync(`git -c commit.gpgsign=false ${args}`, {
		cwd: root,
		encoding: "utf-8",
		stdio: ["pipe", "pipe", "pipe"],
	}).trim();
}

function gitOk(root: string, args: string): { ok: boolean; output: string } {
	try {
		return { ok: true, output: git(root, args) };
	} catch (e) {
		return { ok: false, output: (e as Error).message };
	}
}

export function isGitRepo(root: string): boolean {
	return existsSync(join(root, ".git"));
}

export function isShared(root: string): boolean {
	if (!isGitRepo(root)) return false;
	const { ok, output } = gitOk(root, "remote");
	return ok && output.length > 0;
}

function getCurrentBranch(root: string): string {
	try {
		return git(root, "rev-parse --abbrev-ref HEAD");
	} catch {
		return "main";
	}
}

function getRemoteUrl(root: string): string | undefined {
	const { ok, output } = gitOk(root, "remote get-url origin");
	return ok ? output : undefined;
}

export function getContributor(): { name: string; email: string } {
	try {
		const name = execSync("git config user.name", { encoding: "utf-8" }).trim();
		const email = execSync("git config user.email", { encoding: "utf-8" }).trim();
		return { name: name || "unknown", email: email || "" };
	} catch {
		return { name: require("node:os").userInfo().username, email: "" };
	}
}

// ─── .gitignore ─────────────────────────────────────────────────

const VAULT_GITIGNORE = `# kib — machine-local state (not shared)
.kb/vault.lock
.kb/cache/
.kb/logs/
.kb/backups/
.kb/pipeline.db
.kb/pipeline.db-journal
.kb/pipeline.db-wal
`;

async function ensureGitignore(root: string): Promise<void> {
	const gitignorePath = join(root, ".gitignore");
	if (!existsSync(gitignorePath)) {
		await writeFile(gitignorePath, VAULT_GITIGNORE, "utf-8");
		return;
	}
	const existing = await readFile(gitignorePath, "utf-8");
	if (!existing.includes(".kb/vault.lock")) {
		await appendFile(gitignorePath, `\n${VAULT_GITIGNORE}`, "utf-8");
	}
}

// ─── Share (one-time setup) ─────────────────────────────────────

export async function shareVault(root: string, remoteUrl: string): Promise<ShareResult> {
	// 0. Prerequisites
	ensureGit();

	const identity = hasGitIdentity();
	if (!identity) {
		throw new ShareError(
			"Git doesn't know who you are yet.",
			"GIT_NO_IDENTITY",
			'Run these commands first:\n  git config --global user.name "Your Name"\n  git config --global user.email "you@example.com"',
		);
	}

	// 1. Init git if needed
	if (!isGitRepo(root)) {
		git(root, "init -b main");
	}

	// 2. .gitignore
	await ensureGitignore(root);

	// 3. Set remote
	const { ok } = gitOk(root, "remote get-url origin");
	if (ok) {
		git(root, `remote set-url origin ${remoteUrl}`);
	} else {
		git(root, `remote add origin ${remoteUrl}`);
	}

	// 4. Update config
	const config = await loadConfig(root);
	(config as Record<string, unknown>).sharing = {
		enabled: true,
		remote: remoteUrl,
		auto_push: false,
		auto_pull: false,
	};
	await saveConfig(root, config);

	// 5. Initial commit
	git(root, "add -A");
	const { ok: clean } = gitOk(root, "diff --cached --quiet");
	if (!clean) {
		git(root, 'commit -m "feat: initialize shared kib vault"');
	}

	// 6. Push — handle empty remote or existing remote
	const branch = getCurrentBranch(root);
	try {
		git(root, `push -u origin ${branch}`);
	} catch (err) {
		// Remote might have content (e.g., GitHub created with README)
		// Pull first, then push
		const { ok: pullOk } = gitOk(
			root,
			`pull origin ${branch} --rebase --allow-unrelated-histories`,
		);
		if (pullOk) {
			try {
				git(root, `push -u origin ${branch}`);
			} catch (retryErr) {
				throw diagnoseGitError(retryErr, "push");
			}
		} else {
			throw diagnoseGitError(err, "push");
		}
	}

	return { remote: remoteUrl, branch };
}

// ─── Clone (join a shared vault) ────────────────────────────────

export async function cloneVault(remoteUrl: string, targetDir: string): Promise<string> {
	// Prerequisites
	ensureGit();

	// Clone
	try {
		execSync(`git -c commit.gpgsign=false clone ${remoteUrl} "${targetDir}"`, {
			encoding: "utf-8",
			stdio: ["pipe", "pipe", "pipe"],
		});
	} catch (err) {
		throw diagnoseGitError(err, "clone");
	}

	// Validate it's a kib vault
	const kbDir = join(targetDir, VAULT_DIR);
	if (!existsSync(kbDir)) {
		throw new ShareError(
			"That repository is not a kib vault (no .kb/ directory found).",
			"NOT_A_VAULT",
			"Make sure you're cloning a repository that was set up with 'kib share'.",
		);
	}

	// Ensure machine-local directories exist
	const localDirs = ["cache", "cache/responses", "logs", "backups"];
	await Promise.all(localDirs.map((d) => mkdir(join(kbDir, d), { recursive: true })));

	return targetDir;
}

// ─── Pull ───────────────────────────────────────────────────────

export async function pullVault(root: string): Promise<PullResult> {
	ensureGit();

	if (!isGitRepo(root) || !isShared(root)) {
		throw new ShareError(
			"This vault is not shared yet.",
			"NOT_SHARED",
			"Set up sharing first with: kib share <remote-url>",
		);
	}

	// Snapshot current state for diff
	const beforeManifest = await loadManifest(root);
	const beforeSources = new Set(Object.keys(beforeManifest.sources));
	const beforeArticles = new Set(Object.keys(beforeManifest.articles));

	const branch = getCurrentBranch(root);

	// Fetch
	try {
		git(root, `fetch origin ${branch}`);
	} catch (err) {
		throw diagnoseGitError(err, "pull");
	}

	// Check if there are changes
	const { ok: upToDate, output: diffOutput } = gitOk(root, `diff HEAD origin/${branch} --stat`);
	if (upToDate && !diffOutput) {
		return {
			updated: false,
			summary: "Already up to date.",
			newSources: 0,
			newArticles: 0,
			conflicts: [],
		};
	}

	// Stash local changes if dirty
	const { ok: isClean } = gitOk(root, "diff --quiet HEAD");
	const stashed = !isClean;
	if (stashed) {
		git(root, "stash");
	}

	// Merge
	const conflicts: string[] = [];
	try {
		git(root, `merge origin/${branch} --no-edit`);
	} catch {
		// Conflicts — try to resolve manifest automatically
		const { ok: manifestConflict } = gitOk(root, "diff --name-only --diff-filter=U");

		if (manifestConflict) {
			const conflictedFiles = git(root, "diff --name-only --diff-filter=U")
				.split("\n")
				.filter(Boolean);

			for (const file of conflictedFiles) {
				if (file === ".kb/manifest.json") {
					// Auto-resolve manifest via 3-way merge
					try {
						const base = JSON.parse(git(root, `show :1:${file}`)) as Manifest;
						const ours = JSON.parse(git(root, `show :2:${file}`)) as Manifest;
						const theirs = JSON.parse(git(root, `show :3:${file}`)) as Manifest;
						const merged = mergeManifests(base, ours, theirs);
						await saveManifest(root, merged);
						git(root, `add ${file}`);
					} catch {
						conflicts.push(file);
					}
				} else if (
					file.startsWith("wiki/") &&
					file !== "wiki/INDEX.md" &&
					file !== "wiki/GRAPH.md"
				) {
					// Wiki articles — take the newer version
					try {
						const theirs = git(root, `show :3:${file}`);
						await writeFile(join(root, file), theirs, "utf-8");
						git(root, `add ${file}`);
					} catch {
						conflicts.push(file);
					}
				} else if (file === "wiki/INDEX.md" || file === "wiki/GRAPH.md" || file === "wiki/LOG.md") {
					// Generated files — take theirs, will be regenerated
					try {
						const theirs = git(root, `show :3:${file}`);
						await writeFile(join(root, file), theirs, "utf-8");
						git(root, `add ${file}`);
					} catch {
						conflicts.push(file);
					}
				} else {
					conflicts.push(file);
				}
			}

			if (conflicts.length === 0) {
				git(root, 'commit --no-edit -m "merge: auto-resolve shared vault sync"');
			}
		}
	}

	// Unstash if we stashed
	if (stashed) {
		gitOk(root, "stash pop");
	}

	// Compute what's new
	const afterManifest = await loadManifest(root);
	const newSources = Object.keys(afterManifest.sources).filter((s) => !beforeSources.has(s)).length;
	const newArticles = Object.keys(afterManifest.articles).filter(
		(a) => !beforeArticles.has(a),
	).length;

	const parts: string[] = [];
	if (newSources > 0) parts.push(`${newSources} new source${newSources === 1 ? "" : "s"}`);
	if (newArticles > 0) parts.push(`${newArticles} new article${newArticles === 1 ? "" : "s"}`);
	if (conflicts.length > 0)
		parts.push(`${conflicts.length} conflict${conflicts.length === 1 ? "" : "s"}`);
	const summary = parts.length > 0 ? parts.join(", ") : "Updated.";

	return { updated: true, summary, newSources, newArticles, conflicts };
}

// ─── Push ───────────────────────────────────────────────────────

export async function pushVault(root: string, message?: string): Promise<PushResult> {
	ensureGit();

	if (!isGitRepo(root) || !isShared(root)) {
		throw new ShareError(
			"This vault is not shared yet.",
			"NOT_SHARED",
			"Set up sharing first with: kib share <remote-url>",
		);
	}

	// Stage all shareable files
	git(root, "add -A");

	// Check if there's anything to commit
	const { ok: clean } = gitOk(root, "diff --cached --quiet");
	if (clean) {
		return { pushed: false, commit: "", filesChanged: 0 };
	}

	// Build a commit message from what changed
	const commitMsg = message ?? generateCommitMessage(root);
	git(root, `commit -m "${commitMsg.replace(/"/g, '\\"')}"`);

	const commit = git(root, "rev-parse --short HEAD");
	const filesChanged = Number.parseInt(
		git(root, "diff --stat HEAD~1 --shortstat").match(/(\d+) file/)?.[1] ?? "0",
		10,
	);

	// Push
	const branch = getCurrentBranch(root);
	try {
		git(root, `push origin ${branch}`);
	} catch (err) {
		throw diagnoseGitError(err, "push");
	}

	return { pushed: true, commit, filesChanged };
}

function generateCommitMessage(root: string): string {
	const staged = git(root, "diff --cached --name-only").split("\n").filter(Boolean);

	let sources = 0;
	let articles = 0;
	let config = false;

	for (const file of staged) {
		if (file.startsWith("raw/")) sources++;
		else if (
			file.startsWith("wiki/") &&
			!["wiki/INDEX.md", "wiki/GRAPH.md", "wiki/LOG.md"].includes(file)
		)
			articles++;
		else if (file.includes("config.toml")) config = true;
	}

	const parts: string[] = [];
	if (sources > 0) parts.push(`${sources} source${sources === 1 ? "" : "s"}`);
	if (articles > 0) parts.push(`${articles} article${articles === 1 ? "" : "s"}`);
	if (config) parts.push("config");

	if (parts.length === 0) return "chore: sync vault";

	const contributor = getContributor();
	return `sync: ${parts.join(", ")} [${contributor.name}]`;
}

// ─── Status ─────────────────────────────────────────────────────

export async function shareStatus(root: string): Promise<ShareStatus> {
	if (!isGitRepo(root)) {
		return { shared: false, ahead: 0, behind: 0, dirty: false, contributors: [] };
	}

	const remote = getRemoteUrl(root);
	const branch = getCurrentBranch(root);
	const shared = !!remote;

	let ahead = 0;
	let behind = 0;

	if (shared) {
		// Fetch silently to get latest counts
		gitOk(root, `fetch origin ${branch}`);

		const { ok, output } = gitOk(root, `rev-list --left-right --count HEAD...origin/${branch}`);
		if (ok && output) {
			const [a, b] = output.split("\t").map(Number);
			ahead = a ?? 0;
			behind = b ?? 0;
		}
	}

	const { ok: isClean } = gitOk(root, "diff --quiet HEAD");
	const dirty = !isClean;

	// Get contributors from git log
	const contributors: Contributor[] = [];
	if (shared) {
		const { ok: logOk, output: logOutput } = gitOk(
			root,
			'log --format="%aN\t%aE\t%aI" --no-merges',
		);
		if (logOk && logOutput) {
			const seen = new Map<string, { email: string; commits: number; lastActive: string }>();
			for (const line of logOutput.split("\n").filter(Boolean)) {
				const [name, email, date] = line.split("\t");
				if (!name) continue;
				const existing = seen.get(name);
				if (existing) {
					existing.commits++;
					if (date && date > existing.lastActive) existing.lastActive = date;
				} else {
					seen.set(name, { email: email ?? "", commits: 1, lastActive: date ?? "" });
				}
			}
			for (const [name, data] of seen) {
				contributors.push({ name, ...data });
			}
			contributors.sort((a, b) => b.commits - a.commits);
		}
	}

	// Last sync = last push/pull timestamp
	const { ok: lastSyncOk, output: lastSync } = gitOk(
		root,
		`log origin/${branch} -1 --format="%aI"`,
	);

	return {
		shared,
		remote,
		remoteName: remote ? (parseRemoteName(remote) ?? undefined) : undefined,
		branch,
		ahead,
		behind,
		dirty,
		lastSync: lastSyncOk && lastSync ? lastSync.replace(/"/g, "") : undefined,
		contributors,
	};
}

// ─── Manifest 3-Way Merge ───────────────────────────────────────

export function mergeManifests(base: Manifest, ours: Manifest, theirs: Manifest): Manifest {
	// Merge sources by key (union, prefer newer)
	const mergedSources = { ...base.sources };

	for (const [id, entry] of Object.entries(ours.sources)) {
		const baseEntry = base.sources[id];
		if (!baseEntry || entry.ingestedAt > baseEntry.ingestedAt) {
			mergedSources[id] = entry;
		}
	}
	for (const [id, entry] of Object.entries(theirs.sources)) {
		const existing = mergedSources[id];
		if (!existing || entry.ingestedAt > existing.ingestedAt) {
			mergedSources[id] = entry;
		}
	}

	// Merge articles by slug (union, prefer newer lastUpdated)
	const mergedArticles = { ...base.articles };

	for (const [slug, entry] of Object.entries(ours.articles)) {
		const baseEntry = base.articles[slug];
		if (!baseEntry || entry.lastUpdated > baseEntry.lastUpdated) {
			mergedArticles[slug] = entry;
		}
	}
	for (const [slug, entry] of Object.entries(theirs.articles)) {
		const existing = mergedArticles[slug];
		if (!existing || entry.lastUpdated > existing.lastUpdated) {
			mergedArticles[slug] = entry;
		}
	}

	// Recompute stats
	const totalWords = Object.values(mergedArticles).reduce((sum, a) => sum + a.wordCount, 0);

	// Vault metadata: take whichever was compiled more recently
	const vault = { ...ours.vault };
	if (
		theirs.vault.lastCompiled &&
		(!vault.lastCompiled || theirs.vault.lastCompiled > vault.lastCompiled)
	) {
		vault.lastCompiled = theirs.vault.lastCompiled;
	}

	// Last lint: take the more recent
	const lastLintAt =
		[ours.stats.lastLintAt, theirs.stats.lastLintAt].filter(Boolean).sort().pop() ?? null;

	return {
		version: ours.version,
		vault,
		sources: mergedSources,
		articles: mergedArticles,
		stats: {
			totalSources: Object.keys(mergedSources).length,
			totalArticles: Object.keys(mergedArticles).length,
			totalWords,
			lastLintAt,
		},
	};
}
