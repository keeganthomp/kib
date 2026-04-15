import { BookOpen, Database, FileText, Play, Square, Zap } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, type VaultStatus } from "../api.js";
import type { VaultEvent } from "../useEvents.js";

interface LogEntry {
	key: string;
	text: string;
}

let logCounter = 0;

function SkeletonCard() {
	return (
		<div className="p-5">
			<div className="skeleton h-3 w-16 mb-3" />
			<div className="skeleton h-7 w-20" />
		</div>
	);
}

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
	const [compileLog, setCompileLog] = useState<LogEntry[]>([]);
	const [compileError, setCompileError] = useState<string | null>(null);
	const logRef = useRef<HTMLDivElement>(null);

	const pushLog = useCallback((text: string) => {
		const key = `log-${++logCounter}`;
		setCompileLog((prev) => [...prev.slice(-29), { key, text }]);
	}, []);

	// biome-ignore lint/correctness/useExhaustiveDependencies: revision triggers re-fetch on vault changes
	useEffect(() => {
		api
			.getStatus()
			.then(setStatus)
			.catch((e) => setError((e as Error).message));
	}, [revision]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: compileLog triggers scroll on new entries
	useEffect(() => {
		if (logRef.current) {
			logRef.current.scrollTop = logRef.current.scrollHeight;
		}
	}, [compileLog]);

	// Handle compile events
	useEffect(() => {
		if (!lastEvent) return;
		if (lastEvent.type === "compile_started") {
			setCompiling(true);
			setCompileLog([]);
			setCompileError(null);
		} else if (lastEvent.type === "compile_progress" && lastEvent.message) {
			pushLog(lastEvent.message);
		} else if (lastEvent.type === "compile_article" && lastEvent.title) {
			pushLog(`${lastEvent.op === "create" ? "+" : "\u2713"} ${lastEvent.title}`);
		} else if (lastEvent.type === "compile_done") {
			setCompiling(false);
			pushLog(
				`\u2192 ${lastEvent.sourcesCompiled} sources \u2192 ${lastEvent.articlesCreated} created, ${lastEvent.articlesUpdated} updated`,
			);
		} else if (lastEvent.type === "compile_error") {
			setCompiling(false);
			setCompileError(lastEvent.message ?? "Compile failed");
		}
	}, [lastEvent, pushLog]);

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
			<div className="p-10">
				<p className="text-red-500 text-xs font-mono">Error: {error}</p>
			</div>
		);
	}

	if (!status) {
		return (
			<div className="p-10 max-w-3xl animate-page-in">
				<div className="skeleton h-6 w-48 mb-2" />
				<div className="skeleton h-3 w-64 mb-10" />
				<div className="grid grid-cols-2 gap-3">
					{[1, 2, 3, 4].map((i) => (
						<div key={i} className="border rounded-lg">
							<SkeletonCard />
						</div>
					))}
				</div>
			</div>
		);
	}

	const uncompiled = status.stats.totalSources - status.stats.totalArticles;

	const cards = [
		{
			label: "Articles",
			value: status.stats.totalArticles,
			icon: BookOpen,
		},
		{
			label: "Sources",
			value: status.stats.totalSources,
			icon: FileText,
		},
		{
			label: "Words",
			value: status.stats.totalWords.toLocaleString(),
			icon: Database,
		},
		{
			label: "Provider",
			value: status.provider.ready ? status.provider.name : "None",
			icon: Zap,
		},
	];

	return (
		<div className="p-10 max-w-3xl animate-page-in">
			{/* Header */}
			<div className="flex items-start justify-between mb-10">
				<div>
					<h2 className="text-lg font-semibold tracking-tight mb-1">{status.vault.name}</h2>
					<p className="text-xs text-[#999]">
						{status.vault.lastCompiled
							? `Last compiled ${new Date(status.vault.lastCompiled).toLocaleDateString()}`
							: "Never compiled"}
						{" \u00b7 "}
						{status.provider.model}
					</p>
				</div>
				{status.provider.ready && (
					<button
						type="button"
						onClick={compiling ? handleStop : handleCompile}
						className={`flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
							compiling
								? "bg-[#111] text-white/60 hover:text-white"
								: "bg-[#111] text-white hover:bg-[#222]"
						}`}
					>
						{compiling ? (
							<>
								<Square size={12} />
								Stop
							</>
						) : (
							<>
								<Play size={12} />
								Compile
							</>
						)}
					</button>
				)}
			</div>

			{/* Compile error */}
			{compileError && (
				<div className="rounded-lg bg-red-50 border border-red-100 px-4 py-3 mb-6">
					<p className="text-xs text-red-600">{compileError}</p>
				</div>
			)}

			{/* Compile log */}
			{compileLog.length > 0 && (
				<div ref={logRef} className="compile-log mb-6 font-mono">
					{compileLog.map((entry) => (
						<div
							key={entry.key}
							className={
								entry.text.startsWith("+")
									? "text-green-400/70"
									: entry.text.startsWith("\u2713")
										? "text-blue-400/70"
										: entry.text.startsWith("\u2192")
											? "text-amber-400/80"
											: ""
							}
						>
							{entry.text}
						</div>
					))}
					{compiling && <div className="text-white/20 animate-pulse">waiting for LLM...</div>}
				</div>
			)}

			{/* Uncompiled notice */}
			{uncompiled > 0 && !compiling && compileLog.length === 0 && (
				<div className="rounded-lg bg-amber-50/80 border border-amber-100 px-4 py-3 mb-6">
					<p className="text-xs text-amber-700/80">
						{uncompiled} source{uncompiled > 1 ? "s" : ""} pending compilation
					</p>
				</div>
			)}

			{/* Stats grid */}
			<div className="grid grid-cols-2 gap-3 mb-10">
				{cards.map((card) => (
					<div key={card.label} className="border rounded-lg p-5 bg-white">
						<div className="flex items-center gap-1.5 mb-2">
							<card.icon size={12} className="text-[#999]" />
							<span className="text-[10px] text-[#999] uppercase tracking-widest">
								{card.label}
							</span>
						</div>
						<p className="text-xl font-semibold tracking-tight">{card.value}</p>
					</div>
				))}
			</div>

			{/* Config */}
			<div className="border-t pt-6">
				<h3 className="text-[10px] text-[#999] uppercase tracking-widest mb-4">Configuration</h3>
				<div className="space-y-2.5 text-xs">
					{[
						["Provider", status.provider.name],
						["Model", status.provider.model],
						["API Key", status.provider.apiKeyHint ?? "Not set"],
						["Status", status.provider.ready ? "Ready" : "Not configured"],
					].map(([label, value]) => (
						<div key={label} className="flex justify-between">
							<span className="text-[#999]">{label}</span>
							<span
								className={`font-mono text-[11px] ${
									label === "Status" ? (value === "Ready" ? "text-green-600" : "text-red-400") : ""
								}`}
							>
								{value}
							</span>
						</div>
					))}
				</div>
			</div>
		</div>
	);
}
