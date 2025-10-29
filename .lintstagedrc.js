module.exports = {
	'*.css': [ 'npm run lint:css' ],
	// This is needed because passing in files to tsc, means that
	// the tsconfig.json is ignored and thus project settings are not applied.
	// Lint-staged always passes in the files to the commands, so we have to force it
	// to skip sending those files by using a function here.
	// https://github.com/lint-staged/lint-staged/issues/825
	// https://github.com/microsoft/TypeScript/issues/6591
	'*.{js,jsx,ts,tsx}': [ () => 'npm run lint' ],
	'*.php': [ 'npm run lint:php' ],
	'*.{js,json,jsx,md,ts,tsx,yml,yaml}': [ 'npm run format:check' ],
};
