import * as readline from "node:readline";
import type { LLMProvider, Message } from "@kibhq/core";
import {
	createProvider,
	loadConfig,
	NoProviderError,
	resolveVaultRoot,
	VaultNotFoundError,
} from "@kibhq/core";
import * as log from "../ui/logger.js";
import { setupProvider } from "../ui/setup-provider.js";

export async function chat() {
	let root: string;
	try {
		root = resolveVaultRoot();
	} catch (err) {
		if (err instanceof VaultNotFoundError) {
			log.error(err.message);
			process.exit(1);
		}
		throw err;
	}

	const config = await loadConfig(root);

	// Create provider
	let provider: LLMProvider;
	try {
		provider = await createProvider(config.provider.default, config.provider.model);
	} catch (err) {
		if (err instanceof NoProviderError) {
			provider = await setupProvider(root);
		} else {
			log.error((err as Error).message);
			process.exit(1);
		}
	}

	const { queryVault } = await import("@kibhq/core");

	log.header("interactive session (type /help for commands)");

	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
		prompt: "  you: ",
	});

	const history: Message[] = [];

	rl.prompt();

	rl.on("line", async (line) => {
		const input = line.trim();

		if (!input) {
			rl.prompt();
			return;
		}

		// Handle slash commands
		if (input.startsWith("/")) {
			const cmd = input.slice(1).toLowerCase();
			if (cmd === "exit" || cmd === "quit" || cmd === "q") {
				console.log();
				log.dim("Session ended.");
				rl.close();
				process.exit(0);
			}
			if (cmd === "clear") {
				history.length = 0;
				log.dim("Conversation cleared.");
				rl.prompt();
				return;
			}
			if (cmd === "help") {
				console.log();
				log.dim("Commands:");
				log.dim("  /clear   — clear conversation history");
				log.dim("  /exit    — end the session");
				log.dim("  /help    — show this help");
				console.log();
				rl.prompt();
				return;
			}
			log.warn(`Unknown command: ${input}. Type /help for available commands.`);
			rl.prompt();
			return;
		}

		// Query the vault
		console.log();

		const thinkFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
		let frame = 0;
		let thinking = true;
		process.stdout.write(`  kib: ${thinkFrames[0]}`);
		const thinkTimer = setInterval(() => {
			frame = (frame + 1) % thinkFrames.length;
			process.stdout.write(`\r  kib: ${thinkFrames[frame]}`);
		}, 80);

		try {
			const result = await queryVault(root, input, provider, {
				history,
				onChunk: (text) => {
					if (thinking) {
						thinking = false;
						clearInterval(thinkTimer);
						process.stdout.write("\r  kib: ");
					}
					process.stdout.write(text);
				},
			});

			console.log("\n");

			// Update conversation history
			history.push({ role: "user", content: input });
			history.push({ role: "assistant", content: result.answer });

			// Keep history manageable (last 10 exchanges)
			while (history.length > 20) {
				history.shift();
			}
		} catch (err) {
			if (thinking) {
				thinking = false;
				clearInterval(thinkTimer);
				process.stdout.write("\r  kib: ");
			}
			console.log();
			log.error((err as Error).message);
		}

		rl.prompt();
	});

	rl.on("close", () => {
		process.exit(0);
	});
}
