import {
	AlertCircle,
	ArrowDown,
	ArrowUp,
	Check,
	GitBranch,
	RefreshCw,
	Users,
	X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
	api,
	type PullResult,
	type PushResult,
	type ShareSetupCheck,
	type ShareStatus,
} from "../api.js";

interface TeamPageProps {
	revision: number;
}

export function TeamPage({ revision }: TeamPageProps) {
	const [status, setStatus] = useState<ShareStatus | null>(null);
	const [setup, setSetup] = useState<ShareSetupCheck | null>(null);
	const [syncing, setSyncing] = useState(false);
	const [message, setMessage] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	const fetchStatus = useCallback(() => {
		api
			.getShareStatus()
			.then(setStatus)
			.catch(() => {});
	}, []);

	const fetchSetup = useCallback(() => {
		api
			.getShareSetup()
			.then(setSetup)
			.catch(() => {});
	}, []);

	// biome-ignore lint/correctness/useExhaustiveDependencies: revision triggers re-fetch
	useEffect(() => {
		fetchStatus();
		fetchSetup();
	}, [fetchStatus, fetchSetup, revision]);

	const handlePull = async () => {
		setSyncing(true);
		setMessage(null);
		setError(null);
		try {
			const result: PullResult = await api.sharePull();
			setMessage(result.updated ? result.summary : "Already up to date.");
			fetchStatus();
		} catch (err) {
			setError(friendlyError((err as Error).message));
		} finally {
			setSyncing(false);
		}
	};

	const handlePush = async () => {
		setSyncing(true);
		setMessage(null);
		setError(null);
		try {
			const result: PushResult = await api.sharePush();
			setMessage(
				result.pushed
					? `Pushed ${result.filesChanged} file${result.filesChanged === 1 ? "" : "s"}`
					: "Nothing to push.",
			);
			fetchStatus();
		} catch (err) {
			setError(friendlyError((err as Error).message));
		} finally {
			setSyncing(false);
		}
	};

	const handleSync = async () => {
		setSyncing(true);
		setMessage(null);
		setError(null);
		try {
			const pullResult = await api.sharePull();
			const pushResult = await api.sharePush();
			const parts: string[] = [];
			if (pullResult.updated) parts.push(pullResult.summary);
			if (pushResult.pushed)
				parts.push(
					`pushed ${pushResult.filesChanged} file${pushResult.filesChanged === 1 ? "" : "s"}`,
				);
			setMessage(parts.length > 0 ? parts.join(" · ") : "Already in sync.");
			fetchStatus();
		} catch (err) {
			setError(friendlyError((err as Error).message));
		} finally {
			setSyncing(false);
		}
	};

	if (!status) {
		return (
			<div className="p-8">
				<div className="text-sm text-gray-400">Loading...</div>
			</div>
		);
	}

	if (!status.shared) {
		return <SetupGuide setup={setup} />;
	}

	return (
		<div className="p-8 max-w-2xl">
			{/* Header with project name */}
			<div className="mb-5">
				<h1 className="text-lg font-semibold text-gray-800">
					Team{status.remoteName ? ` — ${status.remoteName}` : ""}
				</h1>
				{status.remoteName && (
					<p className="text-xs text-gray-400 mt-0.5 font-mono truncate">{status.remote}</p>
				)}
			</div>

			{/* Sync status card */}
			<div className="bg-white border border-gray-200 rounded-lg p-5 mb-5">
				<div className="flex items-center justify-between mb-4">
					<div className="flex items-center gap-2 text-sm text-gray-600">
						<GitBranch size={14} />
						<span className="font-mono text-xs text-gray-400">{status.branch}</span>
					</div>
					<SyncBadge ahead={status.ahead} behind={status.behind} dirty={status.dirty} />
				</div>

				<div className="flex gap-2">
					<button
						type="button"
						onClick={handleSync}
						disabled={syncing}
						className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#111] text-white rounded-md hover:bg-[#222] disabled:opacity-50 transition-colors"
					>
						<RefreshCw size={12} className={syncing ? "animate-spin" : ""} />
						Sync
					</button>
					<button
						type="button"
						onClick={handlePull}
						disabled={syncing}
						className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-gray-200 text-gray-600 rounded-md hover:bg-gray-50 disabled:opacity-50 transition-colors"
					>
						<ArrowDown size={12} />
						Pull
					</button>
					<button
						type="button"
						onClick={handlePush}
						disabled={syncing}
						className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-gray-200 text-gray-600 rounded-md hover:bg-gray-50 disabled:opacity-50 transition-colors"
					>
						<ArrowUp size={12} />
						Push
					</button>
				</div>

				{message && (
					<div className="mt-3 text-xs text-green-600 bg-green-50 px-3 py-2 rounded">{message}</div>
				)}
				{error && (
					<div className="mt-3 text-xs text-red-600 bg-red-50 px-3 py-2 rounded flex items-start gap-2">
						<AlertCircle size={12} className="mt-0.5 shrink-0" />
						<span className="whitespace-pre-wrap">{error}</span>
					</div>
				)}
			</div>

			{/* Contributors */}
			{status.contributors.length > 0 && (
				<div className="bg-white border border-gray-200 rounded-lg p-5">
					<div className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-4">
						<Users size={14} />
						Contributors
					</div>
					<div className="space-y-3">
						{status.contributors.map((c) => (
							<div key={c.name} className="flex items-center justify-between">
								<div>
									<div className="text-sm text-gray-800">{c.name}</div>
									{c.email && <div className="text-[11px] text-gray-400">{c.email}</div>}
								</div>
								<div className="text-xs text-gray-400">
									{c.commits} commit{c.commits === 1 ? "" : "s"}
								</div>
							</div>
						))}
					</div>
				</div>
			)}
		</div>
	);
}

