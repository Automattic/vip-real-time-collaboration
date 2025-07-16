declare module '@wordpress/sync' {
	interface LocalConnectionCreators {
		createIndexedDBConnection: () => ConnectDoc;
	}

	interface RemoteConnectionCreators {
		createWebSocketConnection: ( options: { serverUrl: string } ) => ConnectDoc;
	}

	type ConnectDoc = ( id: ObjectID, type: ObjectType, ydoc: Y.Doc ) => Promise< ConnectDocResult >;

	type ConnectDocResult = {
		destroy: () => void;
		awareness: Awareness;
	};

	type SyncProvider = {
		register: ( type: ObjectType, config: ObjectConfig ) => void;
		bootstrap: (
			type: ObjectType,
			id: ObjectID,
			handleChanges: ( data: any ) => void
		) => Promise< Y.Doc >;
		encodeState: ( type: ObjectType, id: ObjectID ) => Uint8Array | null;
		update: ( type: ObjectType, id: ObjectID, data: any, origin: any ) => void;
		discard: ( type: ObjectType, id: ObjectID ) => Promise< void >;
		postTypeConfigs: { [ postType: string ]: ObjectConfig };

		awareness: {
			addListener: (
				eventType: 'update' | 'change',
				listener: AwarenessEventListener
			) => void;
			getClientId: () => number | null;
			getLocalState: () => Record< string, any > | null;
			getStates: () => Map< number, Record< string, any > > | null;
			setLocalStateField: ( field: string, value: any ) => void;
			removeAwarenessStates: () => void;
		};
	};

	function getSyncProvider(): SyncProvider;
}
