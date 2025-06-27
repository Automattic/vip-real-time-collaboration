type ConnectDoc = ( id: ObjectID, type: ObjectType, ydoc: Y.Doc ) => Promise< () => void >;

interface RemoteConnectionCreators {
	createWebSocketConnection: ( options: { serverUrl: string } ) => ConnectDoc;
}
