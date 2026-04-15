import { resolveVaultRoot, VaultNotFoundError } from "@kibhq/core";
import chalk from "chalk";

export async function ui(opts: { port?: string; open?: boolean }) {
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

	// Load saved API keys
	const { loadCredentials } = await import("../ui/setup-provider.js");
	loadCredentials();

	const port = Number.parseInt(opts.port ?? "4848", 10);

	const { startServer } = await import("@kibhq/dashboard");
	const { url } = await startServer(root, port);

	console.log(chalk.bold(`\n  kib dashboard running at ${chalk.cyan(url)}\n`));

	// Auto-open browser unless --no-open
	if (opts.open !== false) {
		try {
			Bun.spawn(["open", url]);
		} catch {
			// Non-macOS or open not available — that's fine
		}
	}

	// Keep process alive
	await new Promise(() => {});
}
