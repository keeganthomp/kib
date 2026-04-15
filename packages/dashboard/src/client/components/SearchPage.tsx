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
	const inputRef = useRef<HTMLInputElement>(null);

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
		debounceRef.current = setTimeout(() => doSearch(query), 200);
		return () => {
			if (debounceRef.current) clearTimeout(debounceRef.current);
		};
	}, [query, doSearch]);

	// Auto-focus on mount
	useEffect(() => {
		inputRef.current?.focus();
	}, []);

	return (
		<div className="p-10 max-w-2xl animate-page-in">
			<h2 className="text-lg font-semibold tracking-tight mb-6">Search</h2>

			<div className="relative mb-8">
				<Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#bbb]" />
				<input
					ref={inputRef}
					type="text"
					placeholder="Search..."
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					className="w-full pl-9 pr-16 py-2.5 border rounded-md text-xs bg-white"
				/>
				<span className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] text-[#ccc] font-mono">
					\u2318K
				</span>
			</div>

			{/* Empty state */}
			{!searched && !loading && (
				<div className="text-center py-16">
					<Search size={24} className="mx-auto text-[#ddd] mb-3" />
					<p className="text-xs text-[#bbb]">Search across your knowledge base</p>
				</div>
			)}

			{loading && (
				<div className="space-y-2">
					{[1, 2, 3].map((i) => (
						<div key={i} className="border rounded-lg p-4">
							<div className="skeleton h-3 w-44 mb-2" />
							<div className="skeleton h-2.5 w-64" />
						</div>
					))}
				</div>
			)}

			{!loading && searched && results.length === 0 && (
				<p className="text-xs text-[#999] text-center py-16">No results</p>
			)}

			{!loading && results.length > 0 && (
				<div className="space-y-1.5">
					{results.map((result) => (
						<button
							key={`${result.scope}:${result.path}`}
							type="button"
							onClick={() => onNavigateToArticle?.(result.path)}
							className="w-full text-left border rounded-lg px-4 py-3.5 bg-white hover:border-[#ccc] transition-colors"
						>
							<div className="flex items-center gap-2 mb-0.5">
								<FileText size={12} className="text-[#bbb] flex-shrink-0" />
								<span className="text-xs font-medium truncate">{result.title ?? result.path}</span>
								<span className="text-[9px] text-[#ccc] ml-auto flex-shrink-0">{result.scope}</span>
							</div>
							{result.snippet && (
								<p
									className="text-[11px] text-[#999] truncate ml-5"
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
