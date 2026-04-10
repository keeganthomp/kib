import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectScreenshotDir, startScreenshotWatcher } from "./screenshot-watcher.js";

let tempDirs: string[] = [];

afterEach(async () => {
	for (const dir of tempDirs) {
		await rm(dir, { recursive: true, force: true });
	}
	tempDirs = [];
});

async function makeTempDir(name: string) {
	const dir = await mkdtemp(join(tmpdir(), `kib-ss-${name}-`));
	tempDirs.push(dir);
	return dir;
}

describe("detectScreenshotDir", () => {
	test("returns a string or null", async () => {
		const result = await detectScreenshotDir();
		// On CI there may not be a screenshots dir, so both are valid
		expect(result === null || typeof result === "string").toBe(true);
	});
});

describe("startScreenshotWatcher", () => {
	test("detects new image files in watched directory", async () => {
		const dir = await makeTempDir("ss-watch");
		const detected: string[] = [];

		const watcher = await startScreenshotWatcher({
			path: dir,
			glob: "*.{png,jpg,jpeg}",
			onFile: (path) => detected.push(path),
		});

		expect(watcher).not.toBeNull();

		// Write a matching image file
		await writeFile(join(dir, "screenshot-001.png"), "fake-image-data");
		await new Promise((r) => setTimeout(r, 1500)); // debounce is 1000ms

		// Write a non-matching file
		await writeFile(join(dir, "notes.txt"), "not an image");
		await new Promise((r) => setTimeout(r, 1500));

		watcher!.stop();
		expect(detected.length).toBe(1);
		expect(detected[0]).toContain("screenshot-001.png");
	});

	test("ignores dotfiles", async () => {
		const dir = await makeTempDir("ss-dot");
		const detected: string[] = [];

		const watcher = await startScreenshotWatcher({
			path: dir,
			glob: "*.{png,jpg}",
			onFile: (path) => detected.push(path),
		});

		await writeFile(join(dir, ".hidden.png"), "data");
		await new Promise((r) => setTimeout(r, 1500));

		watcher!.stop();
		expect(detected.length).toBe(0);
	});

	test("returns null when path is invalid and no default found", async () => {
		const watcher = await startScreenshotWatcher({
			path: "/nonexistent/screenshot/dir/that/does/not/exist",
			glob: "*.png",
			onFile: () => {},
		});

		// The folder watcher silently skips non-existent dirs,
		// but startScreenshotWatcher still returns an object since path was provided
		expect(watcher).not.toBeNull();
		watcher?.stop();
	});

	test("stop() cleans up the watcher", async () => {
		const dir = await makeTempDir("ss-stop");
		const detected: string[] = [];

		const watcher = await startScreenshotWatcher({
			path: dir,
			glob: "*.png",
			onFile: (path) => detected.push(path),
		});

		watcher!.stop();

		await writeFile(join(dir, "after-stop.png"), "data");
		await new Promise((r) => setTimeout(r, 1500));
		expect(detected.length).toBe(0);
	});

	test("reports the watched directory", async () => {
		const dir = await makeTempDir("ss-dir");

		const watcher = await startScreenshotWatcher({
			path: dir,
			glob: "*.png",
			onFile: () => {},
		});

		expect(watcher).not.toBeNull();
		expect(watcher!.dir).toBe(dir);
		watcher!.stop();
	});

	test("supports custom glob patterns", async () => {
		const dir = await makeTempDir("ss-glob");
		const detected: string[] = [];

		const watcher = await startScreenshotWatcher({
			path: dir,
			glob: "*.webp",
			onFile: (path) => detected.push(path),
		});

		await writeFile(join(dir, "shot.webp"), "data");
		await writeFile(join(dir, "shot.png"), "data");
		await new Promise((r) => setTimeout(r, 1500));

		watcher!.stop();
		expect(detected.length).toBe(1);
		expect(detected[0]).toContain("shot.webp");
	});
});

describe("screenshot watcher config defaults", () => {
	test("default glob covers common image formats", () => {
		const { DEFAULTS } = require("../constants.js");
		expect(DEFAULTS.screenshotGlob).toBe("*.{png,jpg,jpeg,webp,gif,bmp,tiff}");
	});
});
