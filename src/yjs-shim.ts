/**
 * Shared-Yjs shim for the bundled y-websocket and y-protocols modules.
 *
 * The webpack build aliases the `yjs` module specifier to this file, so the
 * bundled y-websocket and y-protocols modules resolve Yjs symbols here
 * instead of bundling their own copy. Two Yjs instances operating on the same
 * document cause silent data corruption:
 *
 * https://github.com/yjs/yjs/issues/438
 *
 * The editor's Yjs instance arrives in one of two ways:
 *
 * - Newer Gutenberg versions pass it to the provider creator as the `Y`
 *   option (see WordPress/gutenberg#81999). The provider creator calls
 *   `setYjsModule()` before constructing the WebSocket provider.
 * - Older Gutenberg versions expose it as the `wp.sync.Y` global, which this
 *   module reads at load time.
 *
 * Only the symbols actually referenced by y-websocket and y-protocols need
 * to be re-exported here. The exports are live bindings: y-websocket and
 * y-protocols only dereference them inside functions that run after the
 * provider creator has been called, so filling them in at that point is
 * early enough.
 */
import type * as YjsModule from 'yjs';

export let Doc: typeof YjsModule.Doc;
export let applyUpdate: typeof YjsModule.applyUpdate;
export let encodeStateAsUpdate: typeof YjsModule.encodeStateAsUpdate;
export let encodeStateVector: typeof YjsModule.encodeStateVector;

let yjsModuleSet = false;

export function setYjsModule( Y: typeof YjsModule ): void {
	( { Doc, applyUpdate, encodeStateAsUpdate, encodeStateVector } = Y );
	yjsModuleSet = true;
}

/**
 * Whether a Yjs module has been loaded into the shim, from either the `Y`
 * provider option or the legacy `wp.sync.Y` global. When this is false, any
 * Yjs call made by the bundled y-websocket and y-protocols modules would
 * throw, so callers should treat it as a fatal configuration error.
 */
export function isYjsModuleSet(): boolean {
	return yjsModuleSet;
}

// Unit tests run in Node, where `window` is undefined.
const legacyY = typeof window !== 'undefined' ? window.wp?.sync?.Y : undefined;

if ( legacyY ) {
	setYjsModule( legacyY );
}
