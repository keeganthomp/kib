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
	metadataBase: new URL("https://kib.dev"),
	title: "kib — The Headless Knowledge Compiler",
	description:
		"CLI-first, LLM-powered tool that turns raw sources into a structured, queryable markdown wiki. Ingest URLs, PDFs, YouTube, GitHub repos, images. Compile with AI. Search and query instantly. MCP server included.",
	keywords: [
		"knowledge base",
		"knowledge compiler",
		"wiki",
		"LLM",
		"CLI",
		"RAG",
		"AI",
		"MCP server",
		"markdown",
		"knowledge management",
		"AI tools",
		"Homebrew",
		"Chrome extension",
	],
	authors: [{ name: "Keegan Thompson", url: "https://github.com/keeganthomp" }],
	creator: "Keegan Thompson",
	openGraph: {
		type: "website",
		title: "kib — The Headless Knowledge Compiler",
		description:
			"Ingest anything. Compile a wiki. Query with AI. All from the terminal. MCP server for Claude Code, Cursor, and Claude Desktop.",
		siteName: "kib",
	},
	twitter: {
		card: "summary_large_image",
		title: "kib — The Headless Knowledge Compiler",
		description: "CLI-first, LLM-powered knowledge compiler with MCP server.",
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
		"The Headless Knowledge Compiler. CLI-first, LLM-powered tool that turns raw sources into a structured, queryable markdown wiki. Supports ingesting URLs, PDFs, YouTube transcripts, GitHub repos, and images. Includes BM25 search, RAG query, and an MCP server with 8 tools for AI assistant integration.",
	applicationCategory: "DeveloperApplication",
	operatingSystem: "macOS, Linux",
	offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
	downloadUrl: "https://www.npmjs.com/package/@kibhq/cli",
	softwareVersion: "0.4.3",
	author: {
		"@type": "Person",
		name: "Keegan Thompson",
		url: "https://github.com/keeganthomp",
	},
	license: "https://opensource.org/licenses/MIT",
	codeRepository: "https://github.com/keeganthomp/kib",
	featureList: [
		"Ingest URLs, PDFs, YouTube, GitHub repos, images",
		"AI-compiled structured markdown wiki",
		"BM25 full-text search with English stemming",
		"RAG query with cited answers",
		"MCP server with 8 tools for Claude Code, Cursor, Claude Desktop",
		"Chrome extension for one-click webpage saving",
		"Homebrew installation support",
		"Plain markdown files, no database, no lock-in",
	],
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
