import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { matchGlob, scanFolder, startFolderWatchers } from "./folder-watcher.js";

let tempDirs: string[] = [];

afterEach(async () => {
	for (const dir of tempDirs) {
		await rm(dir, { recursive: true, force: true });
	}
	tempDirs = [];
});

async function makeTempDir(name: string) {
	const dir = await mkdtemp(join(tmpdir(), `kib-fw-${name}-`));
	tempDirs.push(dir);
	return dir;
}

describe("matchGlob", () => {
	test("matches *.pdf", () => {
		expect(matchGlob("paper.pdf", "*.pdf")).toBe(true);
		expect(matchGlob("paper.PDF", "*.pdf")).toBe(true); // case insensitive
		expect(matchGlob("paper.txt", "*.pdf")).toBe(false);
	});

	test("matches *.{ext1,ext2}", () => {
		expect(matchGlob("file.md", "*.{md,txt}")).toBe(true);
		expect(matchGlob("file.txt", "*.{md,txt}")).toBe(true);
		expect(matchGlob("file.pdf", "*.{md,txt}")).toBe(false);
	});

	test("matches * (wildcard all)", () => {
		expect(matchGlob("anything.xyz", "*")).toBe(true);
		expect(matchGlob("file", "*")).toBe(true);
	});

	test("matches exact filename", () => {
		expect(matchGlob("notes.md", "notes.md")).toBe(true);
		expect(matchGlob("other.md", "notes.md")).toBe(false);
	});
});

describe("scanFolder", () => {
	test("finds matching files in a directory", async () => {
		const dir = await makeTempDir("scan");
		await writeFile(join(dir, "a.pdf"), "");
		await writeFile(join(dir, "b.pdf"), "");
		await writeFile(join(dir, "c.txt"), "");
		await writeFile(join(dir, ".hidden.pdf"), "");

		const matches = await scanFolder({ path: dir, glob: "*.pdf", recursive: false });
		expect(matches.length).toBe(2);
		expect(matches.every((m) => m.endsWith(".pdf"))).toBe(true);
	});

	test("scans recursively when enabled", async () => {
		const dir = await makeTempDir("scan-rec");
		const sub = join(dir, "sub");
		await mkdir(sub);
		await writeFile(join(dir, "a.md"), "");
		await writeFile(join(sub, "b.md"), "");

		const matches = await scanFolder({ path: dir, glob: "*.md", recursive: true });
		expect(matches.length).toBe(2);
	});

	test("returns empty for non-existent directory", async () => {
		const matches = await scanFolder({ path: "/nonexistent/path", glob: "*", recursive: false });
		expect(matches).toEqual([]);
	});
});

describe("startFolderWatchers", () => {
	test("detects new files matching glob", async () => {
		const dir = await makeTempDir("watch");
		const detected: string[] = [];

		const watcher = startFolderWatchers({
			folders: [{ path: dir, glob: "*.md", recursive: false }],
			onFile: (path) => detected.push(path),
			debounceMs: 50,
		});

		// Write a matching file
		await writeFile(join(dir, "test.md"), "content");
		await new Promise((r) => setTimeout(r, 200));

		// Write a non-matching file
		await writeFile(join(dir, "test.pdf"), "content");
		await new Promise((r) => setTimeout(r, 200));

		watcher.stop();
		expect(detected.length).toBe(1);
		expect(detected[0]).toContain("test.md");
	});

	test("ignores dotfiles", async () => {
		const dir = await makeTempDir("dotfiles");
		const detected: string[] = [];

		const watcher = startFolderWatchers({
			folders: [{ path: dir, glob: "*", recursive: false }],
			onFile: (path) => detected.push(path),
			debounceMs: 50,
		});

		await writeFile(join(dir, ".hidden"), "content");
		await new Promise((r) => setTimeout(r, 200));

		watcher.stop();
		expect(detected.length).toBe(0);
	});

	test("does not duplicate events for same file", async () => {
		const dir = await makeTempDir("dedup");
		const detected: string[] = [];

		const watcher = startFolderWatchers({
			folders: [{ path: dir, glob: "*", recursive: false }],
			onFile: (path) => detected.push(path),
			debounceMs: 50,
		});

		await writeFile(join(dir, "test.txt"), "v1");
		await new Promise((r) => setTimeout(r, 200));
		// Re-write same file
		await writeFile(join(dir, "test.txt"), "v2");
		await new Promise((r) => setTimeout(r, 200));

		watcher.stop();
		expect(detected.length).toBe(1);
	});

	test("watches multiple folders", async () => {
		const dir1 = await makeTempDir("multi1");
		const dir2 = await makeTempDir("multi2");
		const detected: string[] = [];

		const watcher = startFolderWatchers({
			folders: [
				{ path: dir1, glob: "*.md", recursive: false },
				{ path: dir2, glob: "*.pdf", recursive: false },
			],
			onFile: (path) => detected.push(path),
			debounceMs: 50,
		});

		await writeFile(join(dir1, "notes.md"), "content");
		await writeFile(join(dir2, "paper.pdf"), "content");
		await new Promise((r) => setTimeout(r, 300));

		watcher.stop();
		expect(detected.length).toBe(2);
	});

	test("stop() cleans up all watchers", async () => {
		const dir = await makeTempDir("stop");
		const detected: string[] = [];

		const watcher = startFolderWatchers({
			folders: [{ path: dir, glob: "*", recursive: false }],
			onFile: (path) => detected.push(path),
			debounceMs: 50,
		});

		watcher.stop();

		await writeFile(join(dir, "after-stop.txt"), "content");
		await new Promise((r) => setTimeout(r, 200));
		expect(detected.length).toBe(0);
	});
});
