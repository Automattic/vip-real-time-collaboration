export const CURSOR_UPDATE_DEBOUNCE_IN_MS = 100;
export const DISCONNECTED_THRESHOLD_IN_MS = 5000;
export const REMOVAL_DELAY_IN_MS = 5000;

export function getCrdtDocVersion(): number {
	return window.VIP_RTC.crdtDocVersion;
}

export function getWebSocketUrl(): string {
	return window.VIP_RTC.wsUrl;
}
