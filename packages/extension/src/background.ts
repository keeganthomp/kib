/**
 * Background service worker.
 * Handles the keyboard shortcut command and any future background tasks.
 */

chrome.commands?.onCommand?.addListener(async (command) => {
	if (command === "save-to-kib") {
		// Open popup programmatically (MV3 limitation: can't open popup from command directly)
		// Instead, trigger save on the active tab via the same flow
		chrome.action.openPopup?.();
	}
});

// Set badge on install
chrome.runtime.onInstalled.addListener(() => {
	// Clear any stale badge
	chrome.action.setBadgeText({ text: "" });
});
