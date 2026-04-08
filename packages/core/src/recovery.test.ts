import { afterEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectIssues, repairVault } from "./recovery.js";
import { initVault } from "./vault.js";

let tempDir: string;

afterEach(async () => {
	if (tempDir) {
		await rm(tempDir, { recursive: true, force: true });
	}
});

async function makeTempVault() {
	tempDir = await mkdtemp(join(tmpdir(), "kib-recovery-test-"));
	await initVault(tempDir, { name: "recovery-test" });
	return tempDir;
}

describe("detectIssues", () => {
	test("returns empty for healthy vault", async () => {
		const dir = await makeTempVault();
		const issues = await detectIssues(dir);
		expect(issues).toEqual([]);
	});

	test("detects tmp files in .kb/", async () => {
		const dir = await makeTempVault();
		await writeFile(join(dir, ".kb", "manifest.json.tmp"), "partial data");

		const issues = await detectIssues(dir);
		expect(issues.some((i) => i.type === "tmp_file")).toBe(true);
	});

	test("detects tmp files in wiki/", async () => {
		const dir = await makeTempVault();
		await writeFile(join(dir, "wiki", "concepts", "test.md.tmp"), "partial");

		const issues = await detectIssues(dir);
		expect(issues.some((i) => i.type === "tmp_file")).toBe(true);
	});

	test("detects tmp files in raw/", async () => {
		const dir = await makeTempVault();
		await writeFile(join(dir, "raw", "articles", "test.md.tmp"), "partial");

		const issues = await detectIssues(dir);
		expect(issues.some((i) => i.type === "tmp_file")).toBe(true);
	});

	test("detects missing manifest with tmp present", async () => {
		const dir = await makeTempVault();
		const manifestPath = join(dir, ".kb", "manifest.json");
		const content = await readFile(manifestPath, "utf-8");

		// Simulate interrupted write: tmp exists but manifest is gone
		await writeFile(`${manifestPath}.tmp`, content);
		await rm(manifestPath);

		const issues = await detectIssues(dir);
		expect(issues.some((i) => i.type === "missing_manifest")).toBe(true);
	});

	test("detects corrupt manifest", async () => {
		const dir = await makeTempVault();
		const manifestPath = join(dir, ".kb", "manifest.json");
		await writeFile(manifestPath, "not valid json {{{");

		const issues = await detectIssues(dir);
		expect(issues.some((i) => i.type === "corrupt_manifest")).toBe(true);
	});

	test("detects stale lock from dead process", async () => {
		const dir = await makeTempVault();
		await writeFile(
			join(dir, ".kb", "vault.lock"),
			JSON.stringify({ pid: 999999999, timestamp: new Date().toISOString(), operation: "dead" }),
		);

		const issues = await detectIssues(dir);
		expect(issues.some((i) => i.type === "stale_lock")).toBe(true);
	});
});

describe("repairVault", () => {
	test("removes stale tmp files", async () => {
		const dir = await makeTempVault();
		const tmpPath = join(dir, ".kb", "config.toml.tmp");
		await writeFile(tmpPath, "partial");

		const issues = await repairVault(dir);
		const tmpIssue = issues.find((i) => i.type === "tmp_file");
		expect(tmpIssue?.repaired).toBe(true);
		expect(existsSync(tmpPath)).toBe(false);
	});

	test("promotes tmp to manifest when manifest is missing", async () => {
		const dir = await makeTempVault();
		const manifestPath = join(dir, ".kb", "manifest.json");
		const content = await readFile(manifestPath, "utf-8");

		await writeFile(`${manifestPath}.tmp`, content);
		await rm(manifestPath);

		const issues = await repairVault(dir);
		const missingIssue = issues.find((i) => i.type === "missing_manifest");
		expect(missingIssue?.repaired).toBe(true);
		expect(existsSync(manifestPath)).toBe(true);

		const restored = await readFile(manifestPath, "utf-8");
		expect(JSON.parse(restored)).toEqual(JSON.parse(content));
	});

	test("removes stale lock", async () => {
		const dir = await makeTempVault();
		const lockPath = join(dir, ".kb", "vault.lock");
		await writeFile(
			lockPath,
			JSON.stringify({ pid: 999999999, timestamp: new Date().toISOString(), operation: "dead" }),
		);

		const issues = await repairVault(dir);
		const lockIssue = issues.find((i) => i.type === "stale_lock");
		expect(lockIssue?.repaired).toBe(true);
		expect(existsSync(lockPath)).toBe(false);
	});

	test("restores corrupt manifest from backup", async () => {
		const dir = await makeTempVault();
		const manifestPath = join(dir, ".kb", "manifest.json");
		const goodManifest = await readFile(manifestPath, "utf-8");

		// Create a backup
		const backupsDir = join(dir, ".kb", "backups");
		await mkdir(backupsDir, { recursive: true });
		await writeFile(join(backupsDir, "manifest-2024-01-01T00-00-00-000Z.json"), goodManifest);

		// Corrupt the manifest
		await writeFile(manifestPath, "corrupted {{{");

		const issues = await repairVault(dir);
		const corruptIssue = issues.find((i) => i.type === "corrupt_manifest");
		expect(corruptIssue?.repaired).toBe(true);

		const restored = await readFile(manifestPath, "utf-8");
		expect(JSON.parse(restored)).toEqual(JSON.parse(goodManifest));
	});

	test("returns unrepaired for corrupt manifest with no backup", async () => {
		const dir = await makeTempVault();
		const manifestPath = join(dir, ".kb", "manifest.json");
		await writeFile(manifestPath, "corrupted {{{");

		const issues = await repairVault(dir);
		const corruptIssue = issues.find((i) => i.type === "corrupt_manifest");
		expect(corruptIssue?.repaired).toBe(false);
	});
});
