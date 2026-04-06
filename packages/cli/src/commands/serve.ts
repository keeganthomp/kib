import { resolveVaultRoot, VaultNotFoundError } from "@kibhq/core";

interface ServeOpts {
	mcp?: boolean;
}

export async function serve(opts: ServeOpts) {
	if (!opts.mcp) {
		console.error("Usage: kib serve --mcp");
		console.error("  Starts an MCP server over stdio for AI tool integration.");
		process.exit(1);
	}

	let root: string;
	try {
		root = resolveVaultRoot();
	} catch (e) {
		if (e instanceof VaultNotFoundError) {
			console.error(e.message);
			process.exit(1);
		}
		throw e;
	}

	// Load saved API keys before starting server
	const { loadCredentials } = await import("../ui/setup-provider.js");
	loadCredentials();

	const { startMcpServer } = await import("../mcp/server.js");
	await startMcpServer(root);
}
