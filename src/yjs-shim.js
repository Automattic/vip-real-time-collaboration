/**
 * This file is a shim for loading Yjs from a browser global provided by the
 * `@wordpress/sync` package. Since it is loaded directly by Webpack during the
 * build process (see config.resolve.alias), it must be maintained in JavaScript
 * and not TypeScript.
 *
 * This is done primarily to avoid packaging and importing two different Yjs
 * instances, which would result in this conflict:
 *
 * https://github.com/yjs/yjs/issues/438
 *
 * It also allows us to align on the same Yjs version.
 *
 * Scripts in this repo should directly import 'yjs' which will resolve to this
 * file via Webpack.
 *
 * The unused import of `@wordpress/core-data` is important to ensure that
 * `wp.sync` is laoded and available. It results in `core-data` being added to
 * our scripts dependencies (see `build/index.asset.php`). We cannot use
 * `@wordpress/sync` for this purpose because it is not yet a public package.
 */
import '@wordpress/core-data';

/* global wp */

export default wp.sync.Y;
