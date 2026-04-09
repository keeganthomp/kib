import { afterEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initVault } from "../vault.js";
import { appendWatchLog } from "./log.js";

let tempDir: string;

afterEach(async () => {
	if (tempDir) {
		await rm(tempDir, { recursive: true, force: true });
	}
});

async function makeTempVault() {
	tempDir = await mkdtemp(join(tmpdir(), "kib-log-test-"));
	await initVault(tempDir, { name: "log-test" });
	return tempDir;
}

describe("appendWatchLog", () => {
	test("creates log file and appends timestamped line", async () => {
		const root = await makeTempVault();
		await appendWatchLog(root, "info", "test message");

		const logPath = join(root, ".kb", "logs", "watch.log");
		expect(existsSync(logPath)).toBe(true);

		const content = await readFile(logPath, "utf-8");
		expect(content).toContain("[INFO]");
		expect(content).toContain("test message");
		expect(content).toMatch(/^\d{4}-\d{2}-\d{2}T/); // ISO timestamp
	});

	test("appends multiple entries", async () => {
		const root = await makeTempVault();
		await appendWatchLog(root, "info", "first");
		await appendWatchLog(root, "warn", "second");
		await appendWatchLog(root, "error", "third");

		const logPath = join(root, ".kb", "logs", "watch.log");
		const content = await readFile(logPath, "utf-8");
		const lines = content.trim().split("\n");
		expect(lines.length).toBe(3);
		expect(lines[0]).toContain("[INFO] first");
		expect(lines[1]).toContain("[WARN] second");
		expect(lines[2]).toContain("[ERROR] third");
	});

	test("rotates log when exceeding max size", async () => {
		const root = await makeTempVault();
		const smallMax = 200; // bytes

		// Write enough to exceed limit
		for (let i = 0; i < 10; i++) {
			await appendWatchLog(root, "info", `message number ${i} with padding`, smallMax);
		}

		const rotatedPath = join(root, ".kb", "logs", "watch.log.1");
		expect(existsSync(rotatedPath)).toBe(true);
	});

	test("performance: 1000 log writes in under 2 seconds", async () => {
		const root = await makeTempVault();
		const start = performance.now();

		for (let i = 0; i < 1000; i++) {
			await appendWatchLog(root, "info", `perf test line ${i}`);
		}

		const elapsed = performance.now() - start;
		expect(elapsed).toBeLessThan(2000);
	});
});
