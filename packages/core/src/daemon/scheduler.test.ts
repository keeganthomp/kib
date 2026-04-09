import { afterEach, describe, expect, test } from "bun:test";
import { CompileScheduler } from "./scheduler.js";

describe("CompileScheduler", () => {
	let scheduler: CompileScheduler;

	afterEach(() => {
		scheduler?.stop();
	});

	test("triggers compile when threshold is reached", async () => {
		let compiled = false;
		scheduler = new CompileScheduler({
			threshold: 3,
			delayMs: 60_000, // high so idle timer doesn't fire
			onCompile: async () => {
				compiled = true;
			},
		});

		scheduler.recordIngest();
		scheduler.recordIngest();
		expect(compiled).toBe(false);
		expect(scheduler.pendingCount()).toBe(2);

		scheduler.recordIngest(); // threshold hit
		// onCompile is async, give it a tick
		await new Promise((r) => setTimeout(r, 10));
		expect(compiled).toBe(true);
	});

	test("triggers compile after idle timeout", async () => {
		let compiled = false;
		scheduler = new CompileScheduler({
			threshold: 100, // high so threshold doesn't trigger
			delayMs: 50, // short for testing
			onCompile: async () => {
				compiled = true;
			},
		});

		scheduler.recordIngest();
		expect(compiled).toBe(false);

		// Wait for idle timer
		await new Promise((r) => setTimeout(r, 100));
		expect(compiled).toBe(true);
	});

	test("resets idle timer on each ingest", async () => {
		let compileCount = 0;
		scheduler = new CompileScheduler({
			threshold: 100,
			delayMs: 80,
			onCompile: async () => {
				compileCount++;
			},
		});

		scheduler.recordIngest();
		await new Promise((r) => setTimeout(r, 40));
		scheduler.recordIngest(); // resets timer
		await new Promise((r) => setTimeout(r, 40));
		// 80ms total but timer was reset at 40ms, so only 40ms since last ingest
		expect(compileCount).toBe(0);

		await new Promise((r) => setTimeout(r, 60)); // now 100ms since last ingest > 80ms delay
		expect(compileCount).toBe(1);
	});

	test("resets ingest count after compile completes", async () => {
		scheduler = new CompileScheduler({
			threshold: 2,
			delayMs: 0,
			onCompile: async () => {},
		});

		scheduler.recordIngest();
		scheduler.recordIngest(); // triggers
		await new Promise((r) => setTimeout(r, 10));
		expect(scheduler.pendingCount()).toBe(0);
	});

	test("does not trigger concurrent compiles", async () => {
		let concurrent = 0;
		let maxConcurrent = 0;
		scheduler = new CompileScheduler({
			threshold: 1,
			delayMs: 0,
			onCompile: async () => {
				concurrent++;
				maxConcurrent = Math.max(maxConcurrent, concurrent);
				await new Promise((r) => setTimeout(r, 50));
				concurrent--;
			},
		});

		scheduler.recordIngest(); // triggers compile
		scheduler.recordIngest(); // should be ignored (already compiling)
		await new Promise((r) => setTimeout(r, 100));
		expect(maxConcurrent).toBe(1);
	});

	test("stop() cancels pending timer", async () => {
		let compiled = false;
		scheduler = new CompileScheduler({
			threshold: 100,
			delayMs: 30,
			onCompile: async () => {
				compiled = true;
			},
		});

		scheduler.recordIngest();
		scheduler.stop();
		await new Promise((r) => setTimeout(r, 60));
		expect(compiled).toBe(false);
	});

	test("does not trigger when delayMs is 0 and threshold not met", async () => {
		let compiled = false;
		scheduler = new CompileScheduler({
			threshold: 5,
			delayMs: 0,
			onCompile: async () => {
				compiled = true;
			},
		});

		scheduler.recordIngest();
		await new Promise((r) => setTimeout(r, 20));
		expect(compiled).toBe(false);
	});

	test("handles compile failure gracefully — resets state for next trigger", async () => {
		let callCount = 0;
		scheduler = new CompileScheduler({
			threshold: 1,
			delayMs: 0,
			onCompile: async () => {
				callCount++;
				if (callCount === 1) throw new Error("LLM provider unavailable");
			},
		});

		scheduler.recordIngest(); // triggers, will fail
		await new Promise((r) => setTimeout(r, 20));
		expect(callCount).toBe(1);
		expect(scheduler.isCompiling()).toBe(false);
		expect(scheduler.pendingCount()).toBe(0);

		// Second compile should still work
		scheduler.recordIngest();
		await new Promise((r) => setTimeout(r, 20));
		expect(callCount).toBe(2);
	});

	test("logs threshold progress via onLog callback", async () => {
		const logs: string[] = [];
		scheduler = new CompileScheduler({
			threshold: 3,
			delayMs: 60_000,
			onCompile: async () => {},
			onLog: (msg) => logs.push(msg),
		});

		scheduler.recordIngest();
		scheduler.recordIngest();
		expect(logs.length).toBe(2);
		expect(logs[0]).toContain("1/3");
		expect(logs[1]).toContain("2/3");
	});
});
