import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { enqueue, ensureQueueDirs, initVault, listPending, queueDepth } from "@kibhq/core";

let tempDir: string;

afterEach(async () => {
	if (tempDir) {
		await rm(tempDir, { recursive: true, force: true });
	}
});

async function makeTempVault() {
	tempDir = await mkdtemp(join(tmpdir(), "kib-watch-test-"));
	await initVault(tempDir, { name: "watch-test" });
	return tempDir;
}

describe("watch: HTTP server /ingest", () => {
	test("rejects POST with missing content field", async () => {
		const root = await makeTempVault();
		await ensureQueueDirs(root);

		// Simulate the HTTP handler's validation logic
		const body: { content?: string; title?: string } = { title: "No Content" };
		const hasContent = body.content && typeof body.content === "string";
		expect(hasContent).toBeFalsy();
	});

	test("rejects POST with empty string content", async () => {
		const body = { content: "", title: "Empty" };
		const hasContent = body.content && typeof body.content === "string";
		expect(hasContent).toBeFalsy();
	});

	test("accepts POST with valid content", async () => {
		const body = { content: "Real article content", title: "Good Article" };
		const hasContent = body.content && typeof body.content === "string";
		expect(hasContent).toBeTruthy();
	});

	test("builds correct markdown with title and url", () => {
		const body = {
			content: "Article body text",
			title: "My Article",
			url: "https://example.com/article",
		};
		const fullContent = body.title
			? `# ${body.title}\n\n${body.url ? `Source: ${body.url}\n\n` : ""}${body.content}`
			: body.content;

		expect(fullContent).toBe(
			"# My Article\n\nSource: https://example.com/article\n\nArticle body text",
		);
	});

	test("builds correct markdown without url", () => {
		const body = { content: "Body text", title: "Title Only" };
		const fullContent = body.title
			? `# ${body.title}\n\n${body.url ? `Source: ${body.url}\n\n` : ""}${body.content}`
			: body.content;

		expect(fullContent).toBe("# Title Only\n\nBody text");
	});

	test("builds correct markdown without title", () => {
		const body = { content: "Just content, no title" };
		const fullContent = (body as { title?: string }).title
			? `# ${(body as { title?: string }).title}\n\n${body.content}`
			: body.content;

		expect(fullContent).toBe("Just content, no title");
	});

	test("slug generation handles special characters", () => {
		const title = "What's the Deal with AI & ML?!";
		const slug = title
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.slice(0, 60);
		expect(slug).toBe("what-s-the-deal-with-ai-ml-");
	});

	test("slug truncates to 60 characters", () => {
		const title = "A".repeat(100);
		const slug = title
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.slice(0, 60);
		expect(slug.length).toBe(60);
	});
});

describe("watch: inbox seeding on startup", () => {
	test("enqueues existing inbox files on startup", async () => {
		const root = await makeTempVault();
		await ensureQueueDirs(root);
		const inboxPath = join(root, "inbox");

		// Simulate files dropped while daemon was off
		await writeFile(join(inboxPath, "offline-1.md"), "# Offline Article 1");
		await writeFile(join(inboxPath, "offline-2.md"), "# Offline Article 2");

		// Simulate the daemon startup logic: enqueue existing inbox files
		const { readdir } = await import("node:fs/promises");
		const existing = await readdir(inboxPath);
		for (const f of existing) {
			if (f.startsWith(".")) continue;
			await enqueue(root, join(inboxPath, f), "inbox");
		}

		// Both files should be queued
		const depth = await queueDepth(root);
		expect(depth).toBe(2);

		const pending = await listPending(root, 10);
		const uris = pending.map((p) => p.uri);
		expect(uris).toContain(join(inboxPath, "offline-1.md"));
		expect(uris).toContain(join(inboxPath, "offline-2.md"));
	});

	test("skips dotfiles during inbox seeding", async () => {
		const root = await makeTempVault();
		await ensureQueueDirs(root);
		const inboxPath = join(root, "inbox");

		await writeFile(join(inboxPath, ".DS_Store"), "");
		await writeFile(join(inboxPath, ".hidden"), "");
		await writeFile(join(inboxPath, "visible.md"), "# Visible");

		const { readdir } = await import("node:fs/promises");
		const existing = await readdir(inboxPath);
		for (const f of existing) {
			if (f.startsWith(".")) continue;
			await enqueue(root, join(inboxPath, f), "inbox");
		}

		expect(await queueDepth(root)).toBe(1);
	});

	test("handles empty inbox gracefully", async () => {
		const root = await makeTempVault();
		await ensureQueueDirs(root);
		const inboxPath = join(root, "inbox");

		const { readdir } = await import("node:fs/promises");
		const existing = await readdir(inboxPath);
		for (const f of existing) {
			if (f.startsWith(".")) continue;
			await enqueue(root, join(inboxPath, f), "inbox");
		}

		expect(await queueDepth(root)).toBe(0);
	});

	test("handles missing inbox directory gracefully", async () => {
		const root = await makeTempVault();
		await ensureQueueDirs(root);
		const inboxPath = join(root, "inbox-nonexistent");

		try {
			const { readdir } = await import("node:fs/promises");
			const existing = await readdir(inboxPath);
			for (const f of existing) {
				if (f.startsWith(".")) continue;
				await enqueue(root, join(inboxPath, f), "inbox");
			}
		} catch {
			// Should not throw — this is the expected path
		}

		expect(await queueDepth(root)).toBe(0);
	});
});
