import { ArrowDown, ArrowUp, GitBranch, RefreshCw, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api, type PullResult, type PushResult, type ShareStatus } from "../api.js";

interface TeamPageProps {
	revision: number;
}

export function TeamPage({ revision }: TeamPageProps) {
	const [status, setStatus] = useState<ShareStatus | null>(null);
	const [syncing, setSyncing] = useState(false);
	const [message, setMessage] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	const fetchStatus = useCallback(() => {
		api
			.getShareStatus()
			.then(setStatus)
			.catch(() => {});
	}, []);

	// biome-ignore lint/correctness/useExhaustiveDependencies: revision triggers re-fetch
	useEffect(() => {
		fetchStatus();
	}, [fetchStatus, revision]);

	const handlePull = async () => {
		setSyncing(true);
		setMessage(null);
		setError(null);
		try {
			const result: PullResult = await api.sharePull();
			setMessage(result.updated ? result.summary : "Already up to date.");
			fetchStatus();
		} catch (err) {
			setError((err as Error).message);
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
			setError((err as Error).message);
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
			setError((err as Error).message);
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
		return (
			<div className="p-8 max-w-lg">
				<h1 className="text-lg font-semibold text-gray-800 mb-3">Team</h1>
				<div className="bg-white border border-gray-200 rounded-lg p-6 text-sm text-gray-500">
					<p className="mb-3">This vault is not shared yet.</p>
					<p className="text-xs text-gray-400 font-mono bg-gray-50 px-3 py-2 rounded">
						kib share &lt;remote-url&gt;
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className="p-8 max-w-2xl">
			<h1 className="text-lg font-semibold text-gray-800 mb-5">Team</h1>

			{/* Sync status card */}
			<div className="bg-white border border-gray-200 rounded-lg p-5 mb-5">
				<div className="flex items-center justify-between mb-4">
					<div className="flex items-center gap-2 text-sm text-gray-600">
						<GitBranch size={14} />
						<span className="font-mono text-xs text-gray-400">{status.branch}</span>
						<span className="text-gray-300">·</span>
						<span className="text-xs text-gray-400 truncate max-w-[300px]">{status.remote}</span>
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
					<div className="mt-3 text-xs text-red-600 bg-red-50 px-3 py-2 rounded">{error}</div>
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
