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
	// '#825A2C', (brown)
	'#6D8764',
	'#647687',
	'#76608A',
	'#A0522D',
];

const USER_HIGHLIGHT_ALPHA = 0.7; // 0-1.0 to represent opacity

/**
 * Get a unique user color.
 *
 * @param existingColors - Colors that are already in use.
 * @returns The new user color, in #RGBA or HSL format.
 */
const getNewUserColor = ( existingColors: string[] ) => {
	const availableColors = METRO_COLORS.filter( color => ! existingColors.includes( color ) );
	// Get a random color from the available colors

	if ( availableColors.length === 0 ) {
		// If all colors are used, generate one at random
		const hue = generateRandomInt( 0, 360 );
		const saturation = generateRandomInt( 50, 100 );
		const lightness = generateRandomInt( 45, 95 );
		return `hsla(${ hue }, ${ saturation }%, ${ lightness }%, ${ USER_HIGHLIGHT_ALPHA }%)`;
	}

	const randomIndex = Math.floor( Math.random() * availableColors.length );
	const hexColor = availableColors[ `${ randomIndex }` ];

	// Convert alpha to hex value between 00 and FF, e.g. 0.7 -> 'B3'
	const alphaHex = Math.round( USER_HIGHLIGHT_ALPHA * 0xff )
		.toString( 16 )
		.padStart( 2, '0' )
		.toUpperCase();

	return `${ hexColor }${ alphaHex }`;
};

const generateRandomInt = ( min: number, max: number ) => {
	return Math.floor( Math.random() * ( max - min + 1 ) ) + min;
};

export { getNewUserColor };
