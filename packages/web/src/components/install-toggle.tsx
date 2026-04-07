"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

function CopyButton({ text }: { text: string }) {
	const [copied, setCopied] = useState(false);

	const handleCopy = async () => {
		await navigator.clipboard.writeText(text);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	return (
		<button
			type="button"
			onClick={handleCopy}
			className="shrink-0 rounded-md p-1.5 text-foreground/30 transition-all hover:bg-foreground/5 hover:text-foreground/60 cursor-pointer"
			aria-label="Copy"
		>
			{copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
		</button>
	);
}

export function InstallToggle() {
	return (
		<div className="flex flex-col gap-4">
			<div>
				<p className="mb-2 text-[11px] font-semibold tracking-wider text-accent uppercase">CLI</p>
				<div className="flex items-center justify-between rounded-xl border border-accent/20 bg-white px-5 py-3.5 shadow-sm shadow-accent/5">
					<code className="font-mono text-sm text-foreground">npm i -g @kibhq/cli && kib init</code>
					<CopyButton text="npm i -g @kibhq/cli && kib init" />
				</div>
			</div>

			<div>
				<p className="mb-2 text-[11px] font-semibold tracking-wider text-accent uppercase">
					LLM Prompt
				</p>
				<div className="flex items-center justify-between rounded-xl border border-accent/20 bg-white px-5 py-3.5 shadow-sm shadow-accent/5">
					<span className="font-mono text-sm italic text-foreground/60">
						Install @kibhq/cli, init a vault, and configure MCP
					</span>
					<CopyButton text="Install @kibhq/cli globally, initialize a vault at ~/.kib, and configure the kib MCP server" />
				</div>
			</div>
		</div>
	);
}
