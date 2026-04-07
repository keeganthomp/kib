import { ArrowRight, Brain, Download, Search } from "lucide-react";

const steps = [
	{ icon: Download, title: "Ingest", command: "kib ingest <source>" },
	{ icon: Brain, title: "Compile", command: "kib compile" },
	{ icon: Search, title: "Query", command: "kib query <question>" },
];

export function Architecture() {
	return (
		<section id="how-it-works" className="mx-auto max-w-5xl px-6 py-12">
			<h2 className="mb-12 text-center text-2xl font-semibold tracking-tight sm:text-3xl">
				Three commands
			</h2>
			<div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center sm:gap-8">
				{steps.map((step, i) => (
					<div key={step.title} className="contents">
						<div className="flex flex-col items-center gap-2 text-center">
							<div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-light text-accent">
								<step.icon className="h-5 w-5" />
							</div>
							<h3 className="font-medium">{step.title}</h3>
							<code className="font-mono text-xs text-muted">{step.command}</code>
						</div>
						{i < steps.length - 1 && (
							<ArrowRight className="hidden h-4 w-4 text-muted-foreground sm:block" />
						)}
					</div>
				))}
			</div>
		</section>
	);
}
