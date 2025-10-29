require( '@automattic/eslint-plugin-wpvip/init' );

module.exports = {
	extends: [ 'plugin:@automattic/wpvip/recommended' ],
	globals: {
		VIP_RTC: 'readonly',
	},
	overrides: [
		{
			files: [ '*.test.ts' ], // Node.js unit tests
			rules: {
				'@typescript-eslint/no-explicit-any': 'off',
				'@typescript-eslint/no-floating-promises': 'off',
				'@typescript-eslint/no-unsafe-argument': 'off',
				'@typescript-eslint/no-unsafe-assignment': 'off',
			},
		},
		{
			files: [ 'examples/**/*.js' ], // Examples use JSX in .js files
			parserOptions: {
				requireConfigFile: false,
				babelOptions: {
					presets: [ '@babel/preset-react' ],
				},
				ecmaFeatures: {
					jsx: true,
				},
			},
			rules: {
				'no-unused-vars': 'off', // Allow unused vars in example code
			},
		},
		{
			files: [ 'websocket-server/**/*.ts' ], // Websocket server has its own tsconfig
			parserOptions: {
				project: true,
				tsconfigRootDir: __dirname,
			},
			rules: {
				'@typescript-eslint/no-misused-promises': 'off', // ignore the misused promises rule in websocket server code
			},
		},
	],
};
