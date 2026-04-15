import { useEffect, useRef, useState } from "react";

export interface VaultEvent {
	type:
		| "ingest"
		| "compile_started"
		| "compile_progress"
		| "compile_article"
		| "compile_done"
		| "compile_error"
		| "search_invalidated"
		| "error";
	sourceId?: string;
	title?: string;
	op?: string;
	articlesCreated?: number;
	articlesUpdated?: number;
	sourcesCompiled?: number;
	message?: string;
}

/**
 * Subscribe to real-time vault events via SSE.
 * Returns a revision counter that increments on every event — use it as a
 * dependency in useEffect to trigger re-fetches.
 */
export function useEvents(): { revision: number; lastEvent: VaultEvent | null } {
	const [revision, setRevision] = useState(0);
	const [lastEvent, setLastEvent] = useState<VaultEvent | null>(null);
	const retryRef = useRef(0);

	useEffect(() => {
		let es: EventSource | null = null;
		let closed = false;

		function connect() {
			if (closed) return;
			es = new EventSource("/api/events");

			es.onmessage = (e) => {
				try {
					const event = JSON.parse(e.data) as VaultEvent;
					setLastEvent(event);
					setRevision((r) => r + 1);
					retryRef.current = 0;
				} catch {
					// ignore malformed events
				}
			};

			es.onerror = () => {
				es?.close();
				if (!closed) {
					// Reconnect with backoff
					const delay = Math.min(1000 * 2 ** retryRef.current, 10_000);
					retryRef.current++;
					setTimeout(connect, delay);
				}
			};
		}

		connect();

		return () => {
			closed = true;
			es?.close();
		};
	}, []);

	return { revision, lastEvent };
}
