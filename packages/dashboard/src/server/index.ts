import { existsSync } from "node:fs";
import { extname, join } from "node:path";
import { handleApi } from "./api.js";
import { createContext } from "./context.js";

const MIME_TYPES: Record<string, string> = {
	".html": "text/html; charset=utf-8",
	".js": "application/javascript; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".svg": "image/svg+xml",
	".png": "image/png",
	".jpg": "image/jpeg",
	".ico": "image/x-icon",
	".woff": "font/woff",
	".woff2": "font/woff2",
};

export async function startServer(
	root: string,
	port: number,
): Promise<{ url: string; stop: () => void }> {
	const ctx = createContext(root);

	// Resolve the built client assets directory
	const distDir = join(import.meta.dir, "../../dist");
	const hasBuiltAssets = existsSync(distDir);

	const server = Bun.serve({
		port,
		async fetch(req) {
			const url = new URL(req.url);

			// API routes
			if (url.pathname.startsWith("/api/")) {
				return handleApi(url, req, ctx);
			}

			// Serve built static assets
			if (hasBuiltAssets) {
				const filePath =
					url.pathname === "/" ? join(distDir, "index.html") : join(distDir, url.pathname);

				const file = Bun.file(filePath);
				if (await file.exists()) {
					const ext = extname(filePath);
					const contentType = MIME_TYPES[ext];
					return new Response(
						file,
						contentType ? { headers: { "Content-Type": contentType } } : undefined,
					);
				}

				// SPA fallback — serve index.html for client-side routing
				return new Response(Bun.file(join(distDir, "index.html")), {
					headers: { "Content-Type": "text/html; charset=utf-8" },
				});
			}

			// No built assets — show helpful message
			return new Response("Dashboard not built. Run: bun run --filter @kibhq/dashboard build", {
				status: 503,
				headers: { "Content-Type": "text/plain" },
			});
		},
	});

	const serverUrl = `http://localhost:${server.port}`;
	return {
		url: serverUrl,
		stop: () => server.stop(),
	};
}
