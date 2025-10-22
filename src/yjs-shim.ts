/**
 * This file is a shim for loading Yjs from a browser global provided by the
 * `@wordpress/sync` package. This is done primarily to avoid packaging and
 * importing two different Yjs instances, which would result in this conflict:
 *
 * https://github.com/yjs/yjs/issues/438
 *
 * It also allows us to align on the same Yjs version automatically.
 *
 * Scripts in this repo should directly import 'yjs' which will resolve to this
 * file via Webpack.
 *
 * This (unused) import of `@wordpress/core-data` is important to ensure that
 * `wp.sync` is loaded and available. It results in `core-data` being added to
 * our script's dependencies (see `build/index.asset.php`), which influences the
 * load order. We cannot use `@wordpress/sync` for this purpose because it is
 * not yet a public package.
 */
import '@wordpress/core-data';

// window.wp.sync is provided by @wordpress/core-data loading @wordpress/sync,
// but the TypeScript types from @wordpress/sync don't include it in window.wp.
// Cast to the proper type from our global type definitions.
const wpSync = ( window.wp as any ).sync as {
	SyncProvider: typeof import('@wordpress/sync').SyncProvider;
	Y: typeof import('yjs');
};

// To avoid issues with default exports, you must individually export the
// properties you need, including those used by dependencies.
export const applyUpdate = wpSync.Y.applyUpdate;
export const applyUpdateV2 = wpSync.Y.applyUpdateV2;
export const encodeStateVector = wpSync.Y.encodeStateVector;
export const encodeStateAsUpdate = wpSync.Y.encodeStateAsUpdate;
export const encodeStateAsUpdateV2 = wpSync.Y.encodeStateAsUpdateV2;
export const createRelativePositionFromTypeIndex = wpSync.Y.createRelativePositionFromTypeIndex;
export const createAbsolutePositionFromRelativePosition =
	wpSync.Y.createAbsolutePositionFromRelativePosition;
export const Doc = wpSync.Y.Doc;
