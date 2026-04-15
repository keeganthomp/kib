import { queryVault } from "@kibhq/core";
import type { DashboardContext } from "./context.js";

export async function handleQueryStream(
	ctx: DashboardContext,
	body: { question: string; maxArticles?: number; source?: string },
): Promise<Response> {
	const provider = await ctx.getProvider();

	const encoder = new TextEncoder();
	const stream = new ReadableStream({
		async start(controller) {
			try {
				const result = await queryVault(ctx.root, body.question, provider, {
					onChunk(text: string) {
						controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
					},
					maxArticles: body.maxArticles,
					source: body.source,
				});

				controller.enqueue(
					encoder.encode(
						`data: ${JSON.stringify({ done: true, sourcePaths: result.sourcePaths, usage: result.usage })}\n\n`,
					),
				);
				controller.close();
			} catch (err) {
				controller.enqueue(
					encoder.encode(`data: ${JSON.stringify({ error: (err as Error).message })}\n\n`),
				);
				controller.close();
			}
		},
	});

	return new Response(stream, {
		headers: {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache",
			Connection: "keep-alive",
		},
	});
}
