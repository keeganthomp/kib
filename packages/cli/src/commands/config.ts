import {
	VaultNotFoundError,
	loadConfig,
	resolveVaultRoot,
	saveConfig,
} from "@kib/core";
import * as log from "../ui/logger.js";

export async function config(key?: string, value?: string, opts?: { list?: boolean }) {
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
		console.log(val);
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
		log.success(`Set ${key} = ${value}`);
	}
}

function getNestedValue(obj: any, path: string): unknown {
	const parts = path.split(".");
	let current = obj;
	for (const part of parts) {
		if (current == null || typeof current !== "object") return undefined;
		current = current[part];
	}
	return current;
}

function setNestedValue(obj: any, path: string, value: unknown): boolean {
	const parts = path.split(".");
	let current = obj;
	for (let i = 0; i < parts.length - 1; i++) {
		if (current == null || typeof current !== "object") return false;
		current = current[parts[i]!];
	}
	const lastKey = parts[parts.length - 1]!;
	if (current == null || typeof current !== "object" || !(lastKey in current)) {
		return false;
	}
	current[lastKey] = value;
	return true;
}

function parseValue(val: string): unknown {
	if (val === "true") return true;
	if (val === "false") return false;
	const num = Number(val);
	if (!Number.isNaN(num) && val.trim() !== "") return num;
	return val;
}

function printConfig(obj: any, prefix: string) {
	for (const [key, val] of Object.entries(obj)) {
		const fullKey = prefix ? `${prefix}.${key}` : key;
		if (val != null && typeof val === "object" && !Array.isArray(val)) {
			printConfig(val, fullKey);
		} else {
			log.keyValue(fullKey, String(val));
		}
	}
}
