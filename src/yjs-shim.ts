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

export default window.wp.sync.Y;
