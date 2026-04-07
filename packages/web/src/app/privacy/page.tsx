import type { Metadata } from "next";
import { Footer } from "@/components/footer";
import { Nav } from "@/components/nav";

export const metadata: Metadata = {
	title: "Privacy Policy — kib",
	description: "Privacy policy for kib and the kib Chrome extension.",
};

export default function Privacy() {
	return (
		<>
			<Nav />
			<main className="mx-auto max-w-3xl px-6 pb-20 pt-28">
				<h1 className="mb-2 text-3xl font-bold tracking-tight">Privacy Policy</h1>
				<p className="mb-10 text-sm text-muted">Last updated: April 7, 2026</p>

				<div className="space-y-8 text-[15px] leading-relaxed text-foreground/90">
					<section>
						<h2 className="mb-3 text-lg font-semibold">Overview</h2>
						<p>
							kib is an open-source, local-first knowledge compiler. Your data stays on your
							machine. We do not operate servers that receive, store, or process your content.
						</p>
					</section>

					<section>
						<h2 className="mb-3 text-lg font-semibold">CLI Tool</h2>
						<p>
							The kib CLI runs entirely on your local machine. All ingested content, compiled wiki
							articles, and search indexes are stored in your local vault directory. When you use
							commands that call an LLM (compile, query, chat), your content is sent directly to the
							LLM provider you configured (Anthropic, OpenAI, or a local Ollama instance). We do not
							proxy, intercept, or log these requests.
						</p>
					</section>

					<section>
						<h2 className="mb-3 text-lg font-semibold">Chrome Extension</h2>
						<p>
							The kib Chrome extension extracts webpage content (text, title, and URL) from the
							active tab when you click &quot;Save to kib.&quot; This content is sent to your
							locally running kib server at <code>localhost:4747</code> and is never transmitted to
							any external server.
						</p>
						<p className="mt-3">The extension:</p>
						<ul className="mt-2 list-disc space-y-1 pl-6">
							<li>Does not collect personally identifiable information</li>
							<li>Does not track browsing history or user activity</li>
							<li>Does not use analytics, telemetry, or third-party scripts</li>
							<li>Does not transmit data to any server other than your local machine</li>
							<li>Stores only your local server connection preference using Chrome storage</li>
						</ul>
					</section>

					<section>
						<h2 className="mb-3 text-lg font-semibold">Third-Party Services</h2>
						<p>
							When you configure an LLM provider, your content is sent to that provider under their
							terms of service. We encourage you to review the privacy policies of your chosen
							provider:
						</p>
						<ul className="mt-2 list-disc space-y-1 pl-6">
							<li>
								<a
									href="https://www.anthropic.com/privacy"
									target="_blank"
									rel="noopener noreferrer"
									className="underline underline-offset-2 transition-colors hover:text-foreground"
								>
									Anthropic Privacy Policy
								</a>
							</li>
							<li>
								<a
									href="https://openai.com/privacy"
									target="_blank"
									rel="noopener noreferrer"
									className="underline underline-offset-2 transition-colors hover:text-foreground"
								>
									OpenAI Privacy Policy
								</a>
							</li>
						</ul>
					</section>

					<section>
						<h2 className="mb-3 text-lg font-semibold">Website</h2>
						<p>
							This website (kib.dev) is a static site. It does not use cookies, analytics, or
							tracking of any kind.
						</p>
					</section>

					<section>
						<h2 className="mb-3 text-lg font-semibold">Contact</h2>
						<p>
							If you have questions about this policy, open an issue on{" "}
							<a
								href="https://github.com/keeganthomp/kib"
								target="_blank"
								rel="noopener noreferrer"
								className="underline underline-offset-2 transition-colors hover:text-foreground"
							>
								GitHub
							</a>
							.
						</p>
					</section>
				</div>
			</main>
			<Footer />
		</>
	);
}
