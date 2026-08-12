/**
 * External dependencies
 */
import { expect, type BrowserContext, type Page } from '@playwright/test';
import { RequestUtils, test } from '@wordpress/e2e-test-utils-playwright';
import NodeWebSocket, { type RawData } from 'ws';
import { WebsocketProvider } from 'y-websocket';
import * as Yjs from 'yjs';

/**
 * Internal dependencies
 */
import { createSharedWebSocketAdapter } from '../../../src/shared-websocket';
import {
	MULTIPLEX_SUBPROTOCOL,
	decodeMessage,
	encodeMessage,
	type ProtocolMessage,
} from '../../../websocket-server/protocol';

const WEBSOCKET_URL = process.env.WS_URL ?? 'ws://localhost:1234/_ws';
const EXTENDED_POLL_TIMEOUT_MS = 15_000;

interface AuthResponse {
	token: string;
}

interface TransportRecorder {
	closedSocketCount: number;
	createdSocketCount: number;
	receivedMessages: ProtocolMessage[];
	sentMessages: ProtocolMessage[];
}

interface VirtualSocket {
	close: () => void;
	onclose: ( ( event: CloseEvent ) => unknown ) | null;
}

class TrackingWebSocket extends NodeWebSocket {
	public static instances: TrackingWebSocket[] = [];

	public constructor( url: string | URL, protocols?: string | string[] ) {
		super( url, protocols );
		TrackingWebSocket.instances.push( this );
	}
}

function websocketUrl( baseUrl: string ): string {
	return WEBSOCKET_URL.replace( 'localhost', new URL( baseUrl ).hostname );
}

async function getToken(
	requestUtils: RequestUtils,
	syncObjectId: number,
	wpClientId: string
): Promise< string > {
	const response = await requestUtils.rest< AuthResponse >( {
		data: {
			syncObjectId: String( syncObjectId ),
			syncObjectType: 'postType/post',
			wpClientId,
		},
		method: 'POST',
		path: '/vip-rtc/v1/websocket/auth',
	} );

	return response.token;
}

function roomName( postId: number ): string {
	return `site-1/postType/post-${ postId }`;
}

function waitForOpen( socket: NodeWebSocket ): Promise< void > {
	return new Promise( ( resolve, reject ) => {
		socket.once( 'open', resolve );
		socket.once( 'error', reject );
	} );
}

function waitForVirtualCloseCode( socket: VirtualSocket, code: number ): Promise< void > {
	return new Promise( ( resolve, reject ) => {
		socket.onclose = event => {
			if ( event.code === code ) {
				resolve();
				return;
			}
			reject( new Error( `Expected virtual WebSocket close ${ code }, received ${ event.code }` ) );
		};
	} );
}

function rawDataToUint8Array( data: RawData ): Uint8Array {
	if ( Array.isArray( data ) ) {
		return new Uint8Array( Buffer.concat( data ) );
	}
	if ( data instanceof ArrayBuffer ) {
		return new Uint8Array( data );
	}
	return new Uint8Array( data.buffer, data.byteOffset, data.byteLength );
}

function waitForFirstMessage( socket: NodeWebSocket ): Promise< ProtocolMessage > {
	return new Promise( ( resolve, reject ) => {
		const onMessage = ( data: RawData ) => {
			try {
				const message = decodeMessage( rawDataToUint8Array( data ) );
				cleanup();
				resolve( message );
			} catch ( error ) {
				cleanup();
				reject(
					error instanceof Error ? error : new Error( 'Unable to decode multiplex message' )
				);
			}
		};
		const onError = ( error: Error ) => {
			cleanup();
			reject( error );
		};
		const cleanup = () => {
			socket.off( 'message', onMessage );
			socket.off( 'error', onError );
		};
		socket.on( 'message', onMessage );
		socket.on( 'error', onError );
	} );
}

function waitForSynced( provider: WebsocketProvider ): Promise< void > {
	if ( provider.synced ) {
		return Promise.resolve();
	}

	return new Promise( resolve => {
		const onSync = ( synced: boolean ) => {
			if ( synced ) {
				provider.off( 'sync', onSync );
				resolve();
			}
		};
		provider.on( 'sync', onSync );
	} );
}

