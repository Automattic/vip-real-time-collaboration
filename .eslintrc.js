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
	],
};
