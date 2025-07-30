import { WebsocketProvider as WSProvider, WebsocketProviderOptions } from 'y-websocket';

declare global {
	type WebsocketProvider = WSProvider;
	type ConnectDoc = ( id: ObjectID, type: ObjectType, ydoc: Y.Doc ) => Promise< () => void >;

	interface WebSocketConnectionConfig {
		options?: WebsocketProviderOptions;
		password?: string;
		serverUrl: string;
		configureProvider?: (
			provider: WebsocketProvider,
			syncObjectType: string,
			syncObjectId: string
		) => Promise< void >;
	}

	interface RemoteConnectionCreators {
		createWebSocketConnection: ( config: WebSocketConnectionConfig ) => ConnectDoc;
	}
}

export {};
