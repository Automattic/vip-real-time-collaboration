import type * as Y from 'yjs';
import type { Awareness } from 'y-protocols/awareness';

declare module 'y-websocket' {
	interface WebsocketProviderOptions {
		connect?: boolean;
		params?: Record< string, string >;
		protocols?: string[];
		resyncInterval?: number;
		maxBackoffTime?: number;
		disableBc?: boolean;
	}

	type WebsocketProviderEvents = {
		'connection-close': ( event: CloseEvent | null, provider: WebsocketProvider ) => void;
		status: ( event: { status: 'connected' | 'disconnected' | 'connecting' } ) => void;
		'connection-error': ( event: Event, provider: WebsocketProvider ) => void;
		sync: ( state: boolean ) => void;
	};
}
