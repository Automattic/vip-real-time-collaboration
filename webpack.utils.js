// The exports of `@wordpress/scripts/config/webpack.config` differ depending
// on whether you pass the `--experimental-modules` flag. If you do, it exports
// an array of two configurations instead of a single configuration object.
const [ scriptConfig, moduleConfig ] = require( '@wordpress/scripts/config/webpack.config' );
const path = require( 'path' );

// Check if we're in development mode
const isDevMode = process.env.NODE_ENV !== 'production';

// Path to local Gutenberg packages (only used in development)
const gutenbergPackagesPath = path.resolve( __dirname, '../gutenberg/packages' );

// Packages that should use the local Gutenberg version instead of the WordPress global.
// These are packages with custom modifications that need to be bundled.
// Only applies during local development.
const localGutenbergPackages = isDevMode
	? [ '@wordpress/core-data' ]
	: [];

/**
 * Creates an externals function that excludes specified packages from being
 * treated as externals, allowing them to be bundled from local sources.
 * Only used during local development.
 */
function createExternals( baseExternals, excludePackages ) {
	// If no packages to exclude, just return the base externals
	if ( excludePackages.length === 0 ) {
		return baseExternals;
	}

	return ( { request }, callback ) => {
		// If the request matches one of our excluded packages, don't treat it as external
		if ( excludePackages.some( pkg => request === pkg || request.startsWith( pkg + '/' ) ) ) {
			return callback();
		}

		// Otherwise, use the default externals behavior
		if ( typeof baseExternals === 'function' ) {
			return baseExternals( { request }, callback );
		}

		// Handle object-style externals
		if ( baseExternals && baseExternals[ request ] ) {
			return callback( null, baseExternals[ request ] );
		}

		return callback();
	};
}

// This function modernizes the configuration object to support TypeScript. It
// also allows for additional scripts to be added to the entry point. Blocks are
// included by default, so this is only needed for non-block scripts.
function modernize( config, additionalScripts = {}, additionalPlugins = [], watchOptions = {} ) {
	// Merge base externals with our custom ones
	const baseExternals = {
		...( typeof config.externals === 'object' ? config.externals : {} ),
		// Resolve @wordpress/sync to the global `wp.sync` provided by WordPress.
		'@wordpress/sync': 'wp.sync',

		// Resolve Yjs to the global `wp.sync.Y` provided by the sync package.
		// Since dependencies import 'yjs' directly, we need to avoid importing
		// and packaging two different Yjs instances, which would result in this
		// conflict:
		//
		// https://github.com/yjs/yjs/issues/438
		yjs: 'wp.sync.Y',
	};

	// Build aliases - include local Gutenberg packages only in dev mode
	const aliases = {
		...config.resolve.alias,
		'@': path.resolve( __dirname, 'src/' ),
	};

	// In development, alias local Gutenberg packages for testing custom features
	if ( isDevMode ) {
		aliases[ '@wordpress/core-data' ] = path.resolve( gutenbergPackagesPath, 'core-data/src' );
	}

	return {
		...config,
		entry: {
			...config.entry(),
			...additionalScripts,
		},
		externals: createExternals( baseExternals, localGutenbergPackages ),
		module: {
			rules: config.module.rules.concat( [
				{
					test: /\.tsx?$/,
					use: [
						{
							loader: 'ts-loader',
							options: {
								transpileOnly: true,
							},
						},
					],
				},
			] ),
		},
		plugins: [ ...config.plugins, ...additionalPlugins ],
		resolve: {
			...config.resolve,
			alias: aliases,
		},
		watchOptions: { ...config.watchOptions, ...watchOptions },
	};
}

exports.modernize = modernize;
exports.moduleConfig = moduleConfig;
exports.scriptConfig = scriptConfig;
