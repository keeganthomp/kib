export type VaultEvent =
	| { type: "ingest"; sourceId: string; title: string }
	| { type: "compile_started" }
	| { type: "compile_progress"; message: string }
	| { type: "compile_article"; op: string; title: string }
	| {
			type: "compile_done";
			articlesCreated: number;
			articlesUpdated: number;
			sourcesCompiled: number;
	  }
	| { type: "compile_error"; message: string }
	| { type: "search_invalidated" }
	| { type: "error"; message: string };

type Listener = (event: VaultEvent) => void;

const listeners = new Set<Listener>();

export function emit(event: VaultEvent) {
	for (const listener of listeners) {
		listener(event);
	}
}

export function subscribe(listener: Listener): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export function handleEventsStream(): Response {
	const encoder = new TextEncoder();
	let unsubscribe: (() => void) | null = null;
	let keepalive: ReturnType<typeof setInterval> | null = null;

	const stream = new ReadableStream({
		start(controller) {
			controller.enqueue(encoder.encode(": connected\n\n"));

			unsubscribe = subscribe((event) => {
				try {
					controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
				} catch {
					// Client disconnected
				}
			});

			keepalive = setInterval(() => {
				try {
					controller.enqueue(encoder.encode(": keepalive\n\n"));
				} catch {
					// Client disconnected
				}
			}, 30_000);
		},
		cancel() {
			unsubscribe?.();
			if (keepalive) clearInterval(keepalive);
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
