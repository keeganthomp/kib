import { afterEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initVault } from "../vault.js";
import { getDaemonStatus, readPid, removePid, writePid } from "./pid.js";

let tempDir: string;

afterEach(async () => {
	if (tempDir) {
		await rm(tempDir, { recursive: true, force: true });
	}
});

async function makeTempVault() {
	tempDir = await mkdtemp(join(tmpdir(), "kib-pid-test-"));
	await initVault(tempDir, { name: "pid-test" });
	return tempDir;
}

describe("writePid / readPid", () => {
	test("writes and reads PID info", async () => {
		const root = await makeTempVault();
		await writePid(root);

		const info = await readPid(root);
		expect(info).not.toBeNull();
		expect(info!.pid).toBe(process.pid);
		expect(info!.root).toBe(root);
		expect(typeof info!.startedAt).toBe("string");
	});

	test("readPid returns null when no PID file exists", async () => {
		const root = await makeTempVault();
		expect(await readPid(root)).toBeNull();
	});
});

describe("removePid", () => {
	test("removes the PID file", async () => {
		const root = await makeTempVault();
		await writePid(root);
		const path = join(root, ".kb", "watch.pid");
		expect(existsSync(path)).toBe(true);

		await removePid(root);
		expect(existsSync(path)).toBe(false);
	});

	test("does not throw when no PID file exists", async () => {
		const root = await makeTempVault();
		await removePid(root); // should not throw
	});
});

describe("getDaemonStatus", () => {
	test("returns PID info for live process (current process)", async () => {
		const root = await makeTempVault();
		await writePid(root);

		const status = await getDaemonStatus(root);
		expect(status).not.toBeNull();
		expect(status!.pid).toBe(process.pid);
	});

	test("returns null and cleans up stale PID file", async () => {
		const root = await makeTempVault();
		const pidPath = join(root, ".kb", "watch.pid");
		await writeFile(
			pidPath,
			JSON.stringify({
				pid: 999999999,
				startedAt: new Date().toISOString(),
				root,
			}),
		);

		const status = await getDaemonStatus(root);
		expect(status).toBeNull();
		// Stale PID file should be cleaned up
		expect(existsSync(pidPath)).toBe(false);
	});

	test("returns null when no PID file", async () => {
		const root = await makeTempVault();
		expect(await getDaemonStatus(root)).toBeNull();
	});
});
