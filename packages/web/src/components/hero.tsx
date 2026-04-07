"use client";

import { Check, Copy, Github } from "lucide-react";
import { useCallback, useRef, useState } from "react";

const prompt = `Install @kibhq/cli globally, initialize a vault at ~/.kib, and configure the kib MCP.`;

function CopyButton({ text }: { text: string }) {
	const [copied, setCopied] = useState(false);
	const cooldown = useRef(false);

	const handleCopy = useCallback(async () => {
		if (cooldown.current) return;
		cooldown.current = true;
		await navigator.clipboard.writeText(text);
		setCopied(true);
		setTimeout(() => {
			setCopied(false);
			cooldown.current = false;
		}, 1500);
	}, [text]);

	return (
		<button
			type="button"
			onClick={handleCopy}
			className="shrink-0 cursor-pointer text-muted-foreground transition-colors hover:text-foreground"
			aria-label="Copy"
		>
			{copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
		</button>
	);
}

export function Hero() {
	return (
		<section className="mx-auto max-w-3xl px-6 pb-20 pt-32">
			<h1 className="font-mono text-4xl font-bold tracking-tight sm:text-5xl">kib</h1>
			<p className="mt-4 font-mono text-lg text-muted">The Headless Knowledge Compiler</p>
			<p className="mt-6 max-w-xl font-sans text-base leading-relaxed text-muted">
				Ingest anything — URLs, PDFs, YouTube, GitHub repos, images. Compile a structured wiki with
				AI. Search and query from the terminal.
			</p>

			<div className="mt-10 flex flex-col">
				<div>
					<span className="font-mono text-xs uppercase tracking-widest text-muted">
						tell your llm
					</span>
					<div className="mt-1.5 flex items-center justify-between border-b border-border pb-3">
						<span className="font-sans text-sm italic text-foreground/60">{prompt}</span>
						<CopyButton text={prompt} />
					</div>
				</div>

				<div className="py-5 text-center font-mono text-xs uppercase tracking-widest text-muted-foreground">
					or
				</div>

				<div className="flex flex-col gap-3">
					<div>
						<span className="font-mono text-xs uppercase tracking-widest text-muted">brew</span>
						<div className="mt-1.5 flex items-center justify-between border-b border-border pb-3">
							<span className="font-mono text-sm">
								brew tap keeganthomp/kib && brew install kib
							</span>
							<CopyButton text="brew tap keeganthomp/kib && brew install kib" />
						</div>
					</div>
					<div>
						<span className="font-mono text-xs uppercase tracking-widest text-muted">npm</span>
						<div className="mt-1.5 flex items-center justify-between border-b border-border pb-3">
							<span className="font-mono text-sm">npm i -g @kibhq/cli</span>
							<CopyButton text="npm i -g @kibhq/cli" />
						</div>
					</div>
				</div>
			</div>

			<div className="mt-8">
				<a
					href="https://github.com/keeganthomp/kib"
					target="_blank"
					rel="noopener noreferrer"
					className="flex items-center gap-1.5 font-mono text-sm text-muted transition-colors hover:text-foreground"
				>
					<Github className="h-3.5 w-3.5" />
					GitHub
				</a>
			</div>
		</section>
	);
}
