import { hash } from "../hash.js";
import type { IngestResult, LLMProvider, Manifest, SourceEntry, SourceType } from "../types.js";
import { appendLog, loadManifest, saveManifest, writeRaw } from "../vault.js";
import type { Extractor } from "./extractors/interface.js";
import { countWords, normalizeSource, slugify } from "./normalize.js";
import { detectSourceType } from "./router.js";

interface IngestOptions {
	/** Override the detected source type */
	sourceType?: SourceType;
	/** Override category (raw/ subdirectory) */
	category?: string;
	/** Additional tags */
	tags?: string[];
	/** Custom title */
	title?: string;
	/** Preview what would be ingested without writing */
	dryRun?: boolean;
	/** LLM provider (required for image ingestion) */
	provider?: LLMProvider;
}

/**
 * Ingest a single source into the vault.
 *
 * 1. Detect source type
 * 2. Route to the correct extractor
 * 3. Extract content
 * 4. Hash content (dedup check)
 * 5. Normalize with frontmatter
 * 6. Write to raw/
 * 7. Update manifest
 */
export async function ingestSource(
	root: string,
	uri: string,
	options: IngestOptions = {},
): Promise<IngestResult> {
	const sourceType = options.sourceType ?? detectSourceType(uri);

	// Get the extractor for this source type
	const extractor = await getExtractor(sourceType, options.provider);

	// Extract content
	const extracted = await extractor.extract(uri, { title: options.title, tags: options.tags });

	// Hash the extracted content for dedup
	const contentHash = await hash(extracted.content);

	// Load manifest and check for duplicates
	const manifest = await loadManifest(root);

	// Check if we already have this exact content
	const existingSource = findExistingSource(manifest, uri, contentHash);
	if (existingSource) {
		return {
			sourceId: existingSource.id,
			path: existingSource.path,
			sourceType,
			title: extracted.title,
			wordCount: countWords(extracted.content),
			skipped: true,
			skipReason: "Duplicate content (same hash already ingested)",
		};
	}

	// Dry run — return what would be ingested without writing
	if (options.dryRun) {
		const category = options.category ?? categoryForType(sourceType);
		const slug = slugify(extracted.title);
		return {
			sourceId: `src_${contentHash.slice(0, 12)}`,
			path: `raw/${category}/${slug}.md`,
			sourceType,
			title: extracted.title,
			wordCount: countWords(extracted.content),
			skipped: false,
		};
	}

	// Normalize content with frontmatter
	const normalizedContent = normalizeSource({
		title: extracted.title,
		content: extracted.content,
		sourceType,
		originalUrl: isUrl(uri) ? uri : undefined,
		metadata: extracted.metadata,
	});

	// Determine file path within raw/
	const category = options.category ?? categoryForType(sourceType);
	const slug = slugify(extracted.title);
	const relativePath = `${category}/${slug}.md`;

	// Write to raw/
	await writeRaw(root, relativePath, normalizedContent);

	// Generate a source ID
	const sourceId = `src_${contentHash.slice(0, 12)}`;

	// Update manifest
	const now = new Date().toISOString();
	const wordCount = countWords(extracted.content);

	const sourceEntry: SourceEntry = {
		hash: contentHash,
		ingestedAt: now,
		lastCompiled: null,
		sourceType,
		originalUrl: isUrl(uri) ? uri : undefined,
		producedArticles: [],
		metadata: {
			title: extracted.title,
			author: extracted.metadata.author as string | undefined,
			date: extracted.metadata.date as string | undefined,
			wordCount,
		},
	};

	manifest.sources[sourceId] = sourceEntry;
	manifest.stats.totalSources = Object.keys(manifest.sources).length;

	await saveManifest(root, manifest);
	await appendLog(root, "ingest", `"${extracted.title}" (${sourceType}) → raw/${relativePath}`);

	return {
		sourceId,
		path: `raw/${relativePath}`,
		sourceType,
		title: extracted.title,
		wordCount,
		skipped: false,
	};
}

async function getExtractor(sourceType: SourceType, provider?: LLMProvider): Promise<Extractor> {
	switch (sourceType) {
		case "web": {
			const { createWebExtractor } = await import("./extractors/web.js");
			return createWebExtractor();
		}
		case "pdf": {
			const { createPdfExtractor } = await import("./extractors/pdf.js");
			return createPdfExtractor();
		}
		case "youtube": {
			const { createYoutubeExtractor } = await import("./extractors/youtube.js");
			return createYoutubeExtractor();
		}
		case "github": {
			const { createGithubExtractor } = await import("./extractors/github.js");
			return createGithubExtractor();
		}
		case "file": {
			const { createFileExtractor } = await import("./extractors/file.js");
			return createFileExtractor();
		}
		case "image": {
			if (!provider) {
				// Auto-detect provider if not passed
				const { createProvider } = await import("../providers/router.js");
				provider = await createProvider();
			}
			const { createImageExtractor } = await import("./extractors/image.js");
			return createImageExtractor(provider);
		}
		default:
			throw new Error(`Unsupported source type: ${sourceType}`);
	}
}

function categoryForType(sourceType: SourceType): string {
	switch (sourceType) {
		case "pdf":
			return "papers";
		case "youtube":
			return "transcripts";
		case "github":
			return "repos";
		case "image":
			return "images";
		default:
			return "articles";
	}
}

function findExistingSource(
	manifest: Manifest,
	_uri: string,
	contentHash: string,
): { id: string; path: string } | null {
	for (const [id, source] of Object.entries(manifest.sources)) {
		// Same content hash = same content regardless of URL
		if (source.hash === contentHash) {
			return { id, path: source.producedArticles[0] ?? "" };
		}
		// Same URL but different hash = content changed, allow re-ingest
	}
	return null;
}

function isUrl(str: string): boolean {
	return str.startsWith("http://") || str.startsWith("https://");
}
