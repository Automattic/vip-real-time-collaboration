// The exports of `@wordpress/scripts/config/webpack.config` differ depending
// on whether you pass the `--experimental-modules` flag. If you do, it exports
// an array of two configurations instead of a single configuration object.
const [ scriptConfig, moduleConfig ] = require( '@wordpress/scripts/config/webpack.config' );
const path = require( 'path' );

// This function modernizes the configuration object to support TypeScript. It
// also allows for additional scripts to be added to the entry point. Blocks are
// included by default, so this is only needed for non-block scripts.
function modernize( config, additionalScripts = {}, additionalPlugins = [], watchOptions = {} ) {
	return {
		...config,
		entry: {
			...config.entry(),
			...additionalScripts,
		},
		externals: {
			...config.externals,
			// Resolve @wordpress/sync to the global `wp.sync` provided by WordPress.
			'@wordpress/sync': 'wp.sync',

			// Resolve Yjs to the global `wp.sync.Y` provided by the sync package.
			// Since dependencies import 'yhs' directly, we need to avoid importing
			// and packaging two different Yjs instances, which would result in this
			// conflict:
			//
			// https://github.com/yjs/yjs/issues/438
			yjs: 'wp.sync.Y',
		},
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
			alias: {
				...config.resolve.alias,
				'@': path.resolve( __dirname, 'src/' ),
			},
		},
		watchOptions: { ...config.watchOptions, ...watchOptions },
	};
}

exports.modernize = modernize;
exports.moduleConfig = moduleConfig;
exports.scriptConfig = scriptConfig;
