export function getWebSocketUrl(): string | undefined {
	return window.VIP_RTC?.wsUrl;
}
