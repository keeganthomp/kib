import { CodeBlock } from "./code-block";

const code = `npm i -g @kibhq/cli
kib init
kib ingest https://arxiv.org/abs/1706.03762
kib compile
kib query "explain the attention mechanism"`;

export function Quickstart() {
	return (
		<section id="quickstart" className="mx-auto max-w-5xl px-6 py-12">
			<h2 className="mb-8 text-center text-2xl font-semibold tracking-tight sm:text-3xl">
				Get started in seconds
			</h2>
			<div className="mx-auto max-w-xl">
				<CodeBlock copyText={code}>
					<div className="space-y-1">
						{code.split("\n").map((line) => (
							<div key={line}>
								<span className="text-cyan-400 select-none">$ </span>
								<span>{line}</span>
							</div>
						))}
					</div>
				</CodeBlock>
			</div>
		</section>
	);
}
