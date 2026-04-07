const features = [
	{ title: "Ingest anything", detail: "URLs, PDFs, YouTube, GitHub repos, images, local files" },
	{ title: "AI-compiled wiki", detail: "LLM structures sources into connected markdown articles" },
	{ title: "BM25 search", detail: "Sub-50ms full-text search with English stemming" },
	{ title: "RAG query", detail: "Ask questions, get cited answers from your knowledge base" },
	{ title: "MCP server", detail: "8 tools for Claude Code, Cursor, and Claude Desktop" },
	{
		title: "Chrome extension",
		detail: "Save any webpage to your vault with one click",
		soon: true,
	},
	{ title: "No lock-in", detail: "Plain markdown files. Version with git. No database" },
];

export function Features() {
	return (
		<section className="mx-auto max-w-3xl px-6 py-16">
			<div className="space-y-0">
				{features.map((f) => (
					<div key={f.title} className="border-b border-border py-4">
						<span className="font-mono text-sm font-medium">{f.title}</span>
						{"soon" in f && f.soon && (
							<span className="ml-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
								coming soon
							</span>
						)}
						<span className="font-sans text-sm text-muted"> — {f.detail}</span>
					</div>
				))}
			</div>
		</section>
	);
}
