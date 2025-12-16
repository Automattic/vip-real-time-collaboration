import plugin from '@automattic/eslint-plugin-wpvip';
import babelPreset from '@babel/preset-react';
import { defineConfig } from 'eslint/config';

export default defineConfig( [
	...plugin.configs.recommended,
	{
		ignores: [
			'*.php',
			'**/build/',
			'**/dist/',
			'**/node_modules/',
			'**/vendor/**',
			'tests/e2e/**',
			'yjs-inspector/**',
		],
	},
	{
		files: [ 'websocket-server/**/*.ts' ],
		ignores: [ 'websocket-server/utils.ts', 'websocket-server/**/*.test.ts' ],
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
		files: [ '**/*.test.ts' ], // Node.js unit tests
		rules: {
			'@typescript-eslint/no-floating-promises': 'off',
		},
	},
	{
		files: [ 'examples/**/*.js' ], // Examples use JSX in .js files
		languageOptions: {
			parserOptions: {
				babelOptions: {
					presets: [ babelPreset ],
				},
				ecmaFeatures: {
					jsx: true,
				},
			},
		},
	},
] );
