import { BookOpen, Database, FileText, Loader2, Play, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { api, type VaultStatus } from "../api.js";
import type { VaultEvent } from "../useEvents.js";

export function StatusPage({
	revision = 0,
	lastEvent,
}: {
	revision?: number;
	lastEvent?: VaultEvent | null;
}) {
	const [status, setStatus] = useState<VaultStatus | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [compiling, setCompiling] = useState(false);
	const [compileLog, setCompileLog] = useState<string[]>([]);
	const [compileError, setCompileError] = useState<string | null>(null);

	// biome-ignore lint/correctness/useExhaustiveDependencies: revision triggers re-fetch on vault changes
	useEffect(() => {
		api
			.getStatus()
			.then(setStatus)
			.catch((e) => setError((e as Error).message));
	}, [revision]);

	// Handle compile events
	useEffect(() => {
		if (!lastEvent) return;
		if (lastEvent.type === "compile_started") {
			setCompiling(true);
			setCompileLog([]);
			setCompileError(null);
		} else if (lastEvent.type === "compile_progress" && lastEvent.message) {
			setCompileLog((prev) => [...prev.slice(-19), lastEvent.message!]);
		} else if (lastEvent.type === "compile_article" && lastEvent.title) {
			setCompileLog((prev) => [
				...prev.slice(-19),
				`${lastEvent.op === "create" ? "+" : "\u2713"} ${lastEvent.title}`,
			]);
		} else if (lastEvent.type === "compile_done") {
			setCompiling(false);
			setCompileLog((prev) => [
				...prev,
				`Done: ${lastEvent.sourcesCompiled} sources \u2192 ${lastEvent.articlesCreated} created, ${lastEvent.articlesUpdated} updated`,
			]);
		} else if (lastEvent.type === "compile_error") {
			setCompiling(false);
			setCompileError(lastEvent.message ?? "Compile failed");
		}
	}, [lastEvent]);

	const handleCompile = async () => {
		setCompileError(null);
		try {
			await api.compile();
		} catch (e) {
			setCompileError((e as Error).message);
		}
	};

	const handleStop = async () => {
		try {
			await api.stopCompile();
		} catch (e) {
			setCompileError((e as Error).message);
		}
	};

	if (error) {
		return (
			<div className="p-8">
				<p className="text-red-500 font-mono text-sm">Error: {error}</p>
			</div>
		);
	}

	if (!status) {
		return (
			<div className="p-8">
				<p className="text-[var(--color-muted)] text-sm">Loading...</p>
			</div>
		);
	}

	const uncompiled = status.stats.totalSources - status.stats.totalArticles;

	const cards = [
		{
			label: "Articles",
			value: status.stats.totalArticles,
			icon: BookOpen,
			color: "text-blue-500",
		},
		{
			label: "Sources",
			value: status.stats.totalSources,
			icon: FileText,
			color: "text-green-500",
		},
		{
			label: "Words",
			value: status.stats.totalWords.toLocaleString(),
			icon: Database,
			color: "text-orange-500",
		},
		{
			label: "Provider",
			value: status.provider.ready ? status.provider.name : "Not configured",
			icon: Zap,
			color: status.provider.ready ? "text-purple-500" : "text-red-400",
		},
	];

	return (
		<div className="p-8 max-w-4xl">
			<div className="flex items-start justify-between mb-6">
				<div>
					<h2 className="text-xl font-semibold mb-1">{status.vault.name}</h2>
					<p className="text-sm text-[var(--color-muted)]">
						Created {new Date(status.vault.created).toLocaleDateString()}
						{status.vault.lastCompiled &&
							` \u00b7 Last compiled ${new Date(status.vault.lastCompiled).toLocaleDateString()}`}
					</p>
				</div>
				{status.provider.ready && !compiling && (
					<button
						type="button"
						onClick={handleCompile}
						className="flex items-center gap-2 px-4 py-2.5 bg-[var(--color-sidebar)] text-white rounded-md text-sm hover:opacity-90 transition-opacity"
					>
						<Play size={16} />
						Compile
					</button>
				)}
				{compiling && (
					<button
						type="button"
						onClick={handleStop}
						className="flex items-center gap-2 px-4 py-2.5 bg-red-500 text-white rounded-md text-sm hover:bg-red-600 transition-colors"
					>
						Stop
					</button>
				)}
			</div>

			{compileError && (
				<div className="border border-red-200 bg-red-50 rounded-lg p-4 mb-4">
					<p className="text-sm text-red-600">{compileError}</p>
				</div>
			)}

			{compileLog.length > 0 && (
				<div className="border rounded-lg bg-[#1e1e1e] p-4 mb-4 font-mono text-xs text-[#d4d4d4] max-h-48 overflow-y-auto">
					{compileLog.map((line) => (
						<div key={line} className="py-0.5">
							{line}
						</div>
					))}
					{compiling && (
						<div className="py-0.5 text-white/40 animate-pulse">waiting for LLM...</div>
					)}
				</div>
			)}

			{uncompiled > 0 && !compiling && compileLog.length === 0 && (
				<div className="border border-amber-200 bg-amber-50 rounded-lg p-3 mb-4">
					<p className="text-sm text-amber-700">
						{uncompiled} uncompiled source{uncompiled > 1 ? "s" : ""} pending.
						{status.provider.ready
							? " Hit Compile to generate wiki articles."
							: " Configure a provider to compile."}
					</p>
				</div>
			)}

			<div className="grid grid-cols-2 gap-4 mb-8">
				{cards.map((card) => (
					<div key={card.label} className="border rounded-lg p-4 bg-white">
						<div className="flex items-center gap-2 mb-2">
							<card.icon size={16} className={card.color} />
							<span className="text-xs text-[var(--color-muted)] uppercase tracking-wider">
								{card.label}
							</span>
						</div>
						<p className="text-2xl font-semibold">{card.value}</p>
					</div>
				))}
			</div>

			<div className="border rounded-lg p-4 bg-white">
				<h3 className="text-sm font-medium mb-3">Configuration</h3>
				<div className="space-y-2 text-sm">
					<div className="flex justify-between">
						<span className="text-[var(--color-muted)]">Provider</span>
						<span className="font-mono">{status.provider.name}</span>
					</div>
					<div className="flex justify-between">
						<span className="text-[var(--color-muted)]">Model</span>
						<span className="font-mono">{status.provider.model}</span>
					</div>
					<div className="flex justify-between">
						<span className="text-[var(--color-muted)]">API Key</span>
						<span className="font-mono text-xs">{status.provider.apiKeyHint ?? "Not set"}</span>
					</div>
					<div className="flex justify-between">
						<span className="text-[var(--color-muted)]">Status</span>
						<span className={status.provider.ready ? "text-green-600" : "text-red-500"}>
							{status.provider.ready ? "Ready" : "Not configured"}
						</span>
					</div>
				</div>
			</div>
		</div>
	);
}
