import * as readline from "node:readline";
import chalk from "chalk";

const isTTY = process.stdin.isTTY;

/**
 * Prompt user to select from a list of options.
 * Returns the index of the selected option.
 */
export async function select(
	message: string,
	options: { label: string; hint?: string }[],
): Promise<number> {
	// Fallback for non-interactive (piped stdin)
	if (!isTTY) {
		return selectFallback(message, options);
	}

	let selected = 0;

	// Hide cursor
	process.stdout.write("\x1B[?25l");

	const render = () => {
		// Move cursor up to overwrite previous render
		const lines = options.length + 1;
		process.stdout.write(`\x1B[${lines}A`);
		printOptions(message, options, selected);
	};

	// Initial render
	printOptions(message, options, selected);

	return new Promise<number>((resolve) => {
		process.stdin.setRawMode(true);
		process.stdin.resume();

		const onKeypress = (data: Buffer) => {
			const key = data.toString();

			if (key === "\x1B[A" || key === "k") {
				selected = (selected - 1 + options.length) % options.length;
				render();
			} else if (key === "\x1B[B" || key === "j") {
				selected = (selected + 1) % options.length;
				render();
			} else if (key === "\r" || key === "\n") {
				process.stdin.setRawMode(false);
				process.stdin.removeListener("data", onKeypress);
				process.stdin.pause();
				process.stdout.write("\x1B[?25h");
				resolve(selected);
			} else if (key === "\x03") {
				process.stdout.write("\x1B[?25h");
				process.exit(0);
			}
		};

		process.stdin.on("data", onKeypress);
	});
}

function printOptions(
	message: string,
	options: { label: string; hint?: string }[],
	selected: number,
) {
	console.log(`  ${chalk.bold("◆")} ${message}`);
	for (let i = 0; i < options.length; i++) {
		const opt = options[i]!;
		const cursor = i === selected ? chalk.cyan("●") : chalk.dim("○");
		const label = i === selected ? chalk.cyan(opt.label) : opt.label;
		const hint = opt.hint ? chalk.dim(` — ${opt.hint}`) : "";
		console.log(`    ${cursor} ${label}${hint}`);
	}
}

/** Simple numbered fallback for non-TTY */
function selectFallback(
	message: string,
	options: { label: string; hint?: string }[],
): Promise<number> {
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	});

	console.log(`  ${chalk.bold("◆")} ${message}`);
	for (let i = 0; i < options.length; i++) {
		const opt = options[i]!;
		const hint = opt.hint ? chalk.dim(` — ${opt.hint}`) : "";
		console.log(`    ${chalk.cyan(`${i + 1})`)} ${opt.label}${hint}`);
	}

	return new Promise<number>((resolve) => {
		rl.question(`  ${chalk.bold("◆")} Enter number [1]: `, (answer) => {
			rl.close();
			const num = Number.parseInt(answer.trim() || "1", 10);
			resolve(Math.max(0, Math.min(num - 1, options.length - 1)));
		});
	});
}

/**
 * Prompt user for text input. Input is masked if `mask` is true.
 */
export async function input(
	message: string,
	opts?: { mask?: boolean; placeholder?: string },
): Promise<string> {
	const prefix = `  ${chalk.bold("◆")} ${message} `;

	if (opts?.mask && isTTY) {
		return maskedInput(prefix);
	}

	// Standard readline input (works with or without TTY)
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	});

	return new Promise<string>((resolve) => {
		rl.question(prefix, (answer) => {
			rl.close();
			resolve(answer.trim());
		});
	});
}

function maskedInput(prefix: string): Promise<string> {
	process.stdout.write(prefix);
	process.stdin.setRawMode(true);
	process.stdin.resume();

	let value = "";

	return new Promise<string>((resolve) => {
		const onKeypress = (data: Buffer) => {
			const key = data.toString();

			if (key === "\r" || key === "\n") {
				process.stdin.setRawMode(false);
				process.stdin.removeListener("data", onKeypress);
				process.stdin.pause();
				console.log();
				resolve(value);
			} else if (key === "\x7F" || key === "\b") {
				if (value.length > 0) {
					value = value.slice(0, -1);
					process.stdout.write("\b \b");
				}
			} else if (key === "\x03") {
				process.exit(0);
			} else if (key.charCodeAt(0) >= 32) {
				value += key;
				process.stdout.write("•");
			}
		};

		process.stdin.on("data", onKeypress);
	});
}
