import { Loader2, Send } from "lucide-react";
import { Marked } from "marked";
import { useMemo, useRef, useState } from "react";
import { api } from "../api.js";

const marked = new Marked();

export function QueryPage() {
	const [question, setQuestion] = useState("");
	const [answer, setAnswer] = useState("");
	const [sources, setSources] = useState<string[]>([]);
	const [streaming, setStreaming] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const cancelRef = useRef<(() => void) | null>(null);

	const renderedAnswer = useMemo(() => {
		if (!answer) return "";
		return marked.parse(answer) as string;
	}, [answer]);

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (!question.trim() || streaming) return;

		setAnswer("");
		setSources([]);
		setError(null);
		setStreaming(true);

		cancelRef.current = api.queryStream(
			question,
			(text) => setAnswer((prev) => prev + text),
			(sourcePaths) => {
				setSources(sourcePaths);
				setStreaming(false);
			},
			(err) => {
				setError(err);
				setStreaming(false);
			},
		);
	};

	const handleCancel = () => {
		cancelRef.current?.();
		setStreaming(false);
	};

	return (
		<div className="p-8 max-w-3xl">
			<h2 className="text-xl font-semibold mb-4">Query</h2>

			<form onSubmit={handleSubmit} className="flex gap-2 mb-6">
				<input
					type="text"
					placeholder="Ask a question about your knowledge base..."
					value={question}
					onChange={(e) => setQuestion(e.target.value)}
					disabled={streaming}
					className="flex-1 px-3 py-2.5 border rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:ring-offset-1 disabled:opacity-50"
				/>
				{streaming ? (
					<button
						type="button"
						onClick={handleCancel}
						className="px-4 py-2.5 bg-red-500 text-white rounded-md text-sm hover:bg-red-600 transition-colors"
					>
						Stop
					</button>
				) : (
					<button
						type="submit"
						disabled={!question.trim()}
						className="px-4 py-2.5 bg-[var(--color-sidebar)] text-white rounded-md text-sm hover:opacity-90 transition-opacity disabled:opacity-30"
					>
						<Send size={16} />
					</button>
				)}
			</form>

			{error && (
				<div className="border border-red-200 bg-red-50 rounded-lg p-4 mb-4">
					<p className="text-sm text-red-600">{error}</p>
				</div>
			)}

			{(answer || streaming) && (
				<div className="border rounded-lg bg-white p-6">
					{streaming && !answer && (
						<div className="flex items-center gap-2 text-sm text-[var(--color-muted)]">
							<Loader2 size={14} className="animate-spin" />
							Thinking...
						</div>
					)}
					{answer && (
						<div
							className="article-content text-sm"
							dangerouslySetInnerHTML={{ __html: renderedAnswer }}
						/>
					)}
					{streaming && answer && (
						<span className="inline-block w-2 h-4 bg-[var(--color-foreground)] animate-pulse ml-0.5" />
					)}
				</div>
			)}

			{sources.length > 0 && (
				<div className="mt-4 border rounded-lg bg-white p-4">
					<h3 className="text-xs font-medium text-[var(--color-muted)] uppercase tracking-wider mb-2">
						Sources
					</h3>
					<div className="space-y-1">
						{sources.map((src) => (
							<p key={src} className="text-xs font-mono text-[var(--color-muted)]">
								{src}
							</p>
						))}
					</div>
				</div>
			)}
		</div>
	);
}
