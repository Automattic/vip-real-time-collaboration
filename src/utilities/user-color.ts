import { loadFromLocalStorage, saveToLocalStorage } from './local-storage';

// From Material UI's metro colors
// https://materialui.co/metrocolors
const METRO_COLORS = [
	'#A4C400',
	'#60A917',
	'#008A00',
	'#00ABA9',
	'#1BA1E2',
	'#0050EF',
	'#6A00FF',
	'#AA00FF',
	'#F472D0',
	'#D80073',
	'#A20025',
	'#E51400',
	'#FA6800',
	'#F0A30A',
	'#E3C800',
	// '#825A2C', (Brown)
	// '#6D8764', (Olive)
	'#647687',
	// '#76608A', (Mauve)
	// '#A0522D', (Sienna)
];

const USER_HIGHLIGHT_ALPHA = 0.7; // 0-1.0 to represent opacity
const LOCAL_STORAGE_KEY = 'vip-rtc-preferred-color';

/**
 * Get a unique user color from the list of available metro colors, or generate a random color if none are available.
 * If the previously used color is available from localStorage, use it.
 *
 * @param existingColors - Colors that are already in use.
 * @returns The new user color, in #RGBA or HSL format.
 */
const getNewUserColor = ( existingColors: string[] ) => {
	// Remove the alpha value from the colors.
	existingColors = existingColors.map( color => color.slice( 0, -2 ) );
	const availableColors = METRO_COLORS.filter( color => ! existingColors.includes( color ) );

	if ( availableColors.length === 0 ) {
		// If all colors are used, generate one at random
		const hue = generateRandomInt( 0, 360 );
		const saturation = generateRandomInt( 50, 100 );
		const lightness = generateRandomInt( 45, 95 );
		return `hsla(${ hue }, ${ saturation }%, ${ lightness }%, ${ USER_HIGHLIGHT_ALPHA })`;
	}

	let hexColor = null;

	const preferredColor = loadFromLocalStorage< string | null >( LOCAL_STORAGE_KEY, null );

	if ( preferredColor && availableColors.includes( preferredColor ) ) {
		hexColor = preferredColor;
	} else {
		const randomIndex = generateRandomInt( 0, availableColors.length - 1 );
		hexColor = availableColors[ `${ randomIndex }` ];
		saveToLocalStorage( LOCAL_STORAGE_KEY, hexColor );
	}

	// Convert alpha to hex value between 00 and FF, e.g. 0.7 -> 'B3'
	const alphaHex = Math.round( USER_HIGHLIGHT_ALPHA * 0xff )
		.toString( 16 )
		.padStart( 2, '0' )
		.toUpperCase();

	return `${ hexColor }${ alphaHex }`;
};

/**
 * Generate a random integer between min and max, inclusive.
 *
 * @param min - The minimum value.
 * @param max - The maximum value.
 * @returns A random integer between min and max.
 */
const generateRandomInt = ( min: number, max: number ) => {
	return Math.floor( Math.random() * ( max - min + 1 ) ) + min;
};

export { getNewUserColor };
