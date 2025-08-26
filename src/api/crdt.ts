/**
 * External dependencies
 */
import apiFetch from '@wordpress/api-fetch';
import { __ } from '@wordpress/i18n';
import * as buffer from 'lib0/buffer';
import * as Y from 'yjs';

import { getCrdtDocVersion } from '@/utilities/config';
import { generateHash } from '@/utilities/crypto';
import { getErrorMessage } from '@/utilities/error';

import type { CRDTDoc } from '@wordpress/sync';

interface GetCrdtResponse {
	crdtDoc: string | null;
	error?: string;
	success: boolean;
}

interface UpdateCrdtResponse {
	crdtDoc?: string;
	error?: string;
	success: boolean;
}

const CRDT_DOC_VERSION = getCrdtDocVersion();
const CRDT_REST_API_BASE = '/vip-rtc/v1/crdt';

function serializeCrdtDoc( crdtDoc: CRDTDoc ): string {
	return buffer.toBase64( Y.encodeStateAsUpdateV2( crdtDoc ) );
}

function deserializeCrdtDoc( serializedCrdtDoc: string ): CRDTDoc {
	const ydoc = new Y.Doc();
	const yupdate = buffer.fromBase64( serializedCrdtDoc );
	Y.applyUpdateV2( ydoc, yupdate );

	ydoc.clientID = Math.floor( Math.random() * 1000000000 );

	return ydoc;
}

export async function getCrdtDoc(
	syncObjectType: string,
	syncObjectId: string
): Promise< CRDTDoc | null > {
	const queryParams = new URLSearchParams( {
		crdtVersion: CRDT_DOC_VERSION.toString(),
		syncObjectType,
		syncObjectId,
	} );
	const path = `${ CRDT_REST_API_BASE }?${ queryParams.toString() }`;

	try {
		const data = await apiFetch< GetCrdtResponse >( {
			method: 'GET',
			path,
		} );

		if ( ! data.crdtDoc ) {
			if ( true !== data.success ) {
				throw new Error( data.error ?? __( 'Unexpected response', 'vip-real-time-collaboration' ) );
			}

			return null;
		}

		return deserializeCrdtDoc( data.crdtDoc );
	} catch ( error: unknown ) {
		// eslint-disable-next-line no-console
		console.debug(
			`Error fetching CRDT document for ${ syncObjectType }:${ syncObjectId }`,
			getErrorMessage( error )
		);
	}

	return null;
}

export async function updateCrdtDoc(
	syncObjectType: string,
	syncObjectId: string,
	crdtDoc: CRDTDoc,
	rawContent: string,
	isInitialUpdate = false
): Promise< CRDTDoc > {
	try {
		const data = await apiFetch< UpdateCrdtResponse >( {
			data: {
				contentHash: await generateHash( rawContent, 'SHA-256' ),
				crdtDoc: serializeCrdtDoc( crdtDoc ),
				crdtVersion: CRDT_DOC_VERSION,
				isInitialUpdate,
				syncObjectType,
				syncObjectId,
			},
			method: 'PUT',
			path: CRDT_REST_API_BASE,
		} );

		if ( ! data.success ) {
			throw new Error( data.error ?? __( 'Unexpected response', 'vip-real-time-collaboration' ) );
		}

		// If the server returns a CRDT document, it indicates that our update was
		// rejected in favor of the server's version. This can happen in a race
		// condition where two peers attempt an initial update at the same time.
		if ( data.crdtDoc ) {
			return deserializeCrdtDoc( data.crdtDoc ) ?? crdtDoc;
		}
	} catch ( error: unknown ) {
		// eslint-disable-next-line no-console
		console.debug(
			`Error updating CRDT document for ${ syncObjectType }:${ syncObjectId }`,
			getErrorMessage( error )
		);
	}

	return crdtDoc;
}

// Provide some debugging utilities in development mode.
if ( 'development' === process.env.NODE_ENV ) {
	window.VIP_RTC.debug.deserializeCrdtAsJson = ( serializedCrdtDoc: string ): object | null => {
		return deserializeCrdtDoc( serializedCrdtDoc ).getMap( 'document' ).toJSON();
	};
}
