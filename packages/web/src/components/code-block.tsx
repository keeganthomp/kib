"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

export function CodeBlock({
	children,
	copyText,
	className,
}: {
	children: React.ReactNode;
	copyText?: string;
	className?: string;
}) {
	const [copied, setCopied] = useState(false);

	const handleCopy = async () => {
		if (!copyText) return;
		await navigator.clipboard.writeText(copyText);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	return (
		<div className={cn("overflow-hidden rounded-lg border border-border bg-[#f8f8fc]", className)}>
			{copyText && (
				<div className="flex justify-end px-3 pt-2">
					<button
						type="button"
						onClick={handleCopy}
						className="text-muted-foreground transition-colors hover:text-foreground cursor-pointer"
						aria-label="Copy to clipboard"
					>
						{copied ? (
							<Check className="h-3.5 w-3.5 text-green-500" />
						) : (
							<Copy className="h-3.5 w-3.5" />
						)}
					</button>
				</div>
			)}
			<div className="px-4 pb-4 pt-2 font-mono text-[13px] leading-relaxed text-foreground/80">
				{children}
			</div>
		</div>
	);
}