function recordMultiplexTransport( page: Page, wsUrl: string ): TransportRecorder {
	const recorder: TransportRecorder = {
		closedSocketCount: 0,
		createdSocketCount: 0,
		receivedMessages: [],
		sentMessages: [],
	};
	const record = ( messages: ProtocolMessage[], payload: string | Buffer ): void => {
		if ( typeof payload === 'string' ) {
			return;
		}
		try {
			messages.push( decodeMessage( payload ) );
		} catch {
			// Only decodable multiplex frames are recorded.
		}
	};
	page.on( 'websocket', socket => {
		if ( ! socket.url().startsWith( `${ wsUrl }/vip-rtc?auth=` ) ) {
			return;
		}
		recorder.createdSocketCount += 1;
		socket.on( 'framesent', frame => record( recorder.sentMessages, frame.payload ) );
		socket.on( 'framereceived', frame => record( recorder.receivedMessages, frame.payload ) );
		socket.on( 'close', () => {
			recorder.closedSocketCount += 1;
		} );
	} );
	return recorder;
}

async function registerPhysicalSockets( page: Page ): Promise< void > {
	await page.addInitScript( subprotocol => {
		const NativeWebSocket = window.WebSocket;
		window.__vipRtcPhysicalSockets = [];
		class RegisteringWebSocket extends NativeWebSocket {
			public constructor( url: string | URL, protocols?: string | string[] ) {
				super( url, protocols );
				const isMultiplex =
					protocols === subprotocol ||
					( Array.isArray( protocols ) && protocols.includes( subprotocol ) );
				if ( isMultiplex ) {
					window.__vipRtcPhysicalSockets?.push( this );
				}
			}
		}
		window.WebSocket = RegisteringWebSocket;
	}, MULTIPLEX_SUBPROTOCOL );
}

function closeOpenPhysicalSocket( page: Page, code: number, reason: string ): Promise< void > {
	return page.evaluate(
		( [ closeCode, closeReason ] ) => {
			const physical = window.__vipRtcPhysicalSockets?.find(
				candidate => candidate.readyState === window.WebSocket.OPEN
			);
			if ( ! physical ) {
				throw new Error( 'No registered multiplex physical socket is open' );
			}
			physical.close( closeCode, closeReason );
		},
		[ code, reason ] as const
	);
}

async function setRoomLimitBeforeNavigation( page: Page, limitedRoom: string ): Promise< void > {
	await page.addInitScript( room => {
		type AddFilter = (
			hookName: string,
			namespace: string,
			callback: ( limit: number, currentRoom: string ) => number
		) => void;
		const install = () => {
			const addFilter = ( window as unknown as { wp?: { hooks?: { addFilter?: AddFilter } } } ).wp
				?.hooks?.addFilter;
			if ( ! addFilter || window.__vipRtcRoomLimitInstalled ) {
				return Boolean( window.__vipRtcRoomLimitInstalled );
			}
			addFilter(
				'sync.pollingProvider.maxClientsPerRoom',
				'vip-rtc/e2e-room-limit',
				( limit: number, currentRoom: string ) => ( currentRoom === room ? 1 : limit )
			);
			window.__vipRtcRoomLimitInstalled = true;
			return true;
		};

		if ( ! install() ) {
			const timer = window.setInterval( () => {
				if ( install() ) {
					window.clearInterval( timer );
				}
			}, 0 );
		}
	}, limitedRoom );
}

declare global {
	interface Window {
		__vipRtcRoomLimitInstalled?: boolean;
		__vipRtcPhysicalSockets?: globalThis.WebSocket[];
	}
}

