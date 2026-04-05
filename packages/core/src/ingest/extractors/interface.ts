import type { SourceType } from "../../types.js";

export interface ExtractOptions {
	/** Override the detected title */
	title?: string;
	/** Additional tags to attach */
	tags?: string[];
	/** Whether to download images referenced in the content */
	downloadImages?: boolean;
}

export interface ExtractResult {
	/** Extracted/detected title */
	title: string;
	/** Cleaned markdown content */
	content: string;
	/** Source-specific metadata */
	metadata: Record<string, unknown>;
}

export interface Extractor {
	/** Which source type this extractor handles */
	type: SourceType;
	/** Extract content from the given input (URL or file path) */
	extract(input: string, options?: ExtractOptions): Promise<ExtractResult>;
}
