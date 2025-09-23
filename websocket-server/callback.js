import http from 'http';
import * as number from 'lib0/number';

const CALLBACK_URL = process.env.CALLBACK_URL ? new URL( process.env.CALLBACK_URL ) : null;
const CALLBACK_TIMEOUT = number.parseInt( process.env.CALLBACK_TIMEOUT || '5000' );
const CALLBACK_OBJECTS = process.env.CALLBACK_OBJECTS
	? JSON.parse( process.env.CALLBACK_OBJECTS )
	: {};

export const isCallbackSet = Boolean( CALLBACK_URL );

/**
 * @param {import('./utils.js').WSSharedDoc} doc
 */
export const callbackHandler = doc => {
	const room = doc.name;
	const dataToSend = {
		room,
		data: {},
	};
	const sharedObjectList = Object.keys( CALLBACK_OBJECTS );
	sharedObjectList.forEach( sharedObjectName => {
		// eslint-disable-next-line security/detect-object-injection
		const sharedObjectType = CALLBACK_OBJECTS[ sharedObjectName ];
		// eslint-disable-next-line security/detect-object-injection
		dataToSend.data[ sharedObjectName ] = {
			type: sharedObjectType,
			content: getContent( sharedObjectName, sharedObjectType, doc ).toJSON(),
		};
	} );

	if ( CALLBACK_URL ) {
		callbackRequest( CALLBACK_URL, CALLBACK_TIMEOUT, dataToSend );
	}
};

/**
 * @param {URL} url
 * @param {number} timeout
 * @param {Object} data
 */
const callbackRequest = ( url, timeout, data ) => {
	data = JSON.stringify( data );
	const options = {
		hostname: url.hostname,
		port: url.port,
		path: url.pathname,
		timeout,
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Content-Length': Buffer.byteLength( data ),
		},
	};
	const req = http.request( options );
	req.on( 'timeout', () => {
		// eslint-disable-next-line no-console
		console.warn( 'Callback request timed out.' );
		// ToDo: abort is deprecated, fix this.
		req.abort();
	} );
	req.on( 'error', error => {
		// eslint-disable-next-line no-console
		console.error( 'Callback request error.', error );
		// ToDo: abort is deprecated, fix this.
		req.abort();
	} );
	req.write( data );
	req.end();
};

/**
 * @param {string} objName
 * @param {string} objType
 * @param {import('./utils.js').WSSharedDoc} doc
 */
const getContent = ( objName, objType, doc ) => {
	switch ( objType ) {
		case 'Array':
			return doc.getArray( objName );
		case 'Map':
			return doc.getMap( objName );
		case 'Text':
			return doc.getText( objName );
		case 'XmlFragment':
			return doc.getXmlFragment( objName );
		case 'XmlElement':
			return doc.getXmlElement( objName );
		default:
			return {};
	}
};
