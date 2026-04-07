"use client";

import { Check, Copy } from "lucide-react";
import { useCallback, useRef, useState } from "react";

const lines = [
	"kib init",
	"kib ingest https://arxiv.org/abs/1706.03762",
	"kib compile",
	'kib query "explain the attention mechanism"',
];

export function Quickstart() {
	const [copied, setCopied] = useState(false);
	const cooldown = useRef(false);
	const code = lines.join("\n");

	const handleCopy = useCallback(async () => {
		if (cooldown.current) return;
		cooldown.current = true;
		await navigator.clipboard.writeText(code);
		setCopied(true);
		setTimeout(() => {
			setCopied(false);
			cooldown.current = false;
		}, 1500);
	}, [code]);

	return (
		<section className="mx-auto max-w-3xl px-6 py-16">
			<div className="border border-border">
				<div className="flex items-center justify-between border-b border-border px-4 py-2">
					<span className="font-mono text-[11px] uppercase tracking-widest text-muted">
						cli quickstart
					</span>
					<button
						type="button"
						onClick={handleCopy}
						className="cursor-pointer text-muted-foreground transition-colors hover:text-foreground"
						aria-label="Copy"
					>
						{copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
					</button>
				</div>
				<div className="p-4 font-mono text-[13px] leading-loose">
					{lines.map((line) => (
						<div key={line}>
							<span className="select-none text-muted-foreground">$ </span>
							{line}
						</div>
					))}
				</div>
			</div>
		</section>
	);
}
