import ora from "ora";

export function createSpinner(text: string) {
	return ora({
		text: `  ${text}`,
		indent: 0,
		spinner: "dots",
	});
}
