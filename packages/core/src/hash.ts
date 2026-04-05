let h64: ((input: string) => bigint) | null = null;

async function init() {
	if (h64) return;
	const xxhash = await import("xxhash-wasm");
	const hasher = await xxhash.default();
	h64 = hasher.h64;
}

/**
 * Fast content hash using xxhash64.
 * Returns a hex string.
 */
export async function hash(content: string): Promise<string> {
	try {
		await init();
		return h64!(content).toString(16);
	} catch {
		// Fallback to Bun's built-in hasher
		const hasher = new Bun.CryptoHasher("sha256");
		hasher.update(content);
		return hasher.digest("hex").slice(0, 16);
	}
}
