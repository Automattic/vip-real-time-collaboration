import type { ConnectionErrorCode } from '@wordpress/sync';

export type WebSocketCloseScope = 'physical' | 'room';

/**
 * Browser-valid private close code used when the client rejects the multiplex
 * wire protocol. Native WebSocket clients cannot send reserved code 1002.
 */
export const MULTIPLEX_PROTOCOL_FAILURE_CLOSE_CODE = 4006;

export interface WebSocketClosePolicy {
	shouldRetry: boolean;
	errorCode: ConnectionErrorCode;
	includeRetryMetadata: boolean;
}

const roomCloseEvents = new WeakSet< CloseEvent >();

export function markAsRoomCloseEvent( event: CloseEvent ): CloseEvent {
	roomCloseEvents.add( event );
	return event;
}

export function getWebSocketCloseScope( event: CloseEvent | null ): WebSocketCloseScope {
	return event !== null && roomCloseEvents.has( event ) ? 'room' : 'physical';
}

export function getWebSocketClosePolicy(
	scope: WebSocketCloseScope,
	code?: number,
	roomLimitExceeded = false
): WebSocketClosePolicy {
	if ( roomLimitExceeded ) {
		return {
			shouldRetry: false,
			errorCode: 'room-connection-limit-exceeded',
			includeRetryMetadata: false,
		};
	}

	if ( scope === 'room' ) {
		const shouldRetry = code === 4005;
		return {
			shouldRetry,
			errorCode: 'unknown-error',
			includeRetryMetadata: shouldRetry,
		};
	}

	switch ( code ) {
		case 4001:
			return {
				shouldRetry: true,
				errorCode: 'connection-expired',
				includeRetryMetadata: true,
			};
		case 4002:
			return {
				shouldRetry: true,
				errorCode: 'connection-limit-exceeded',
				includeRetryMetadata: false,
			};
		case 4003:
			return {
				shouldRetry: true,
				errorCode: 'collaborator-limit-exceeded',
				includeRetryMetadata: false,
			};
		default: {
			const shouldRetry =
				code !== 1002 && code !== 1008 && code !== MULTIPLEX_PROTOCOL_FAILURE_CLOSE_CODE;
			return {
				shouldRetry,
				errorCode: 'unknown-error',
				includeRetryMetadata: shouldRetry,
			};
		}
	}
}
