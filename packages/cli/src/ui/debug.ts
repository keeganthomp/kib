import chalk from "chalk";

let _verbose = false;

export function setVerbose(enabled: boolean) {
	_verbose = enabled;
}

export function isVerbose(): boolean {
	return _verbose;
}

export function debug(msg: string) {
	if (!_verbose) return;
	console.error(`  ${chalk.dim.magenta("dbg")} ${chalk.dim(msg)}`);
}

export function debugTime(label: string): () => void {
	if (!_verbose) return () => {};
	const start = performance.now();
	return () => {
		const elapsed = Math.round(performance.now() - start);
		debug(`${label} (${elapsed}ms)`);
	};
}
