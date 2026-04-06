import type { ExtractOptions, Extractor, ExtractResult } from "./interface.js";

export function createYoutubeExtractor(): Extractor {
	return {
		type: "youtube",

		async extract(url: string, options?: ExtractOptions): Promise<ExtractResult> {
			const videoId = extractVideoId(url);
			if (!videoId) {
				throw new Error(`Could not extract video ID from URL: ${url}`);
			}

			// Fetch video page to get title and metadata
			const pageData = await fetchVideoPage(videoId);

			// Attempt to fetch transcript
			let transcript: string | null = null;
			try {
				transcript = await fetchTranscript(videoId);
			} catch {
				// Transcript not available — fall back to description
			}

			const title = options?.title ?? pageData.title ?? `YouTube Video ${videoId}`;

			let content: string;
			if (transcript) {
				content = `# ${title}\n\n**Source:** https://www.youtube.com/watch?v=${videoId}\n\n## Transcript\n\n${transcript}`;
			} else if (pageData.description) {
				content = `# ${title}\n\n**Source:** https://www.youtube.com/watch?v=${videoId}\n\n## Description\n\n${pageData.description}\n\n*Note: Transcript was not available for this video.*`;
			} else {
				content = `# ${title}\n\n**Source:** https://www.youtube.com/watch?v=${videoId}\n\n*No transcript or description available.*`;
			}

			return {
				title,
				content,
				metadata: {
					videoId,
					channelName: pageData.channelName,
					url: `https://www.youtube.com/watch?v=${videoId}`,
					hasTranscript: transcript !== null,
				},
			};
		},
	};
}

export function extractVideoId(url: string): string | null {
	const trimmed = url.trim();

	// youtu.be/VIDEO_ID
	const shortMatch = trimmed.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
	if (shortMatch) return shortMatch[1]!;

	// youtube.com/watch?v=VIDEO_ID
	try {
		const parsed = new URL(trimmed);
		const v = parsed.searchParams.get("v");
		if (v && v.length === 11) return v;
	} catch {
		// Not a valid URL
	}

	// youtube.com/embed/VIDEO_ID
	const embedMatch = trimmed.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/);
	if (embedMatch) return embedMatch[1]!;

	return null;
}

interface VideoPageData {
	title: string | null;
	description: string | null;
	channelName: string | null;
}

async function fetchVideoPage(videoId: string): Promise<VideoPageData> {
	// Use oembed API — no auth needed, returns JSON
	try {
		const response = await fetch(
			`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
		);
		if (response.ok) {
			const data = (await response.json()) as any;
			return {
				title: data.title ?? null,
				description: null, // oembed doesn't include description
				channelName: data.author_name ?? null,
			};
		}
	} catch {
		// Fallback
	}

	return { title: null, description: null, channelName: null };
}

async function fetchTranscript(videoId: string): Promise<string> {
	// Fetch the video page to get the captions track URL
	const response = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
		headers: {
			"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
			"Accept-Language": "en-US,en;q=0.9",
		},
	});

	if (!response.ok) {
		throw new Error(`Failed to fetch video page: ${response.status}`);
	}

	const html = await response.text();

	// Extract captions data from the page
	const captionMatch = html.match(/"captionTracks":\[(\{.*?\})\]/);
	if (!captionMatch) {
		throw new Error("No captions available");
	}

	// Parse the first caption track URL
	const trackData = JSON.parse(`[${captionMatch[1]}]`);
	const track = trackData[0];
	if (!track?.baseUrl) {
		throw new Error("No caption track URL found");
	}

	// Fetch the transcript XML
	const transcriptResponse = await fetch(track.baseUrl);
	if (!transcriptResponse.ok) {
		throw new Error("Failed to fetch transcript");
	}

	const xml = await transcriptResponse.text();

	// Parse XML transcript into plain text
	return parseTranscriptXml(xml);
}

function parseTranscriptXml(xml: string): string {
	const lines: string[] = [];
	const textRegex = /<text[^>]*>([\s\S]*?)<\/text>/g;
	let match: RegExpExecArray | null;

	while ((match = textRegex.exec(xml)) !== null) {
		const text = match[1]!
			.replace(/&amp;/g, "&")
			.replace(/&lt;/g, "<")
			.replace(/&gt;/g, ">")
			.replace(/&quot;/g, '"')
			.replace(/&#39;/g, "'")
			.replace(/<[^>]+>/g, "") // strip any HTML tags
			.trim();

		if (text) {
			lines.push(text);
		}
	}

	// Join into paragraphs — group ~5 lines together
	const paragraphs: string[] = [];
	for (let i = 0; i < lines.length; i += 5) {
		paragraphs.push(lines.slice(i, i + 5).join(" "));
	}

	return paragraphs.join("\n\n");
}