// ─── Setup Guide (shown when vault is not shared) ──────────────

function SetupGuide({ setup }: { setup: ShareSetupCheck | null }) {
	return (
		<div className="p-8 max-w-lg">
			<h1 className="text-lg font-semibold text-gray-800 mb-1">Team Sharing</h1>
			<p className="text-sm text-gray-500 mb-5">Share your vault with teammates using Git.</p>

			{/* Prerequisites checklist */}
			<div className="bg-white border border-gray-200 rounded-lg p-5 mb-5">
				<div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">
					Prerequisites
				</div>
				<div className="space-y-2.5">
					<SetupRow
						ready={setup?.gitInstalled ?? false}
						label="Git installed"
						hint="Install from https://git-scm.com"
					/>
					<SetupRow
						ready={!!setup?.gitIdentity}
						label={
							setup?.gitIdentity
								? `Git identity (${setup.gitIdentity.name})`
								: "Git identity configured"
						}
						hint={'Run: git config --global user.name "Your Name"'}
					/>
					<SetupRow ready={setup?.vaultFound ?? false} label="Vault found" hint="Run: kib init" />
					<SetupRow
						ready={setup?.remoteConfigured ?? false}
						label="Remote configured"
						hint="Run: kib share <remote-url>"
					/>
				</div>
			</div>

			{/* Getting started steps */}
			<div className="bg-white border border-gray-200 rounded-lg p-5">
				<div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">
					Get Started
				</div>
				<ol className="space-y-3 text-sm text-gray-600">
					<li className="flex gap-2">
						<span className="text-gray-400 font-medium">1.</span>
						<span>
							Create a repository on <span className="text-gray-800">GitHub</span>,{" "}
							<span className="text-gray-800">GitLab</span>, or any Git host
						</span>
					</li>
					<li className="flex gap-2">
						<span className="text-gray-400 font-medium">2.</span>
						<span>Connect your vault with the share command:</span>
					</li>
				</ol>
				<div className="mt-3 bg-gray-50 rounded px-3 py-2">
					<code className="text-xs text-gray-600">kib share git@github.com:your-org/vault.git</code>
				</div>
				<p className="text-xs text-gray-400 mt-3">
					Once shared, teammates can join with{" "}
					<code className="bg-gray-50 px-1 rounded">kib clone &lt;url&gt;</code> and sync with{" "}
					<code className="bg-gray-50 px-1 rounded">kib pull</code> /{" "}
					<code className="bg-gray-50 px-1 rounded">kib push</code>.
				</p>
			</div>
		</div>
	);
}

function SetupRow({ ready, label, hint }: { ready: boolean; label: string; hint: string }) {
	return (
		<div className="flex items-start gap-2">
			{ready ? (
				<Check size={14} className="text-green-500 mt-0.5 shrink-0" />
			) : (
				<X size={14} className="text-gray-300 mt-0.5 shrink-0" />
			)}
			<div>
				<div className={`text-sm ${ready ? "text-gray-700" : "text-gray-400"}`}>{label}</div>
				{!ready && <div className="text-[11px] text-gray-400 mt-0.5 font-mono">{hint}</div>}
			</div>
		</div>
	);
}

// ─── Helpers ───────────────────────────────────────────────────

function SyncBadge({ ahead, behind, dirty }: { ahead: number; behind: number; dirty: boolean }) {
	if (ahead === 0 && behind === 0 && !dirty) {
		return (
			<span className="text-[10px] text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
				in sync
			</span>
		);
	}

	const parts: string[] = [];
	if (ahead > 0) parts.push(`${ahead}\u2191`);
	if (behind > 0) parts.push(`${behind}\u2193`);
	if (dirty) parts.push("modified");

	return (
		<span className="text-[10px] text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
			{parts.join(" · ")}
		</span>
	);
}

/**
 * Make error messages more human-friendly for the dashboard.
 */
function friendlyError(msg: string): string {
	const lower = msg.toLowerCase();

	if (lower.includes("permission denied") || lower.includes("could not read from remote")) {
		return "Authentication failed. Check that your SSH key is configured for this remote.";
	}
	if (lower.includes("authentication failed") || lower.includes("logon failed")) {
		return "Authentication failed. Check your credentials or use an SSH URL.";
	}
	if (lower.includes("repository not found") || lower.includes("does not exist")) {
		return "Repository not found. Check the URL and your access permissions.";
	}
	if (
		lower.includes("could not resolve host") ||
		lower.includes("unable to access") ||
		lower.includes("network")
	) {
		return "Network error. Check your internet connection and try again.";
	}
	if (
		lower.includes("failed to push") ||
		lower.includes("rejected") ||
		lower.includes("non-fast-forward")
	) {
		return "Push rejected — the remote has newer changes. Pull first, then try again.";
	}

	return msg;
}
