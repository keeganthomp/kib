export function Footer() {
	return (
		<footer className="mt-16 border-t border-border">
			<div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-8">
				<span className="font-mono text-xs font-medium">kib</span>
				<div className="flex items-center gap-5 font-mono text-xs text-muted">
					<a
						href="https://github.com/keeganthomp/kib"
						target="_blank"
						rel="noopener noreferrer"
						className="transition-colors hover:text-foreground"
					>
						github
					</a>
					<a
						href="https://www.npmjs.com/package/@kibhq/cli"
						target="_blank"
						rel="noopener noreferrer"
						className="transition-colors hover:text-foreground"
					>
						npm
					</a>
					<a href="/privacy" className="transition-colors hover:text-foreground">
						privacy
					</a>
					<a
						href="mailto:whereiskeegan@gmail.com"
						className="transition-colors hover:text-foreground"
					>
						contact
					</a>
					<span className="text-muted-foreground">MIT</span>
				</div>
			</div>
		</footer>
	);
}
