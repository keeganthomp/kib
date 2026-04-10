/**
 * Background service worker.
 * Handles keyboard shortcuts and dwell-time auto-capture.
 */

const KIB_URL = "http://localhost:4747";

interface AutoCaptureSettings {
	enabled: boolean;
	dwellSeconds: number;
}

const DEFAULT_SETTINGS: AutoCaptureSettings = {
	enabled: false,
	dwellSeconds: 30,
};

// ── State ──

/** URL → timestamp when the tab was first focused on that URL */
let activeTabId: number | null = null;
let activeUrl: string | null = null;
let dwellTimer: ReturnType<typeof setTimeout> | null = null;
const capturedUrls = new Set<string>();

// ── Settings ──

async function getSettings(): Promise<AutoCaptureSettings> {
	try {
		const result = await chrome.storage.local.get("autoCapture");
		return { ...DEFAULT_SETTINGS, ...(result.autoCapture ?? {}) };
	} catch {
		return DEFAULT_SETTINGS;
	}
}

// ── Health check ──

async function isKibRunning(): Promise<boolean> {
	try {
		const res = await fetch(KIB_URL, { signal: AbortSignal.timeout(2000) });
		const text = await res.text();
		return text.includes("kib");
	} catch {
		return false;
	}
}

// ── Content extraction + send ──

function extractAndSend(tabId: number, url: string): void {
	// Listen for the content script's response
	function listener(msg: { type: string; data: { title: string; content: string; url: string } }) {
		if (msg.type !== "kib-extracted") return;
		chrome.runtime.onMessage.removeListener(listener);

		if (!msg.data?.content) return;

		fetch(`${KIB_URL}/ingest`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(msg.data),
		})
			.then(() => {
				capturedUrls.add(url);
				chrome.action.setBadgeText({ text: "✓", tabId });
				chrome.action.setBadgeBackgroundColor({ color: "#22c55e", tabId });
				setTimeout(() => {
					chrome.action.setBadgeText({ text: "", tabId }).catch(() => {});
				}, 3000);
			})
			.catch(() => {
				// Silently fail — don't disturb the user for background captures
			});
	}

	chrome.runtime.onMessage.addListener(listener);

	// Timeout: remove listener if content script doesn't respond in 10s
	setTimeout(() => {
		chrome.runtime.onMessage.removeListener(listener);
	}, 10000);

	chrome.scripting
		.executeScript({
			target: { tabId },
			files: ["content.js"],
		})
		.catch(() => {
			chrome.runtime.onMessage.removeListener(listener);
		});
}

// ── Dwell time tracking ──

function clearDwellTimer() {
	if (dwellTimer) {
		clearTimeout(dwellTimer);
		dwellTimer = null;
	}
}

function isCapturableUrl(url: string | undefined): boolean {
	if (!url) return false;
	return url.startsWith("http://") || url.startsWith("https://");
}

/** Normalize URL for dedup: strip hash and trailing slash */
function normalizeUrl(url: string): string {
	try {
		const u = new URL(url);
		u.hash = "";
		return u.href.replace(/\/$/, "");
	} catch {
		return url;
	}
}

async function startDwellTimer(tabId: number, url: string) {
	clearDwellTimer();

	const settings = await getSettings();
	if (!settings.enabled) return;

	const normalized = normalizeUrl(url);
	if (capturedUrls.has(normalized)) return;
	if (!isCapturableUrl(url)) return;

	dwellTimer = setTimeout(async () => {
		dwellTimer = null;

		// Re-check settings (user may have toggled off)
		const current = await getSettings();
		if (!current.enabled) return;

		// Re-check URL hasn't already been captured
		if (capturedUrls.has(normalized)) return;

		// Check kib is running before attempting
		if (!(await isKibRunning())) return;

		// Verify tab still exists and is on the same URL
		try {
			const tab = await chrome.tabs.get(tabId);
			if (normalizeUrl(tab.url ?? "") !== normalized) return;
		} catch {
			return; // tab closed
		}

		extractAndSend(tabId, normalized);
	}, settings.dwellSeconds * 1000);
}

// ── Tab event listeners ──

chrome.tabs.onActivated.addListener(async (activeInfo) => {
	activeTabId = activeInfo.tabId;
	try {
		const tab = await chrome.tabs.get(activeInfo.tabId);
		activeUrl = tab.url ?? null;
		if (activeUrl && isCapturableUrl(activeUrl)) {
			startDwellTimer(activeInfo.tabId, activeUrl);
		} else {
			clearDwellTimer();
		}
	} catch {
		clearDwellTimer();
	}
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, _tab) => {
	// Only care about URL changes on the active tab
	if (tabId !== activeTabId) return;
	if (!changeInfo.url) return;

	activeUrl = changeInfo.url;
	if (isCapturableUrl(changeInfo.url)) {
		startDwellTimer(tabId, changeInfo.url);
	} else {
		clearDwellTimer();
	}
});

chrome.windows.onFocusChanged.addListener((windowId) => {
	if (windowId === chrome.windows.WINDOW_ID_NONE) {
		// Browser lost focus — pause dwell timer
		clearDwellTimer();
	} else {
		// Browser regained focus — restart timer for active tab
		chrome.tabs.query({ active: true, windowId }, (tabs) => {
			const tab = tabs[0];
			if (tab?.id && tab.url && isCapturableUrl(tab.url)) {
				activeTabId = tab.id;
				activeUrl = tab.url;
				startDwellTimer(tab.id, tab.url);
			}
		});
	}
});

// ── Keyboard shortcut ──

chrome.commands?.onCommand?.addListener(async (command) => {
	if (command === "save-to-kib") {
		chrome.action.openPopup?.();
	}
});

// ── Install ──

chrome.runtime.onInstalled.addListener(() => {
	chrome.action.setBadgeText({ text: "" });
});

// ── Listen for settings changes to update badge ──

chrome.storage.onChanged.addListener((changes) => {
	if (changes.autoCapture) {
		const settings = changes.autoCapture.newValue as AutoCaptureSettings | undefined;
		if (!settings?.enabled) {
			clearDwellTimer();
		} else if (activeTabId && activeUrl && isCapturableUrl(activeUrl)) {
			startDwellTimer(activeTabId, activeUrl);
		}
	}
});
