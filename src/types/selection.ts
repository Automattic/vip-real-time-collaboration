/**
 * Selection types for block editor awareness state.
 *
 * These values must match the SelectionType enum defined in @wordpress/core-data.
 * We define them locally because the enum needs to be available at runtime,
 * but in production builds @wordpress/core-data resolves to the WordPress
 * global (wp.coreData) which doesn't include this custom enum.
 */
export enum SelectionType {
	None = 'none',
	Cursor = 'cursor',
	SelectionInOneBlock = 'selection-in-one-block',
	SelectionInMultipleBlocks = 'selection-in-multiple-blocks',
	WholeBlock = 'whole-block',
}
