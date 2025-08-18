/**
 * External dependencies
 */
import apiFetch from '@wordpress/api-fetch';
import { __ } from '@wordpress/i18n';
import * as buffer from 'lib0/buffer';
import * as Y from 'yjs';

import { getCrdtDocVersion } from '../utilities/config';

import type { CRDTDoc } from '@wordpress/sync';

interface GetCrdtResponse {
	crdtDoc: string | null;
	success: boolean;
}

interface UpdateCrdtResponse {
	crdtDoc?: string;
	success: boolean;
}

const CRDT_DOC_VERSION = getCrdtDocVersion();
const CRDT_REST_API_BASE = '/vip-rtc/v1/crdt';

function serializeCrdtDoc( crdtDoc: CRDTDoc ): string {
	return buffer.toBase64( Y.encodeStateAsUpdateV2( crdtDoc ) );
}

function deserializeCrdtDoc( serializedCrdtDoc: string ): CRDTDoc | null {
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

		if ( true !== data.success || ! data.crdtDoc ) {
			throw new Error( __( 'Unexpected response format', 'vip-real-time-collaboration' ) );
		}

		return deserializeCrdtDoc( data.crdtDoc );
	} catch ( error: unknown ) {
		console.debug(
			`Error fetching CRDT document for ${ syncObjectType }:${ syncObjectId }`,
			error instanceof Error ? error.message : String( error )
		);
	}

	return null;
}

export async function updateCrdtDoc(
	syncObjectType: string,
	syncObjectId: string,
	crdtDoc: CRDTDoc,
	isInitialUpdate = false
): Promise< CRDTDoc > {
	try {
		const data = await apiFetch< UpdateCrdtResponse >( {
			data: {
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
			throw new Error( __( 'Unknown failure', 'vip-real-time-collaboration' ) );
		}

		// If the server returns a CRDT document, it indicates that our update was
		// rejected in favor of the server's version. This can happen in a race
		// condition where two peers attempt an initial update at the same time.
		if ( data.crdtDoc ) {
			return deserializeCrdtDoc( data.crdtDoc ) ?? crdtDoc;
		}
	} catch ( error: unknown ) {
		console.debug(
			`Error updating CRDT document for ${ syncObjectType }:${ syncObjectId }`,
			error instanceof Error ? error.message : String( error )
		);
	}

	return crdtDoc;
}
