import { Github } from "lucide-react";

export function Nav() {
	return (
		<nav className="fixed top-0 z-50 w-full bg-background/90 backdrop-blur-sm">
			<div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-6">
				<a href="/" className="font-mono text-sm font-bold tracking-tight">
					kib
				</a>
				<a
					href="https://github.com/keeganthomp/kib"
					target="_blank"
					rel="noopener noreferrer"
					className="text-muted transition-colors hover:text-foreground"
					aria-label="GitHub"
				>
					<Github className="h-4 w-4" />
				</a>
			</div>
		</nav>
	);
}
