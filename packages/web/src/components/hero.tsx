import { ArrowRight, Github } from "lucide-react";
import { InstallToggle } from "./install-toggle";
import { Button } from "./ui/button";

export function Hero() {
	return (
		<section className="flex flex-col items-center justify-center px-6 pb-12 pt-28">
			<div className="flex flex-col items-center gap-5 text-center">
				<h1 className="max-w-xl text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
					The Headless Knowledge Compiler
				</h1>

				<p className="max-w-md text-base text-muted">
					Ingest anything. Compile a wiki. Query with AI.
				</p>

				<div className="flex items-center gap-3 pt-1">
					<a
						href="https://github.com/keeganthomp/kib#quick-start"
						target="_blank"
						rel="noopener noreferrer"
					>
						<Button>
							Get Started
							<ArrowRight className="h-4 w-4" />
						</Button>
					</a>
					<a href="https://github.com/keeganthomp/kib" target="_blank" rel="noopener noreferrer">
						<Button variant="outline">
							<Github className="h-4 w-4" />
							GitHub
						</Button>
					</a>
				</div>

				<div className="mt-8 w-full max-w-md text-left">
					<InstallToggle />
				</div>
			</div>
		</section>
	);
}
