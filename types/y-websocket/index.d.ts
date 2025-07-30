declare module 'y-websocket' {
	import * as Y from 'yjs';

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

	export class WebsocketProvider {
		constructor( serverUrl: string, roomname: string, doc: Y.Doc, opts?: WebsocketProviderOptions );

		params: Record< string, string >;
		shouldConnect: boolean;

		connect(): void;
		disconnect(): void;

		on< K extends keyof WebsocketProviderEvents >(
			eventName: K,
			handler: WebsocketProviderEvents[ K ]
		): void;

		off< K extends keyof WebsocketProviderEvents >(
			eventName: K,
			handler: WebsocketProviderEvents[ K ]
		): void;

		wsconnected: boolean;
		wsconnecting: boolean;
		synced: boolean;
	}
}
