const ForkTsCheckerWebpackPlugin = require( 'fork-ts-checker-webpack-plugin' );

const { modernize, moduleConfig, scriptConfig } = require( './webpack.utils' );

// Add watchOptions configuration to reduce file watching load
const watchOptions = {
	ignored: /node_modules/,
	aggregateTimeout: 300,
};

module.exports = [
	modernize(
		scriptConfig,
		[
			// we only need to fork one copy of ts-checker off here in these webpack exports
			new ForkTsCheckerWebpackPlugin(),
		],
		watchOptions
	),
	modernize( moduleConfig, [], watchOptions ),
];
