import { ArrowRight, Loader2, Square } from "lucide-react";
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
		<div className="p-10 max-w-2xl animate-page-in">
			<h2 className="text-lg font-semibold tracking-tight mb-6">Query</h2>

			<form onSubmit={handleSubmit} className="flex gap-2 mb-8">
				<input
					type="text"
					placeholder="Ask a question..."
					value={question}
					onChange={(e) => setQuestion(e.target.value)}
					disabled={streaming}
					className="flex-1 px-3 py-2.5 border rounded-md text-xs bg-white disabled:opacity-40"
				/>
				{streaming ? (
					<button
						type="button"
						onClick={handleCancel}
						className="px-3 py-2.5 bg-[#111] text-white/60 rounded-md text-xs hover:text-white"
					>
						<Square size={12} />
					</button>
				) : (
					<button
						type="submit"
						disabled={!question.trim()}
						className="px-3 py-2.5 bg-[#111] text-white rounded-md text-xs hover:bg-[#222] disabled:opacity-20"
					>
						<ArrowRight size={12} />
					</button>
				)}
			</form>

			{error && (
				<div className="rounded-lg bg-red-50 border border-red-100 px-4 py-3 mb-6">
					<p className="text-xs text-red-600">{error}</p>
				</div>
			)}

			{(answer || streaming) && (
				<div className="mb-6">
					{streaming && !answer && (
						<div className="flex items-center gap-2 text-xs text-[#999] py-4">
							<Loader2 size={12} className="animate-spin" />
							Thinking...
						</div>
					)}
					{answer && (
						<div className="article-content text-sm leading-relaxed">
							<div dangerouslySetInnerHTML={{ __html: renderedAnswer }} />
							{streaming && (
								<span className="inline-block w-1.5 h-3.5 bg-[#111] animate-pulse ml-0.5 -mb-0.5 rounded-sm" />
							)}
						</div>
					)}
				</div>
			)}

			{sources.length > 0 && (
				<div className="border-t pt-5">
					<h3 className="text-[10px] text-[#999] uppercase tracking-widest mb-3">
						Sources
					</h3>
					<div className="flex flex-wrap gap-1.5">
						{sources.map((src) => (
							<span
								key={src}
								className="text-[10px] font-mono text-[#999] bg-[#f5f5f5] px-2 py-1 rounded"
							>
								{src.split("/").pop()}
							</span>
						))}
					</div>
				</div>
			)}
		</div>
	);
}
