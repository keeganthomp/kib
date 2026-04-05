import chalk from "chalk";

const PREFIX = chalk.bold.cyan("kib");

export function info(msg: string) {
	console.log(`  ${chalk.green("+")} ${msg}`);
}

export function success(msg: string) {
	console.log(`  ${chalk.green("✓")} ${msg}`);
}

export function warn(msg: string) {
	console.log(`  ${chalk.yellow("⚠")} ${msg}`);
}

export function error(msg: string) {
	console.error(`  ${chalk.red("✗")} ${msg}`);
}

export function header(msg: string) {
	console.log();
	console.log(`  ${chalk.bold("◆")} ${PREFIX} ${chalk.dim("—")} ${msg}`);
	console.log();
}

export function dim(msg: string) {
	console.log(`  ${chalk.dim(msg)}`);
}

export function blank() {
	console.log();
}

export function keyValue(key: string, value: string) {
	console.log(`  ${chalk.dim(key.padEnd(14))} ${value}`);
}
