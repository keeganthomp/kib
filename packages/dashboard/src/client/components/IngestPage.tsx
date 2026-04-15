import { ArrowRight, Check, Loader2 } from "lucide-react";
import { useState } from "react";
import { api, type IngestResult } from "../api.js";

export function IngestPage() {
	const [url, setUrl] = useState("");
	const [loading, setLoading] = useState(false);
	const [result, setResult] = useState<IngestResult | null>(null);
	const [error, setError] = useState<string | null>(null);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!url.trim() || loading) return;

		setLoading(true);
		setResult(null);
		setError(null);

		try {
			const res = await api.ingest(url);
			setResult(res);
			setUrl("");
		} catch (err) {
			setError((err as Error).message);
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="p-10 max-w-xl animate-page-in">
			<h2 className="text-lg font-semibold tracking-tight mb-2">Ingest</h2>
			<p className="text-xs text-[#999] mb-8">
				Add a URL to your knowledge base.
			</p>

			<form onSubmit={handleSubmit} className="flex gap-2 mb-8">
				<input
					type="text"
					placeholder="https://"
					value={url}
					onChange={(e) => setUrl(e.target.value)}
					disabled={loading}
					className="flex-1 px-3 py-2.5 border rounded-md text-xs bg-white disabled:opacity-40"
				/>
				<button
					type="submit"
					disabled={!url.trim() || loading}
					className="px-3 py-2.5 bg-[#111] text-white rounded-md text-xs hover:bg-[#222] disabled:opacity-20 flex items-center gap-1.5"
				>
					{loading ? (
						<Loader2 size={12} className="animate-spin" />
					) : (
						<ArrowRight size={12} />
					)}
				</button>
			</form>

			{error && (
				<div className="rounded-lg bg-red-50 border border-red-100 px-4 py-3">
					<p className="text-xs text-red-600">{error}</p>
				</div>
			)}

			{result && (
				<div className="rounded-lg bg-green-50/80 border border-green-100 px-4 py-3">
					<div className="flex items-center gap-1.5 mb-2">
						<Check size={12} className="text-green-600" />
						<span className="text-xs font-medium text-green-700">
							{result.skipped ? "Already ingested" : "Ingested"}
						</span>
					</div>
					<div className="text-[11px] text-green-600/80 space-y-0.5 ml-5">
						<p>{result.title}</p>
						<p className="font-mono text-[10px]">
							{result.sourceType} \u00b7 {result.wordCount.toLocaleString()} words
						</p>
					</div>
				</div>
			)}
		</div>
	);
}
