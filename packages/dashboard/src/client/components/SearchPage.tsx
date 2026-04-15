import { FileText, Search } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, type SearchResult } from "../api.js";

export function SearchPage({
	onNavigateToArticle,
}: {
	onNavigateToArticle?: (path: string) => void;
}) {
	const [query, setQuery] = useState("");
	const [results, setResults] = useState<SearchResult[]>([]);
	const [loading, setLoading] = useState(false);
	const [searched, setSearched] = useState(false);
	const debounceRef = useRef<ReturnType<typeof setTimeout>>();

	const doSearch = useCallback(async (q: string) => {
		if (!q.trim()) {
			setResults([]);
			setSearched(false);
			return;
		}
		setLoading(true);
		try {
			const res = await api.search(q, { limit: 20 });
			setResults(res);
			setSearched(true);
		} catch {
			setResults([]);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		if (debounceRef.current) clearTimeout(debounceRef.current);
		debounceRef.current = setTimeout(() => doSearch(query), 250);
		return () => {
			if (debounceRef.current) clearTimeout(debounceRef.current);
		};
	}, [query, doSearch]);

	return (
		<div className="p-8 max-w-3xl">
			<h2 className="text-xl font-semibold mb-4">Search</h2>

			<div className="relative mb-6">
				<Search
					size={16}
					className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)]"
				/>
				<input
					type="text"
					placeholder="Search your knowledge base..."
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					// biome-ignore lint/a11y/noAutofocus: search page should focus input on mount
					autoFocus
					className="w-full pl-10 pr-4 py-2.5 border rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:ring-offset-1"
				/>
			</div>

			{loading && <p className="text-sm text-[var(--color-muted)]">Searching...</p>}

			{!loading && searched && results.length === 0 && (
				<p className="text-sm text-[var(--color-muted)]">No results found.</p>
			)}

			{!loading && results.length > 0 && (
				<div className="space-y-3">
					{results.map((result) => (
						<button
							key={`${result.scope}:${result.path}`}
							type="button"
							onClick={() => onNavigateToArticle?.(result.path)}
							className="w-full text-left border rounded-lg p-4 bg-white hover:border-[var(--color-accent)] transition-colors"
						>
							<div className="flex items-center gap-2 mb-1">
								<FileText size={14} className="text-[var(--color-muted)] flex-shrink-0" />
								<span className="text-sm font-medium truncate">{result.title ?? result.path}</span>
								<span className="text-[10px] text-[var(--color-muted)] ml-auto whitespace-nowrap">
									{result.scope} &middot; {result.score.toFixed(2)}
								</span>
							</div>
							{result.snippet && (
								<p
									className="text-xs text-[var(--color-muted)] line-clamp-2 ml-[22px]"
									dangerouslySetInnerHTML={{ __html: result.snippet }}
								/>
							)}
						</button>
					))}
				</div>
			)}
		</div>
	);
}
