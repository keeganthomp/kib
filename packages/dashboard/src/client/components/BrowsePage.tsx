import { ArrowLeft, FileText } from "lucide-react";
import { Marked } from "marked";
import { useEffect, useMemo, useState } from "react";
import { type ArticleItem, api, type RawItem } from "../api.js";

const marked = new Marked();

const CATEGORY_COLORS: Record<string, string> = {
	concept: "bg-blue-50 text-blue-600",
	topic: "bg-green-50 text-green-600",
	reference: "bg-orange-50 text-orange-600",
	output: "bg-purple-50 text-purple-600",
};

type Scope = "wiki" | "raw";

function SkeletonList() {
	return (
		<div className="space-y-2">
			{[1, 2, 3, 4, 5].map((i) => (
				<div key={i} className="border rounded-lg p-4">
					<div className="skeleton h-3.5 w-48 mb-2" />
					<div className="skeleton h-2.5 w-72" />
				</div>
			))}
		</div>
	);
}

export function BrowsePage({ revision = 0 }: { revision?: number }) {
	const [scope, setScope] = useState<Scope>("raw");
	const [wikiArticles, setWikiArticles] = useState<ArticleItem[]>([]);
	const [rawSources, setRawSources] = useState<RawItem[]>([]);
	const [selectedPath, setSelectedPath] = useState<string | null>(null);
	const [content, setContent] = useState<string>("");
	const [filter, setFilter] = useState<string>("");
	const [categoryFilter, setCategoryFilter] = useState<string>("all");
	const [loading, setLoading] = useState(true);

	// biome-ignore lint/correctness/useExhaustiveDependencies: revision triggers re-fetch on vault changes
	useEffect(() => {
		setLoading(true);
		Promise.all([api.getArticles("wiki"), api.getRawSources()]).then(([wiki, raw]) => {
			setWikiArticles(wiki);
			setRawSources(raw);
			if (wiki.length === 0 && raw.length > 0) setScope("raw");
			else if (wiki.length > 0) setScope("wiki");
			setLoading(false);
		});
	}, [revision]);

	const categories = useMemo(() => {
		if (scope === "raw") return ["all"];
		const cats = new Set(wikiArticles.map((a) => a.category));
		return ["all", ...Array.from(cats).sort()];
	}, [wikiArticles, scope]);

	const filteredWiki = useMemo(() => {
		return wikiArticles.filter((a) => {
			if (categoryFilter !== "all" && a.category !== categoryFilter) return false;
			if (filter) {
				const q = filter.toLowerCase();
				return (
					a.slug.toLowerCase().includes(q) ||
					a.summary.toLowerCase().includes(q) ||
					a.tags.some((t) => t.toLowerCase().includes(q))
				);
			}
			return true;
		});
	}, [wikiArticles, filter, categoryFilter]);

	const filteredRaw = useMemo(() => {
		if (!filter) return rawSources;
		const q = filter.toLowerCase();
		return rawSources.filter(
			(s) => s.title.toLowerCase().includes(q) || s.path.toLowerCase().includes(q),
		);
	}, [rawSources, filter]);

	const openArticle = async (path: string, articleScope: Scope) => {
		setSelectedPath(path);
		const data = await api.readArticle(path, articleScope);
		setContent(data.content);
	};

	const renderedContent = useMemo(() => {
		if (!content) return "";
		const stripped = content.replace(/^---[\s\S]*?---\n*/, "");
		return marked.parse(stripped) as string;
	}, [content]);

	// Article detail view
	if (selectedPath) {
		return (
			<div className="p-10 max-w-2xl animate-page-in">
				<button
					type="button"
					onClick={() => {
						setSelectedPath(null);
						setContent("");
					}}
					className="flex items-center gap-1.5 text-[11px] text-[#999] hover:text-[#111] mb-8"
				>
					<ArrowLeft size={12} />
					Back
				</button>
				<article
					className="article-content"
					dangerouslySetInnerHTML={{ __html: renderedContent }}
				/>
			</div>
		);
	}

	return (
		<div className="p-10 max-w-3xl animate-page-in">
			<h2 className="text-lg font-semibold tracking-tight mb-6">Browse</h2>

			{/* Tabs */}
			<div className="flex gap-4 mb-6">
				<button
					type="button"
					onClick={() => setScope("wiki")}
					className={`text-xs pb-1 border-b transition-colors ${
						scope === "wiki"
							? "border-[#111] text-[#111]"
							: "border-transparent text-[#999] hover:text-[#555]"
					}`}
				>
					Articles
					<span className="text-[#bbb] ml-1.5">{wikiArticles.length}</span>
				</button>
				<button
					type="button"
					onClick={() => setScope("raw")}
					className={`text-xs pb-1 border-b transition-colors ${
						scope === "raw"
							? "border-[#111] text-[#111]"
							: "border-transparent text-[#999] hover:text-[#555]"
					}`}
				>
					Sources
					<span className="text-[#bbb] ml-1.5">{rawSources.length}</span>
				</button>
			</div>

			{/* Filters */}
			<div className="flex gap-2 mb-5">
				<input
					type="text"
					placeholder="Filter..."
					value={filter}
					onChange={(e) => setFilter(e.target.value)}
					className="flex-1 px-3 py-2 border rounded-md text-xs bg-white"
				/>
				{scope === "wiki" && categories.length > 1 && (
					<select
						value={categoryFilter}
						onChange={(e) => setCategoryFilter(e.target.value)}
						className="px-3 py-2 border rounded-md text-xs bg-white"
					>
						{categories.map((cat) => (
							<option key={cat} value={cat}>
								{cat === "all" ? "All" : cat}
							</option>
						))}
					</select>
				)}
			</div>

			{/* Content */}
			{loading ? (
				<SkeletonList />
			) : scope === "wiki" ? (
				filteredWiki.length === 0 ? (
					<p className="text-xs text-[#999] py-8">
						{wikiArticles.length === 0
							? "No compiled articles. Try the Sources tab."
							: "No matches."}
					</p>
				) : (
					<div className="space-y-1.5">
						{filteredWiki.map((article) => (
							<button
								key={article.path}
								type="button"
								onClick={() => openArticle(article.path, "wiki")}
								className="w-full text-left border rounded-lg px-4 py-3.5 bg-white hover:border-[#ccc] transition-colors"
							>
								<div className="flex items-center justify-between gap-3">
									<div className="flex-1 min-w-0">
										<h3 className="text-xs font-medium truncate">
											{article.slug}
										</h3>
										{article.summary && (
											<p className="text-[11px] text-[#999] mt-0.5 truncate">
												{article.summary}
											</p>
										)}
									</div>
									<span
										className={`text-[9px] px-2 py-0.5 rounded-full flex-shrink-0 ${
											CATEGORY_COLORS[article.category] ?? "bg-gray-50 text-gray-500"
										}`}
									>
										{article.category}
									</span>
								</div>
							</button>
						))}
					</div>
				)
			) : filteredRaw.length === 0 ? (
				<p className="text-xs text-[#999] py-8">
					{rawSources.length === 0 ? "No sources yet." : "No matches."}
				</p>
			) : (
				<div className="space-y-1.5">
					{filteredRaw.map((source) => (
						<button
							key={source.path}
							type="button"
							onClick={() => openArticle(source.path, "raw")}
							className="w-full text-left border rounded-lg px-4 py-3.5 bg-white hover:border-[#ccc] transition-colors"
						>
							<div className="flex items-center justify-between gap-3">
								<div className="flex items-center gap-2 flex-1 min-w-0">
									<FileText size={12} className="text-[#bbb] flex-shrink-0" />
									<h3 className="text-xs font-medium truncate">{source.title}</h3>
								</div>
								<div className="flex items-center gap-2 text-[10px] text-[#bbb] flex-shrink-0">
									{source.sourceType && (
										<span className="bg-[#f5f5f5] px-1.5 py-0.5 rounded text-[9px]">
											{source.sourceType}
										</span>
									)}
									{source.wordCount && (
										<span>{source.wordCount.toLocaleString()}w</span>
									)}
								</div>
							</div>
						</button>
					))}
				</div>
			)}
		</div>
	);
}
