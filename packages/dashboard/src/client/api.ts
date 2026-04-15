const BASE = "/api";

async function get<T>(path: string): Promise<T> {
	const res = await fetch(`${BASE}${path}`);
	if (!res.ok) {
		const body = await res.json().catch(() => ({ error: res.statusText }));
		throw new Error((body as { error?: string }).error ?? res.statusText);
	}
	return res.json() as Promise<T>;
}

async function post<T>(path: string, body: unknown): Promise<T> {
	const res = await fetch(`${BASE}${path}`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
	if (!res.ok) {
		const data = await res.json().catch(() => ({ error: res.statusText }));
		throw new Error((data as { error?: string }).error ?? res.statusText);
	}
	return res.json() as Promise<T>;
}

// --- Types ---

export interface VaultStatus {
	vault: {
		name: string;
		created: string;
		lastCompiled: string | null;
		provider: string;
		model: string;
	};
	root: string;
	stats: {
		totalSources: number;
		totalArticles: number;
		totalWords: number;
		lastLintAt: string | null;
	};
	provider: {
		name: string;
		model: string;
		ready: boolean;
		apiKeyHint: string | null;
	};
}

export interface ArticleItem {
	path: string;
	slug: string;
	title?: string;
	category: string;
	tags: string[];
	summary: string;
	wordCount: number;
	lastUpdated?: string;
}

export interface RawItem {
	path: string;
	title: string;
	sourceType?: string;
	ingestedAt?: string;
	wordCount?: number;
}

export interface ArticleContent {
	path: string;
	content: string;
}

export interface SearchResult {
	path: string;
	score: number;
	snippet: string;
	title?: string;
	scope: "wiki" | "raw";
}

export interface GraphData {
	nodes: {
		id: string;
		category: string;
		tags: string[];
		wordCount: number;
		summary: string;
	}[];
	edges: { source: string; target: string }[];
}

export interface IngestResult {
	sourceId: string;
	path: string;
	sourceType: string;
	title: string;
	wordCount: number;
	skipped: boolean;
	skipReason?: string;
}

export interface CompileResult {
	sourcesCompiled: number;
	articlesCreated: number;
	articlesUpdated: number;
	articlesDeleted: number;
}

// --- API Functions ---

export const api = {
	getStatus: () => get<VaultStatus>("/status"),

	compile: (force = false) => post<{ started: boolean }>("/compile", { force }),

	stopCompile: () => post<{ stopped: boolean }>("/compile/stop", {}),

	getArticles: (scope: "wiki" | "raw" = "wiki") => get<ArticleItem[]>(`/articles?scope=${scope}`),

	getRawSources: () => get<RawItem[]>("/articles?scope=raw"),

	readArticle: (path: string, scope: "wiki" | "raw" = "wiki") =>
		get<ArticleContent>(`/articles/${path}?scope=${scope}`),

	search: (q: string, opts?: { limit?: number; tag?: string; since?: string }) => {
		const params = new URLSearchParams({ q });
		if (opts?.limit) params.set("limit", String(opts.limit));
		if (opts?.tag) params.set("tag", opts.tag);
		if (opts?.since) params.set("since", opts.since);
		return get<SearchResult[]>(`/search?${params}`);
	},

	queryStream: (
		question: string,
		onChunk: (text: string) => void,
		onDone: (sourcePaths: string[]) => void,
		onError: (error: string) => void,
	) => {
		const controller = new AbortController();

		fetch(`${BASE}/query`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ question }),
			signal: controller.signal,
		})
			.then(async (res) => {
				if (!res.ok || !res.body) {
					onError("Failed to start query stream");
					return;
				}
				const reader = res.body.getReader();
				const decoder = new TextDecoder();
				let buffer = "";

				while (true) {
					const { done, value } = await reader.read();
					if (done) break;

					buffer += decoder.decode(value, { stream: true });
					const lines = buffer.split("\n");
					buffer = lines.pop() ?? "";

					for (const line of lines) {
						if (!line.startsWith("data: ")) continue;
						const payload = line.slice(6);
						try {
							const data = JSON.parse(payload) as {
								text?: string;
								done?: boolean;
								sourcePaths?: string[];
								error?: string;
							};
							if (data.error) {
								onError(data.error);
								return;
							}
							if (data.text) onChunk(data.text);
							if (data.done && data.sourcePaths) onDone(data.sourcePaths);
						} catch {
							// ignore malformed lines
						}
					}
				}
			})
			.catch((err) => {
				if ((err as Error).name !== "AbortError") {
					onError((err as Error).message);
				}
			});

		return () => controller.abort();
	},

	ingest: (urlOrContent: string, title?: string) => {
		const isUrl = urlOrContent.startsWith("http://") || urlOrContent.startsWith("https://");
		return post<IngestResult>(
			"/ingest",
			isUrl ? { url: urlOrContent } : { content: urlOrContent, title },
		);
	},

	getGraph: () => get<GraphData>("/graph"),
};
