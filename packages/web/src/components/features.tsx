import { BookOpen, FolderOpen, Globe, MessageSquare, Plug, Search } from "lucide-react";

const features = [
	{
		icon: Globe,
		title: "Ingest Anything",
		description: "URLs, PDFs, YouTube, GitHub repos, local files.",
	},
	{
		icon: BookOpen,
		title: "AI-Compiled Wiki",
		description: "LLM structures sources into connected articles.",
	},
	{
		icon: Search,
		title: "BM25 Search",
		description: "Sub-50ms full-text search with stemming.",
	},
	{
		icon: MessageSquare,
		title: "RAG Query",
		description: "Ask questions, get cited answers.",
	},
	{
		icon: Plug,
		title: "MCP Server",
		description: "8 tools for Claude Code, Cursor, Claude Desktop.",
	},
	{
		icon: FolderOpen,
		title: "No Lock-in",
		description: "Plain markdown. Version with git.",
	},
];

export function Features() {
	return (
		<section id="features" className="mx-auto max-w-5xl px-6 py-12">
			<h2 className="mb-12 text-center text-2xl font-semibold tracking-tight sm:text-3xl">
				Everything you need
			</h2>
			<div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
				{features.map((f) => (
					<div
						key={f.title}
						className="rounded-lg border border-border/60 p-5 transition-shadow hover:shadow-sm"
					>
						<f.icon className="mb-3 h-5 w-5 text-accent" />
						<h3 className="mb-1 text-sm font-semibold">{f.title}</h3>
						<p className="text-sm text-muted">{f.description}</p>
					</div>
				))}
			</div>
		</section>
	);
}
