/**
 * Auto-compile scheduler.
 * Triggers compilation after N new ingests OR after T ms of idle.
 * Debounced: each new ingest resets the idle timer.
 */

export interface SchedulerOptions {
	/** Compile after this many new sources (default: 5) */
	threshold: number;
	/** Compile after this many ms of inactivity (default: 30 min) */
	delayMs: number;
	/** Callback to run compilation */
	onCompile: () => Promise<void>;
	/** Optional callback for logging */
	onLog?: (message: string) => void;
}

export class CompileScheduler {
	private ingestCount = 0;
	private timer: ReturnType<typeof setTimeout> | null = null;
	private compiling = false;
	private opts: SchedulerOptions;

	constructor(opts: SchedulerOptions) {
		this.opts = opts;
	}

	/** Notify the scheduler that a source was ingested. */
	recordIngest(): void {
		this.ingestCount++;
		this.opts.onLog?.(
			`Scheduler: ${this.ingestCount}/${this.opts.threshold} sources toward auto-compile`,
		);

		if (this.ingestCount >= this.opts.threshold) {
			this.triggerCompile("threshold reached");
			return;
		}

		// Reset idle timer
		this.resetTimer();
	}

	/** Get how many ingests since the last compile. */
	pendingCount(): number {
		return this.ingestCount;
	}

	/** Whether a compile is currently running. */
	isCompiling(): boolean {
		return this.compiling;
	}

	/** Cancel any pending timer and reset state. */
	stop(): void {
		this.clearTimer();
		this.ingestCount = 0;
		this.compiling = false;
	}

	private resetTimer(): void {
		this.clearTimer();
		if (this.opts.delayMs > 0 && this.ingestCount > 0) {
			this.timer = setTimeout(() => {
				this.triggerCompile("idle timeout");
			}, this.opts.delayMs);
		}
	}

	private clearTimer(): void {
		if (this.timer) {
			clearTimeout(this.timer);
			this.timer = null;
		}
	}

	private triggerCompile(reason: string): void {
		if (this.compiling) return;

		this.clearTimer();
		this.compiling = true;
		this.opts.onLog?.(`Auto-compile triggered: ${reason} (${this.ingestCount} new sources)`);

		this.opts
			.onCompile()
			.then(() => {
				this.opts.onLog?.("Auto-compile completed.");
			})
			.catch((err) => {
				this.opts.onLog?.(`Auto-compile failed: ${(err as Error).message}`);
			})
			.finally(() => {
				this.ingestCount = 0;
				this.compiling = false;
			});
	}
}
