const { modernize, moduleConfig, scriptConfig } = require( './webpack.utils' );

// Add watchOptions configuration to reduce file watching load
const watchOptions = {
	ignored: /node_modules/,
	aggregateTimeout: 300,
};

module.exports = [
	modernize( scriptConfig, [], watchOptions ),
	modernize( moduleConfig, [], watchOptions ),
];
