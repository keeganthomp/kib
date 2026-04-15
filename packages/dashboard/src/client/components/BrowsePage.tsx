import { ArrowLeft, FileText, Tag } from "lucide-react";
import { Marked } from "marked";
import { useEffect, useMemo, useState } from "react";
import { type ArticleItem, api, type RawItem } from "../api.js";

const marked = new Marked();

const CATEGORY_COLORS: Record<string, string> = {
	concept: "bg-blue-100 text-blue-700",
	topic: "bg-green-100 text-green-700",
	reference: "bg-orange-100 text-orange-700",
	output: "bg-purple-100 text-purple-700",
};

type Scope = "wiki" | "raw";

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
			// Default to whichever has content
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

	if (selectedPath) {
		return (
			<div className="p-8 max-w-3xl">
				<button
					type="button"
					onClick={() => {
						setSelectedPath(null);
						setContent("");
					}}
					className="flex items-center gap-1 text-sm text-[var(--color-muted)] hover:text-[var(--color-foreground)] mb-4 transition-colors"
				>
					<ArrowLeft size={14} />
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
		<div className="p-8 max-w-4xl">
			<h2 className="text-xl font-semibold mb-4">Browse</h2>

			{/* Scope tabs */}
			<div className="flex gap-1 mb-4 border-b">
				<button
					type="button"
					onClick={() => setScope("wiki")}
					className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
						scope === "wiki"
							? "border-[var(--color-foreground)] text-[var(--color-foreground)]"
							: "border-transparent text-[var(--color-muted)] hover:text-[var(--color-foreground)]"
					}`}
				>
					Articles ({wikiArticles.length})
				</button>
				<button
					type="button"
					onClick={() => setScope("raw")}
					className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
						scope === "raw"
							? "border-[var(--color-foreground)] text-[var(--color-foreground)]"
							: "border-transparent text-[var(--color-muted)] hover:text-[var(--color-foreground)]"
					}`}
				>
					Sources ({rawSources.length})
				</button>
			</div>

			<div className="flex gap-3 mb-4">
				<input
					type="text"
					placeholder={scope === "wiki" ? "Filter articles..." : "Filter sources..."}
					value={filter}
					onChange={(e) => setFilter(e.target.value)}
					className="flex-1 px-3 py-2 border rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:ring-offset-1"
				/>
				{scope === "wiki" && categories.length > 1 && (
					<select
						value={categoryFilter}
						onChange={(e) => setCategoryFilter(e.target.value)}
						className="px-3 py-2 border rounded-md text-sm bg-white focus:outline-none"
					>
						{categories.map((cat) => (
							<option key={cat} value={cat}>
								{cat === "all" ? "All categories" : cat}
							</option>
						))}
					</select>
				)}
			</div>

			{loading ? (
				<p className="text-sm text-[var(--color-muted)]">Loading...</p>
			) : scope === "wiki" ? (
				filteredWiki.length === 0 ? (
					<p className="text-sm text-[var(--color-muted)]">
						{wikiArticles.length === 0
							? "No compiled articles yet. Sources are available in the Sources tab."
							: "No matching articles."}
					</p>
				) : (
					<div className="space-y-2">
						{filteredWiki.map((article) => (
							<button
								key={article.path}
								type="button"
								onClick={() => openArticle(article.path, "wiki")}
								className="w-full text-left border rounded-lg p-4 bg-white hover:border-[var(--color-accent)] transition-colors"
							>
								<div className="flex items-start justify-between gap-2">
									<div className="flex-1 min-w-0">
										<h3 className="text-sm font-medium truncate">{article.slug}</h3>
										{article.summary && (
											<p className="text-xs text-[var(--color-muted)] mt-1 line-clamp-2">
												{article.summary}
											</p>
										)}
									</div>
									<span
										className={`text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap ${
											CATEGORY_COLORS[article.category] ?? "bg-gray-100 text-gray-700"
										}`}
									>
										{article.category}
									</span>
								</div>
								{article.tags.length > 0 && (
									<div className="flex items-center gap-1.5 mt-2 flex-wrap">
										<Tag size={10} className="text-[var(--color-muted)]" />
										{article.tags.map((tag) => (
											<span
												key={tag}
												className="text-[10px] text-[var(--color-muted)] bg-gray-100 px-1.5 py-0.5 rounded"
											>
												{tag}
											</span>
										))}
									</div>
								)}
							</button>
						))}
					</div>
				)
			) : filteredRaw.length === 0 ? (
				<p className="text-sm text-[var(--color-muted)]">
					{rawSources.length === 0 ? "No sources yet." : "No matching sources."}
				</p>
			) : (
				<div className="space-y-2">
					{filteredRaw.map((source) => (
						<button
							key={source.path}
							type="button"
							onClick={() => openArticle(source.path, "raw")}
							className="w-full text-left border rounded-lg p-4 bg-white hover:border-[var(--color-accent)] transition-colors"
						>
							<div className="flex items-start justify-between gap-2">
								<div className="flex items-center gap-2 flex-1 min-w-0">
									<FileText size={14} className="text-[var(--color-muted)] flex-shrink-0" />
									<h3 className="text-sm font-medium truncate">{source.title}</h3>
								</div>
								<div className="flex items-center gap-2 text-[10px] text-[var(--color-muted)] whitespace-nowrap">
									{source.sourceType && (
										<span className="bg-gray-100 px-1.5 py-0.5 rounded">{source.sourceType}</span>
									)}
									{source.wordCount && <span>{source.wordCount.toLocaleString()} words</span>}
								</div>
							</div>
						</button>
					))}
				</div>
			)}
		</div>
	);
}
