import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
	subsets: ["latin"],
	variable: "--font-sans",
	display: "swap",
});

const jetbrains = JetBrains_Mono({
	subsets: ["latin"],
	variable: "--font-mono",
	display: "swap",
});

export const metadata: Metadata = {
	title: "kib — The Headless Knowledge Compiler",
	description:
		"CLI-first, LLM-powered tool that turns raw sources into a structured, queryable markdown wiki. Ingest URLs, PDFs, YouTube, GitHub repos. Compile with AI. Search and query instantly.",
	keywords: [
		"knowledge base",
		"wiki",
		"LLM",
		"CLI",
		"RAG",
		"AI",
		"knowledge compiler",
		"MCP",
		"markdown",
		"knowledge management",
		"AI tools",
	],
	authors: [{ name: "Keegan Thompson", url: "https://github.com/keeganthomp" }],
	creator: "Keegan Thompson",
	openGraph: {
		type: "website",
		title: "kib — The Headless Knowledge Compiler",
		description: "Ingest anything. Compile a wiki. Query with AI. All from the terminal.",
		siteName: "kib",
	},
	twitter: {
		card: "summary_large_image",
		title: "kib — The Headless Knowledge Compiler",
		description: "CLI-first, LLM-powered knowledge compiler.",
	},
	robots: {
		index: true,
		follow: true,
	},
};

const jsonLd = {
	"@context": "https://schema.org",
	"@type": "SoftwareApplication",
	name: "kib",
	description:
		"The Headless Knowledge Compiler. CLI-first, LLM-powered tool that turns raw sources into a structured, queryable markdown wiki.",
	applicationCategory: "DeveloperApplication",
	operatingSystem: "macOS, Linux",
	offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
	downloadUrl: "https://www.npmjs.com/package/@kibhq/cli",
	softwareVersion: "0.4.2",
	author: {
		"@type": "Person",
		name: "Keegan Thompson",
		url: "https://github.com/keeganthomp",
	},
	license: "https://opensource.org/licenses/MIT",
	codeRepository: "https://github.com/keeganthomp/kib",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en" className={`${inter.variable} ${jetbrains.variable}`}>
			<head>
				<script
					type="application/ld+json"
					dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
				/>
			</head>
			<body>{children}</body>
		</html>
	);
}
