/**
 * Background service worker.
 * Handles keyboard shortcuts, dwell-time auto-capture, and history scanning.
 */

const KIB_URL = "http://localhost:4747";

interface AutoCaptureSettings {
	enabled: boolean;
	dwellSeconds: number;
}

interface HistoryScanSettings {
	enabled: boolean;
	scanIntervalMinutes: number;
	lookbackMinutes: number;
}

const DEFAULT_SETTINGS: AutoCaptureSettings = {
	enabled: false,
	dwellSeconds: 30,
};

const DEFAULT_HISTORY_SETTINGS: HistoryScanSettings = {
	enabled: false,
	scanIntervalMinutes: 15,
	lookbackMinutes: 60,
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

async function getHistorySettings(): Promise<HistoryScanSettings> {
	try {
		const result = await chrome.storage.local.get("historyScan");
		return { ...DEFAULT_HISTORY_SETTINGS, ...(result.historyScan ?? {}) };
	} catch {
		return DEFAULT_HISTORY_SETTINGS;
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

// ── History scanning ──

/** URLs already sent from history (persisted to storage to survive SW restarts) */
let historySentUrls = new Set<string>();
let historyScanTimer: ReturnType<typeof setInterval> | null = null;

async function loadHistorySentUrls(): Promise<void> {
	try {
		const result = await chrome.storage.local.get("historySentUrls");
		const urls: string[] = result.historySentUrls ?? [];
		historySentUrls = new Set(urls);
	} catch {
		// ignore
	}
}

async function persistHistorySentUrls(): Promise<void> {
	// Keep only the most recent 5000 URLs to avoid unbounded growth
	const urls = [...historySentUrls].slice(-5000);
	await chrome.storage.local.set({ historySentUrls: urls });
}

/** URLs to skip: search engines, login pages, internal pages, etc. */
function isSkippableUrl(url: string): boolean {
	try {
		const u = new URL(url);
		// Skip non-http
		if (u.protocol !== "http:" && u.protocol !== "https:") return true;
		// Skip localhost
		if (u.hostname === "localhost" || u.hostname === "127.0.0.1") return true;
		// Skip common non-content pages
		const skipPatterns = [
			/^https?:\/\/(www\.)?google\.\w+\/(search|maps)/,
			/^https?:\/\/(www\.)?bing\.com\/search/,
			/^https?:\/\/duckduckgo\.com\/\?/,
			/^https?:\/\/.*\/(login|signin|signup|auth|oauth|callback)/i,
			/^https?:\/\/accounts\./,
			/^https?:\/\/mail\./,
			/^https?:\/\/(www\.)?youtube\.com\/(watch|shorts)/,
		];
		return skipPatterns.some((p) => p.test(url));
	} catch {
		return true;
	}
}

async function scanHistory(): Promise<void> {
	const settings = await getHistorySettings();
	if (!settings.enabled) return;

	if (!(await isKibRunning())) return;

	const startTime = Date.now() - settings.lookbackMinutes * 60 * 1000;

	try {
		const items = await chrome.history.search({
			text: "",
			startTime,
			maxResults: 200,
		});

		let sent = 0;
		for (const item of items) {
			if (!item.url || !item.title) continue;

			const normalized = normalizeUrl(item.url);
			if (historySentUrls.has(normalized)) continue;
			if (capturedUrls.has(normalized)) continue;
			if (isSkippableUrl(item.url)) continue;

			// Send URL to kib for web extraction
			try {
				const res = await fetch(`${KIB_URL}/ingest`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						url: item.url,
						title: item.title,
						source: "history",
					}),
				});
				if (res.ok) {
					historySentUrls.add(normalized);
					capturedUrls.add(normalized);
					sent++;
				}
			} catch {
				// kib not reachable, stop scanning
				break;
			}
		}

		if (sent > 0) {
			await persistHistorySentUrls();
		}
	} catch {
		// History API error
	}
}

function clearHistoryScanTimer() {
	if (historyScanTimer) {
		clearInterval(historyScanTimer);
		historyScanTimer = null;
	}
}

async function startHistoryScanner() {
	clearHistoryScanTimer();
	const settings = await getHistorySettings();
	if (!settings.enabled) return;

	await loadHistorySentUrls();

	// Run initial scan after a short delay (don't block startup)
	setTimeout(() => scanHistory(), 5000);

	// Set up periodic scanning
	historyScanTimer = setInterval(() => scanHistory(), settings.scanIntervalMinutes * 60 * 1000);
}

// ── Keyboard shortcut ──

chrome.commands?.onCommand?.addListener(async (command) => {
	if (command === "save-to-kib") {
		chrome.action.openPopup?.();
	}
});

// ── Install ──

chrome.runtime.onInstalled.addListener(() => {
	chrome.action.setBadgeText({ text: "" });
	startHistoryScanner();
});

// Start history scanner on service worker startup (covers restarts)
startHistoryScanner();

// ── Listen for settings changes ──

chrome.storage.onChanged.addListener((changes) => {
	if (changes.autoCapture) {
		const settings = changes.autoCapture.newValue as AutoCaptureSettings | undefined;
		if (!settings?.enabled) {
			clearDwellTimer();
		} else if (activeTabId && activeUrl && isCapturableUrl(activeUrl)) {
			startDwellTimer(activeTabId, activeUrl);
		}
	}
	if (changes.historyScan) {
		startHistoryScanner();
	}
});
