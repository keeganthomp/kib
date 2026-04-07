import { resolveVaultRoot, VaultNotFoundError } from "@kibhq/core";

export async function serve() {
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
