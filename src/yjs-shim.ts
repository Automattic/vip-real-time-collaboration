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

// To avoid issues with default exports, you must individually export the
// properties you need, including those used by dependencies.
export const applyUpdate = window.wp.sync.Y.applyUpdate;
export const encodeStateVector = window.wp.sync.Y.encodeStateVector;
export const encodeStateAsUpdate = window.wp.sync.Y.encodeStateAsUpdate;
export const Doc = window.wp.sync.Y.Doc;

// Additions
export const decodeUpdate = window.wp.sync.Y.decodeUpdate;
export const decodeStateVector = window.wp.sync.Y.decodeStateVector;
