import { Check, Loader2, Plus } from "lucide-react";
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
		<div className="p-8 max-w-2xl">
			<h2 className="text-xl font-semibold mb-4">Ingest</h2>
			<p className="text-sm text-[var(--color-muted)] mb-6">
				Add a URL to ingest into your knowledge base. Supports web pages, YouTube videos, GitHub
				repos, and more.
			</p>

			<form onSubmit={handleSubmit} className="flex gap-2 mb-6">
				<input
					type="text"
					placeholder="https://example.com/article"
					value={url}
					onChange={(e) => setUrl(e.target.value)}
					disabled={loading}
					className="flex-1 px-3 py-2.5 border rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:ring-offset-1 disabled:opacity-50"
				/>
				<button
					type="submit"
					disabled={!url.trim() || loading}
					className="px-4 py-2.5 bg-[var(--color-sidebar)] text-white rounded-md text-sm hover:opacity-90 transition-opacity disabled:opacity-30 flex items-center gap-2"
				>
					{loading ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
					Ingest
				</button>
			</form>

			{error && (
				<div className="border border-red-200 bg-red-50 rounded-lg p-4">
					<p className="text-sm text-red-600">{error}</p>
				</div>
			)}

			{result && (
				<div className="border border-green-200 bg-green-50 rounded-lg p-4">
					<div className="flex items-center gap-2 mb-2">
						<Check size={16} className="text-green-600" />
						<span className="text-sm font-medium text-green-700">
							{result.skipped ? "Already ingested" : "Ingested successfully"}
						</span>
					</div>
					<div className="text-xs text-green-600 space-y-1">
						<p>
							<span className="font-medium">Title:</span> {result.title}
						</p>
						<p>
							<span className="font-medium">Type:</span> {result.sourceType}
						</p>
						<p>
							<span className="font-medium">Words:</span> {result.wordCount.toLocaleString()}
						</p>
					</div>
				</div>
			)}
		</div>
	);
}