test.describe( 'multiplexed RTC transport', () => {
	let secondUser: { id: number } | undefined;
	let secondUserRequests: RequestUtils | undefined;

	test.beforeAll( async ( { requestUtils } ) => {
		await requestUtils.activatePlugin( 'gutenberg' );
		await requestUtils.activatePlugin( 'vip-real-time-collaboration' );
		const username = `multiplex-e2e-${ Date.now() }`;
		const password = 'multiplex-e2e-password';
		secondUser = await requestUtils.createUser( {
			email: `${ username }@example.test`,
			password,
			roles: [ 'editor' ],
			username,
		} );
		secondUserRequests = await RequestUtils.setup( {
			baseURL: String( test.info().project.use.baseURL ),
			user: { password, username },
		} );
	} );

	test.afterAll( async ( { requestUtils } ) => {
		await secondUserRequests?.request.dispose();
		if ( secondUser !== undefined ) {
			await requestUtils.rest( {
				method: 'DELETE',
				params: { force: true, reassign: 1 },
				path: `/wp/v2/users/${ secondUser.id }`,
			} );
		}
	} );

	test.afterEach( async ( { requestUtils } ) => {
		await requestUtils.deleteAllPosts();
	} );

	test( 'requires explicit room subscription and isolates rejected multiplex rooms from mixed legacy clients', async ( {
		requestUtils,
	} ) => {
		const baseUrl = String( test.info().project.use.baseURL );
		const wsUrl = websocketUrl( baseUrl );
		const firstPost = await requestUtils.createPost( {
			date_gmt: new Date().toISOString(),
			status: 'draft',
			title: 'Multiplex primary room',
		} );
		const secondPost = await requestUtils.createPost( {
			date_gmt: new Date().toISOString(),
			status: 'draft',
			title: 'Multiplex sibling room',
		} );
		const clientId = 'multiplex-e2e-client';
		const primaryGrant = await getToken( requestUtils, firstPost.id, clientId );
		const siblingGrant = await getToken( requestUtils, secondPost.id, clientId );
		if ( secondUserRequests === undefined ) {
			throw new Error( 'Second-user request context was not initialized' );
		}
		const legacyGrant = await getToken( secondUserRequests, firstPost.id, 'legacy-e2e-client' );
		const primaryRoom = roomName( firstPost.id );
		const siblingRoom = roomName( secondPost.id );
		const cleanups: Array< () => void > = [];

		try {
			// Phase: a multiplex upgrade owns no room until its explicit subscribe.
			const rawSocket = new NodeWebSocket(
				`${ wsUrl }/vip-rtc?auth=${ encodeURIComponent( primaryGrant ) }`,
				MULTIPLEX_SUBPROTOCOL
			);
			cleanups.push( () => rawSocket.close() );
			const firstMessage = waitForFirstMessage( rawSocket );
			await waitForOpen( rawSocket );
			rawSocket.send(
				encodeMessage( { grant: siblingGrant, room: siblingRoom, type: 'subscribe' } )
			);
			expect( await firstMessage ).toEqual( { room: siblingRoom, type: 'subscribed' } );
			rawSocket.close();

			// Phase: two multiplexed rooms share one physical socket while a
			// legacy room-URL client collaborates on the same document.
			TrackingWebSocket.instances = [];
			const SharedWebSocket = createSharedWebSocketAdapter(
				wsUrl,
				TrackingWebSocket as unknown as typeof globalThis.WebSocket
			);
			const primaryDoc = new Yjs.Doc();
			cleanups.push( () => primaryDoc.destroy() );
			const siblingDoc = new Yjs.Doc();
			cleanups.push( () => siblingDoc.destroy() );
			const legacyDoc = new Yjs.Doc();
			cleanups.push( () => legacyDoc.destroy() );
			const multiplexPrimary = new WebsocketProvider( wsUrl, primaryRoom, primaryDoc, {
				disableBc: true,
				params: { auth: primaryGrant },
				WebSocketPolyfill: SharedWebSocket,
			} );
			cleanups.push( () => multiplexPrimary.destroy() );
			const multiplexSibling = new WebsocketProvider( wsUrl, siblingRoom, siblingDoc, {
				disableBc: true,
				params: { auth: siblingGrant },
				WebSocketPolyfill: SharedWebSocket,
			} );
			cleanups.push( () => multiplexSibling.destroy() );
			const legacyProvider = new WebsocketProvider( wsUrl, primaryRoom, legacyDoc, {
				disableBc: true,
				params: { auth: legacyGrant },
				WebSocketPolyfill: NodeWebSocket as unknown as typeof globalThis.WebSocket,
			} );
			cleanups.push( () => legacyProvider.destroy() );
			await Promise.all( [
				waitForSynced( multiplexPrimary ),
				waitForSynced( multiplexSibling ),
				waitForSynced( legacyProvider ),
			] );

			// Phase: a rejected room closes with 4004 and leaves the shared
			// transport and its sibling rooms untouched.
			const rejectedRoomSocket = new SharedWebSocket(
				`${ wsUrl }/not-authorized?auth=${ encodeURIComponent( primaryGrant ) }`
			) as unknown as VirtualSocket;
			cleanups.push( () => rejectedRoomSocket.close() );
			await waitForVirtualCloseCode( rejectedRoomSocket, 4004 );
			expect( multiplexSibling.ws?.readyState ).toBe( SharedWebSocket.OPEN );
			primaryDoc.getMap< string >( 'shared' ).set( 'after-rejection', 'still-connected' );
			await expect
				.poll( () => legacyDoc.getMap< string >( 'shared' ).get( 'after-rejection' ) )
				.toBe( 'still-connected' );
			expect( TrackingWebSocket.instances ).toHaveLength( 1 );
			const physicalSocket = TrackingWebSocket.instances[ 0 ];

			// Phase: destroying one provider keeps the shared socket open;
			// destroying the final provider closes it.
			multiplexSibling.destroy();
			expect( physicalSocket?.readyState ).toBe( NodeWebSocket.OPEN );
			multiplexPrimary.destroy();
			await expect.poll( () => physicalSocket?.readyState ).toBe( NodeWebSocket.CLOSED );
		} finally {
			for ( const cleanup of cleanups.reverse() ) {
				cleanup();
			}
		}
	} );

	test( 'recovers offline edits and re-subscribes every room after a physical 4001', async ( {
		browser,
		page,
		requestUtils,
	} ) => {
		const baseUrl = String( test.info().project.use.baseURL );
		const post = await requestUtils.createPost( {
			date_gmt: new Date().toISOString(),
			status: 'draft',
			title: 'Multiplex editor recovery',
		} );
		const postEditorUrl = new URL( `/wp-admin/post.php?post=${ post.id }&action=edit`, baseUrl )
			.href;
		const recorder = recordMultiplexTransport( page, websocketUrl( baseUrl ) );
		let peerContext: BrowserContext | undefined;

		try {
			// Phase: the editor opens one physical socket and subscribes all
			// of its rooms over it.
			peerContext = await browser.newContext( {
				storageState: await requestUtils.request.storageState(),
			} );
			const peerPage = await peerContext.newPage();
			await registerPhysicalSockets( page );
			await page.goto( postEditorUrl );
			await page
				.frameLocator( '[name="editor-canvas"]' )
				.locator( '.editor-post-title__input' )
				.waitFor();
			await expect
				.poll(
					() =>
						new Set(
							recorder.sentMessages
								.filter( message => message.type === 'subscribe' )
								.map( message => message.room )
						).size,
					{ timeout: EXTENDED_POLL_TIMEOUT_MS }
				)
				.toBeGreaterThanOrEqual( 2 );
			expect( recorder.createdSocketCount ).toBe( 1 );
			const subscribedRooms = new Set(
				recorder.sentMessages
					.filter( message => message.type === 'subscribe' )
					.map( message => message.room )
			);

			await peerPage.goto( postEditorUrl );
			await peerPage
				.frameLocator( '[name="editor-canvas"]' )
				.locator( '.editor-post-title__input' )
				.waitFor();

			// Phase: an edit made while genuinely disconnected and offline
			// reaches the peer after connectivity returns. The closing
			// handshake needs the network, so drop the socket before going
			// offline; reconnect backoff keeps the transport down meanwhile.
			const closedSocketsBeforeOfflineDrop = recorder.closedSocketCount;
			const createdSocketsBeforeOfflineDrop = recorder.createdSocketCount;
			await closeOpenPhysicalSocket( page, 4000, 'e2e offline drop' );
			await expect
				.poll( () => recorder.closedSocketCount )
				.toBeGreaterThan( closedSocketsBeforeOfflineDrop );
			await page.context().setOffline( true );
			await page
				.frameLocator( '[name="editor-canvas"]' )
				.locator( '.editor-post-title__input' )
				.fill( 'offline multiplex title' );
			expect( recorder.createdSocketCount ).toBe( createdSocketsBeforeOfflineDrop );
			await page.context().setOffline( false );
			await expect
				.poll(
					() =>
						peerPage
							.frameLocator( '[name="editor-canvas"]' )
							.locator( '.editor-post-title__input' )
							.textContent(),
					{ timeout: EXTENDED_POLL_TIMEOUT_MS }
				)
				.toBe( 'offline multiplex title' );

			// Phase: a 4001 rotation close reconnects one replacement socket
			// and re-acknowledges every room.
			const createdSocketsBefore4001 = recorder.createdSocketCount;
			const sentFramesBefore4001 = recorder.sentMessages.length;
			const receivedFramesBefore4001 = recorder.receivedMessages.length;
			await closeOpenPhysicalSocket( page, 4001, 'e2e recovery' );
			await expect
				.poll(
					() => {
						const resubscribedRooms = new Set(
							recorder.sentMessages
								.slice( sentFramesBefore4001 )
								.filter( message => message.type === 'subscribe' )
								.map( message => message.room )
						);
						const acknowledgedRooms = new Set(
							recorder.receivedMessages
								.slice( receivedFramesBefore4001 )
								.filter( message => message.type === 'subscribed' )
								.map( message => message.room )
						);
						return [ ...subscribedRooms ].every(
							room => resubscribedRooms.has( room ) && acknowledgedRooms.has( room )
						);
					},
					{ timeout: EXTENDED_POLL_TIMEOUT_MS }
				)
				.toBe( true );

			// One replacement socket carried the whole recovery — no flapping.
			expect( recorder.createdSocketCount ).toBe( createdSocketsBefore4001 + 1 );
		} finally {
			await peerContext?.close();
		}
	} );

	test( 'yields the limited post room while an acknowledged sibling keeps the physical transport open', async ( {
		page,
		requestUtils,
	} ) => {
		const baseUrl = String( test.info().project.use.baseURL );
		const post = await requestUtils.createPost( {
			date_gmt: new Date().toISOString(),
			status: 'draft',
			title: 'Multiplex room limit',
		} );
		const postRoom = roomName( post.id );
		const postEditorUrl = new URL( `/wp-admin/post.php?post=${ post.id }&action=edit`, baseUrl )
			.href;
		const wsUrl = websocketUrl( baseUrl );
		const occupantDoc = new Yjs.Doc();
		let occupantProvider: WebsocketProvider | undefined;

		try {
			// Phase: a Node-side provider occupies the post room so the
			// editor's own subscription exceeds the limit of one client.
			const occupantGrant = await getToken( requestUtils, post.id, 'room-limit-occupant' );
			occupantProvider = new WebsocketProvider( wsUrl, postRoom, occupantDoc, {
				disableBc: true,
				params: { auth: occupantGrant },
				WebSocketPolyfill: NodeWebSocket as unknown as typeof globalThis.WebSocket,
			} );
			// The room-limit ranking only counts clients publishing Gutenberg's
			// collaboratorInfo awareness field, ordered by join time.
			occupantProvider.awareness.setLocalStateField( 'collaboratorInfo', {
				enteredAt: Date.now(),
			} );
			await waitForSynced( occupantProvider );

			// Phase: the over-limit editor yields only the limited room while
			// its sibling rooms keep the shared physical socket open.
			const recorder = recordMultiplexTransport( page, wsUrl );
			await registerPhysicalSockets( page );
			await setRoomLimitBeforeNavigation( page, postRoom );
			await page.goto( postEditorUrl );
			await page
				.frameLocator( '[name="editor-canvas"]' )
				.locator( '.editor-post-title__input' )
				.waitFor();
			await expect
				.poll(
					() =>
						recorder.sentMessages.some(
							message => message.type === 'unsubscribe' && message.room === postRoom
						),
					{ timeout: EXTENDED_POLL_TIMEOUT_MS }
				)
				.toBe( true );

			await expect
				.poll( () =>
					recorder.sentMessages.some(
						message =>
							message.type === 'subscribe' &&
							message.room !== postRoom &&
							recorder.receivedMessages.some(
								received => received.type === 'subscribed' && received.room === message.room
							) &&
							! recorder.sentMessages.some(
								sent => sent.type === 'unsubscribe' && sent.room === message.room
							)
					)
				)
				.toBe( true );
			expect( recorder.createdSocketCount ).toBe( 1 );
			const openPhysical = await page.evaluate(
				() =>
					window.__vipRtcPhysicalSockets?.some(
						socket => socket.readyState === window.WebSocket.OPEN
					)
			);
			expect( openPhysical ).toBe( true );
		} finally {
			occupantProvider?.destroy();
			occupantDoc.destroy();
		}
	} );
} );
