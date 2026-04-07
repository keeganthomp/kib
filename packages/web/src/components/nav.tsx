import { Github } from "lucide-react";

export function Nav() {
	return (
		<nav className="fixed top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-md">
			<div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
				<a href="/" className="font-mono text-base font-semibold tracking-tight">
					kib
				</a>
				<a
					href="https://github.com/keeganthomp/kib"
					target="_blank"
					rel="noopener noreferrer"
					className="text-muted transition-colors hover:text-foreground"
					aria-label="GitHub"
				>
					<Github className="h-5 w-5" />
				</a>
			</div>
		</nav>
	);
}
