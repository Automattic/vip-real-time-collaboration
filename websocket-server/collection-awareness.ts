/**
 * Short-circuit empty awareness traffic in site-wide collection rooms.
 *
 * Gutenberg syncs some entity collections (for example `root/comment` and
 * `postType/<type>` lists fetched with `per_page: -1`) through one room per
 * site. Nearly every open editor joins these rooms, but Gutenberg attaches no
 * awareness to them, so y-websocket creates a default awareness whose state is
 * an empty object. y-protocols renews that state every 15 seconds, and
 * y-websocket-server rebroadcasts every renewal to every room member. With N
 * editors that is N² / 15 frames per second of `{}` per collection room.
 *
 * Instead, when a collection-room awareness update carries only empty or
 * removed states, the server echoes it back to the sender and does not apply
 * or broadcast it. The echo keeps y-websocket's 30-second "no message
 * received" liveness check satisfied, exactly as the sender's own broadcast
 * copy did before. Updates carrying real state are left untouched, so presence
 * keeps working if Gutenberg ever adds awareness to collections.
 */

import * as decoding from 'lib0/decoding';

import { recordSuppressedCollectionAwareness } from './metrics';

/** y-websocket message type for awareness updates. */
const MESSAGE_AWARENESS = 1;

/** Serialized awareness states that carry no presence information. */
const EMPTY_AWARENESS_STATES = new Set( [ '{}', 'null' ] );

/**
 * Collection rooms are named `site-{blogId}/{objectType}-collection` by the
 * client. Entity rooms end in a numeric object ID, so the suffix is unambiguous.
 */
export function isCollectionRoom( room: string ): boolean {
	return room.endsWith( '-collection' );
}

/**
 * Whether a y-websocket message is an awareness update whose every client
 * state is empty (`{}`) or removed (`null`). Malformed input returns false so
 * y-websocket-server keeps handling (and reporting) it as before.
 */
export function isEmptyAwarenessMessage( message: Uint8Array ): boolean {
	if ( message[ 0 ] !== MESSAGE_AWARENESS ) {
		return false;
	}

	try {
		const decoder = decoding.createDecoder( message );
		decoding.readVarUint( decoder ); // Message type.
		const update = decoding.createDecoder( decoding.readVarUint8Array( decoder ) );
		const count = decoding.readVarUint( update );
		if ( count === 0 ) {
			return false;
		}
		for ( let index = 0; index < count; index += 1 ) {
			decoding.readVarUint( update ); // Client ID.
			decoding.readVarUint( update ); // Clock.
			if ( ! EMPTY_AWARENESS_STATES.has( decoding.readVarString( update ) ) ) {
				return false;
			}
		}
		return ! decoding.hasContent( update ) && ! decoding.hasContent( decoder );
	} catch {
		return false;
	}
}

/**
 * Handle an inbound room message if it is empty collection-room awareness.
 *
 * @param room    The room the message belongs to.
 * @param message The unmodified y-websocket message.
 * @param echo    Sends the message back to the originating connection only.
 * @return True when the message was handled and must not reach y-websocket-server.
 */
export function handleCollectionAwareness(
	room: string,
	message: Uint8Array,
	echo: ( message: Uint8Array ) => void
): boolean {
	if ( ! isCollectionRoom( room ) || ! isEmptyAwarenessMessage( message ) ) {
		return false;
	}

	recordSuppressedCollectionAwareness();
	echo( message );
	return true;
}
