const KIB_URL = "http://localhost:4747";

// DOM elements
const $ = (id: string) => document.getElementById(id)!;
const statusEl = $("status") as HTMLElement;
const viewIdle = $("view-idle");
const viewSaving = $("view-saving");
const viewSuccess = $("view-success");
const viewError = $("view-error");
const viewDisconnected = $("view-disconnected");
const btnSave = $("btn-save") as HTMLButtonElement;
const btnRetry = $("btn-retry") as HTMLButtonElement;
const pageTitleEl = $("page-title");
const pageUrlEl = $("page-url");
const selectionHint = $("selection-hint");
const resultDetail = $("result-detail");
const errorDetail = $("error-detail");

// Settings elements
const toggleAutocapture = $("toggle-autocapture") as HTMLInputElement;
const dwellConfig = $("dwell-config");
const dwellInput = $("dwell-input") as HTMLInputElement;
const dwellDisplay = $("dwell-display");
const dwellDesc = $("dwell-desc");

let currentTab: chrome.tabs.Tab | null = null;

// ── Views ──

function showView(view: HTMLElement) {
	for (const v of [viewIdle, viewSaving, viewSuccess, viewError, viewDisconnected]) {
		v.hidden = v !== view;
	}
}

// ── Health check ──

async function checkHealth(): Promise<boolean> {
	try {
		const res = await fetch(KIB_URL, { signal: AbortSignal.timeout(2000) });
		const text = await res.text();
		return text.includes("kib");
	} catch {
		return false;
	}
}

// ── Check for text selection on page ──

async function checkSelection(tabId: number): Promise<string | null> {
	try {
		const results = await chrome.scripting.executeScript({
			target: { tabId },
			func: () => window.getSelection()?.toString().trim() || null,
		});
		return results[0]?.result ?? null;
	} catch {
		return null;
	}
}

// ── Extract page content ──

function extractContent(tabId: number): Promise<{ title: string; content: string; url: string }> {
	return new Promise((resolve, reject) => {
		const timeout = setTimeout(() => {
			chrome.runtime.onMessage.removeListener(listener);
			reject(new Error("Could not extract page content"));
		}, 10000);

		function listener(msg: {
			type: string;
			data: { title: string; content: string; url: string };
		}) {
			if (msg.type !== "kib-extracted") return;
			chrome.runtime.onMessage.removeListener(listener);
			clearTimeout(timeout);
			if (!msg.data?.content) {
				reject(new Error("Could not extract page content"));
			} else {
				resolve(msg.data);
			}
		}

		chrome.runtime.onMessage.addListener(listener);
		chrome.scripting
			.executeScript({
				target: { tabId },
				files: ["content.js"],
			})
			.catch((err) => {
				chrome.runtime.onMessage.removeListener(listener);
				clearTimeout(timeout);
				reject(err);
			});
	});
}

// ── Send to kib ──

async function sendToKib(data: { title: string; content: string; url: string }) {
	const res = await fetch(`${KIB_URL}/ingest`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(data),
	});
	const json = await res.json();
	if (!res.ok || json.error) {
		throw new Error(json.error || `HTTP ${res.status}`);
	}
	return json;
}

// ── Save flow ──

async function save() {
	if (!currentTab?.id) return;

	showView(viewSaving);

	try {
		const extracted = await extractContent(currentTab.id);
		await sendToKib(extracted);

		const words = extracted.content.split(/\s+/).length;
		resultDetail.textContent = `"${truncate(extracted.title, 40)}" \u00b7 ${words.toLocaleString()} words`;
		showView(viewSuccess);

		// Auto-close after a beat
		setTimeout(() => window.close(), 1800);
	} catch (err: unknown) {
		errorDetail.textContent = err instanceof Error ? err.message : "Unknown error";
		showView(viewError);
	}
}

function truncate(s: string, max: number): string {
	return s.length > max ? `${s.slice(0, max - 1)}\u2026` : s;
}

function displayUrl(url: string): string {
	try {
		const u = new URL(url);
		return u.hostname.replace(/^www\./, "");
	} catch {
		return url;
	}
}

// ── Settings ──

function updateDwellDesc(seconds: number, enabled: boolean) {
	dwellDesc.textContent = enabled ? `Save pages after ${seconds}s` : "Off";
}

async function loadSettings() {
	try {
		const result = await chrome.storage.local.get("autoCapture");
		const settings = result.autoCapture ?? { enabled: false, dwellSeconds: 30 };
		toggleAutocapture.checked = settings.enabled;
		dwellInput.value = String(settings.dwellSeconds);
		dwellDisplay.textContent = String(settings.dwellSeconds);
		dwellConfig.hidden = !settings.enabled;
		updateDwellDesc(settings.dwellSeconds, settings.enabled);
	} catch {
		// Storage not available
	}
}

async function saveSettings() {
	const settings = {
		enabled: toggleAutocapture.checked,
		dwellSeconds: Number.parseInt(dwellInput.value, 10),
	};
	await chrome.storage.local.set({ autoCapture: settings });
	updateDwellDesc(settings.dwellSeconds, settings.enabled);
}

// ── Init ──

async function init() {
	// Get current tab
	const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
	currentTab = tab;

	if (tab) {
		pageTitleEl.textContent = tab.title || "Untitled";
		pageUrlEl.textContent = displayUrl(tab.url || "");
	}

	// Load settings
	await loadSettings();

	// Check kib health
	const healthy = await checkHealth();
	if (healthy) {
		statusEl.classList.add("connected");
		statusEl.title = "Connected";
		btnSave.disabled = false;
	} else {
		statusEl.classList.add("disconnected");
		statusEl.title = "Disconnected";
		showView(viewDisconnected);
		return;
	}

	// Check for text selection
	if (tab?.id) {
		const selection = await checkSelection(tab.id);
		if (selection && selection.length > 10) {
			selectionHint.hidden = false;
		}
	}
}

// ── Event listeners ──

btnSave.addEventListener("click", save);
btnRetry.addEventListener("click", () => {
	showView(viewIdle);
	save();
});

// Copy command button
$("btn-copy-cmd").addEventListener("click", async () => {
	await navigator.clipboard.writeText("kib watch");
	const label = $("copy-label");
	label.textContent = "copied!";
	setTimeout(() => {
		label.textContent = "copy";
	}, 1500);
});

// Settings: toggle auto-capture
toggleAutocapture.addEventListener("change", () => {
	dwellConfig.hidden = !toggleAutocapture.checked;
	saveSettings();
});

// Settings: dwell time slider
dwellInput.addEventListener("input", () => {
	dwellDisplay.textContent = dwellInput.value;
	updateDwellDesc(Number.parseInt(dwellInput.value, 10), toggleAutocapture.checked);
});

dwellInput.addEventListener("change", () => {
	saveSettings();
});

// Keyboard: Enter to save
document.addEventListener("keydown", (e) => {
	if (e.key === "Enter" && !btnSave.disabled && !viewIdle.hidden) {
		save();
	}
});

init();
