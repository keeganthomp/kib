import { describe, expect, test } from "bun:test";
import { hash } from "./hash.js";

describe("hash", () => {
	test("returns a hex string", async () => {
		const h = await hash("hello world");
		expect(h).toMatch(/^[0-9a-f]+$/);
	});

	test("same input produces same hash", async () => {
		const h1 = await hash("test content");
		const h2 = await hash("test content");
		expect(h1).toBe(h2);
	});

	test("different input produces different hash", async () => {
		const h1 = await hash("content A");
		const h2 = await hash("content B");
		expect(h1).not.toBe(h2);
	});
});
