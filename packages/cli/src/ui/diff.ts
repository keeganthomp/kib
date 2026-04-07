import chalk from "chalk";

/**
 * Generate a colored unified diff between two strings.
 * Returns formatted lines ready for console output.
 */
export function coloredDiff(oldText: string, newText: string, path: string): string {
	const oldLines = oldText.split("\n");
	const newLines = newText.split("\n");

	const hunks = computeHunks(oldLines, newLines);
	if (hunks.length === 0) return "";

	const lines: string[] = [chalk.bold(`  --- a/${path}`), chalk.bold(`  +++ b/${path}`)];

	for (const hunk of hunks) {
		lines.push(
			chalk.cyan(`  @@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@`),
		);
		for (const line of hunk.lines) {
			if (line.startsWith("+")) {
				lines.push(chalk.green(`  ${line}`));
			} else if (line.startsWith("-")) {
				lines.push(chalk.red(`  ${line}`));
			} else {
				lines.push(chalk.dim(`  ${line}`));
			}
		}
	}

	return lines.join("\n");
}

interface Hunk {
	oldStart: number;
	oldCount: number;
	newStart: number;
	newCount: number;
	lines: string[];
}

/**
 * Simple LCS-based diff producing unified diff hunks with context.
 */
function computeHunks(oldLines: string[], newLines: string[], context = 3): Hunk[] {
	// Compute LCS table
	const m = oldLines.length;
	const n = newLines.length;
	const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

	for (let i = 1; i <= m; i++) {
		for (let j = 1; j <= n; j++) {
			if (oldLines[i - 1] === newLines[j - 1]) {
				dp[i]![j] = dp[i - 1]![j - 1]! + 1;
			} else {
				dp[i]![j] = Math.max(dp[i - 1]![j]!, dp[i]![j - 1]!);
			}
		}
	}

	// Backtrack to find edit script
	type Edit = { type: " " | "+" | "-"; line: string; oldIdx: number; newIdx: number };
	const edits: Edit[] = [];
	let i = m;
	let j = n;

	while (i > 0 || j > 0) {
		if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
			edits.unshift({ type: " ", line: oldLines[i - 1]!, oldIdx: i, newIdx: j });
			i--;
			j--;
		} else if (j > 0 && (i === 0 || dp[i]![j - 1]! >= dp[i - 1]![j]!)) {
			edits.unshift({ type: "+", line: newLines[j - 1]!, oldIdx: i, newIdx: j });
			j--;
		} else {
			edits.unshift({ type: "-", line: oldLines[i - 1]!, oldIdx: i, newIdx: j });
			i--;
		}
	}

	// Group edits into hunks with context
	const changes = edits.map((e, idx) => ({ ...e, idx })).filter((e) => e.type !== " ");
	if (changes.length === 0) return [];

	const hunks: Hunk[] = [];
	let hunkStart = 0;

	while (hunkStart < changes.length) {
		// Find the range of changes in this hunk
		let hunkEnd = hunkStart;
		while (
			hunkEnd + 1 < changes.length &&
			changes[hunkEnd + 1]!.idx - changes[hunkEnd]!.idx <= context * 2 + 1
		) {
			hunkEnd++;
		}

		const firstChange = changes[hunkStart]!;
		const lastChange = changes[hunkEnd]!;

		const startIdx = Math.max(0, firstChange.idx - context);
		const endIdx = Math.min(edits.length - 1, lastChange.idx + context);

		const hunkEdits = edits.slice(startIdx, endIdx + 1);

		// Calculate old/new line ranges
		let oldStart = 0;
		let oldCount = 0;
		let newStart = 0;
		let newCount = 0;
		let foundFirst = false;

		for (const edit of hunkEdits) {
			if (!foundFirst) {
				oldStart = edit.type === "+" ? edit.oldIdx + 1 : edit.oldIdx;
				newStart = edit.type === "-" ? edit.newIdx + 1 : edit.newIdx;
				foundFirst = true;
			}
			if (edit.type !== "+") oldCount++;
			if (edit.type !== "-") newCount++;
		}

		hunks.push({
			oldStart: oldStart || 1,
			oldCount,
			newStart: newStart || 1,
			newCount,
			lines: hunkEdits.map((e) => `${e.type}${e.line}`),
		});

		hunkStart = hunkEnd + 1;
	}

	return hunks;
}
