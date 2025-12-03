require( '@automattic/eslint-plugin-wpvip/init' );

module.exports = {
	extends: [ 'plugin:@automattic/wpvip/recommended' ],
	globals: {
		VIP_RTC: 'readonly',
	},
	overrides: [
		{
			files: [ 'websocket-server/**/*.ts' ],
			excludedFiles: [ 'websocket-server/utils.ts', 'websocket-server/**/*.test.ts' ],
			rules: {
				'no-restricted-imports': [
					'error',
					{
						paths: [
							{
								name: 'jsonwebtoken',
								importNames: [ 'default', 'verify' ],
								message:
									'Use verifyJwtToken from websocket-server/utils instead to ensure algorithm is always specified to prevent algorithm confusion attacks. Named imports other than verify are allowed.',
							},
						],
					},
				],
			},
		},
		{
			files: [ '*.test.ts' ], // Node.js unit tests
			rules: {
				'@typescript-eslint/no-floating-promises': 'off',
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
		},
	],
};
