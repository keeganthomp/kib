import { loadConfig, resolveVaultRoot, saveConfig, VaultNotFoundError } from "@kibhq/core";
import * as log from "../ui/logger.js";

export async function config(
	key?: string,
	value?: string,
	opts?: { list?: boolean; json?: boolean },
) {
	let root: string;
	try {
		root = resolveVaultRoot();
	} catch (err) {
		if (err instanceof VaultNotFoundError) {
			log.error(err.message);
			process.exit(1);
		}
		throw err;
	}

	const cfg = await loadConfig(root);

	// List all config
	if (opts?.list || (!key && !value)) {
		if (opts?.json) {
			console.log(JSON.stringify(cfg, null, 2));
			return;
		}
		log.header("configuration");
		printConfig(cfg, "");
		return;
	}

	// Get a value
	if (key && !value) {
		const val = getNestedValue(cfg, key);
		if (val === undefined) {
			log.error(`Unknown config key: ${key}`);
			process.exit(1);
		}
		if (opts?.json) {
			console.log(JSON.stringify({ [key]: val }, null, 2));
		} else {
			console.log(val);
		}
		return;
	}

	// Set a value
	if (key && value) {
		const updated = setNestedValue(cfg, key, parseValue(value));
		if (!updated) {
			log.error(`Unknown config key: ${key}`);
			process.exit(1);
		}
		await saveConfig(root, cfg);
		if (opts?.json) {
			console.log(JSON.stringify({ [key]: parseValue(value) }, null, 2));
		} else {
			log.success(`Set ${key} = ${value}`);
		}
	}
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
	const parts = path.split(".");
	let current: unknown = obj;
	for (const part of parts) {
		if (current == null || typeof current !== "object") return undefined;
		current = (current as Record<string, unknown>)[part];
	}
	return current;
}

function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): boolean {
	const parts = path.split(".");
	let current: unknown = obj;
	for (let i = 0; i < parts.length - 1; i++) {
		if (current == null || typeof current !== "object") return false;
		current = (current as Record<string, unknown>)[parts[i]!];
	}
	const lastKey = parts[parts.length - 1]!;
	if (
		current == null ||
		typeof current !== "object" ||
		!(lastKey in (current as Record<string, unknown>))
	) {
		return false;
	}
	(current as Record<string, unknown>)[lastKey] = value;
	return true;
}

function parseValue(val: string): unknown {
	if (val === "true") return true;
	if (val === "false") return false;
	const num = Number(val);
	if (!Number.isNaN(num) && val.trim() !== "") return num;
	return val;
}

function printConfig(obj: Record<string, unknown>, prefix: string) {
	for (const [key, val] of Object.entries(obj)) {
		const fullKey = prefix ? `${prefix}.${key}` : key;
		if (val != null && typeof val === "object" && !Array.isArray(val)) {
			printConfig(val, fullKey);
		} else {
			log.keyValue(fullKey, String(val));
		}
	}
}
