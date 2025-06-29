const ForkTsCheckerWebpackPlugin = require( 'fork-ts-checker-webpack-plugin' );

const additionalScripts = {
	index: './src/index',
};

const { modernize, moduleConfig, scriptConfig } = require( './webpack.utils' );

// Add watchOptions configuration to reduce file watching load
const watchOptions = {
	ignored: /node_modules/,
	aggregateTimeout: 300,
};

module.exports = [
	modernize( scriptConfig, additionalScripts, [ new ForkTsCheckerWebpackPlugin() ], watchOptions ),
	modernize( moduleConfig, {}, [], watchOptions ),
];
