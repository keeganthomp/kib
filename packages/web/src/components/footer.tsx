export function Footer() {
	return (
		<footer className="border-t border-border">
			<div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-8">
				<span className="font-mono text-sm font-medium">kib</span>
				<div className="flex items-center gap-6 text-sm text-muted">
					<a
						href="https://github.com/keeganthomp/kib"
						target="_blank"
						rel="noopener noreferrer"
						className="transition-colors hover:text-foreground"
					>
						GitHub
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
						Privacy
					</a>
					<span className="text-muted-foreground">MIT</span>
				</div>
			</div>
		</footer>
	);
}
