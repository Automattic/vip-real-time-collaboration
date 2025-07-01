import { store as blockEditorStore } from '@wordpress/block-editor';
import { createHigherOrderComponent } from '@wordpress/compose';
import { useSelect } from '@wordpress/data';
import { createElement, useEffect, useState } from '@wordpress/element';

import type * as awarenessProtocol from 'y-protocols/awareness.js';

interface BlockEditProps {
	clientId: string;
	name: string;
	isSelected: boolean;
	attributes: Record< string, unknown >;
	setAttributes: ( attributes: Record< string, unknown > ) => void;
}

type BlockEditComponent = ( props: BlockEditProps ) => JSX.Element;

interface User {
	id: number;
	name: string;
	url: string;
	description: string;
	link: string;
	slug: string;
	avatar_urls: {
		[ size: string ]: string;
	};
}

interface UserAwarenessState {
	user: User;
	selectedBlockId?: string;
}

type AwarenessStates = Map< number, UserAwarenessState >;

interface AwarenessData {
	blocksSelected: Map< string, User[] >; // clientId -> array of users who have it selected
	allUsers: User[];
	isBlockHighlighted: ( clientId: string ) => boolean; // Helper function to check if block should be highlighted
}

/**
 * React hook that subscribes to awareness protocol events and returns
 * information about blocks selected by other users.
 */
function useAwareness( awareness: awarenessProtocol.Awareness ): AwarenessData {
	const [ awarenessData, setAwarenessData ] = useState< AwarenessData >( {
		blocksSelected: new Map(),
		allUsers: [],
		isBlockHighlighted: () => false,
	} );

	useEffect( () => {
		const updateAwarenessData = () => {
			const states: AwarenessStates = awareness.getStates() as AwarenessStates;
			const currentClientId = awareness.clientID;

			const blocksSelected = new Map< string, User[] >();
			const allUsers: User[] = [];

			// Process all awareness states
			states.forEach( ( state, clientId ) => {
				if ( ! state?.user ) {
					return;
				}

				// Add to all users if not current user
				if ( clientId !== currentClientId ) {
					allUsers.push( state.user );
				}

				// If this user has a selected block, track it
				if ( state.selectedBlockId ) {
					const existingUsers = blocksSelected.get( state.selectedBlockId ) || [];
					existingUsers.push( state.user );
					blocksSelected.set( state.selectedBlockId, existingUsers );
				}
			} );

			// Helper function to check if a block should be highlighted
			const isBlockHighlighted = ( clientId: string ): boolean => {
				return blocksSelected.has( clientId );
			};

			setAwarenessData( {
				blocksSelected,
				allUsers,
				isBlockHighlighted,
			} );
		};

		// Initial data load
		updateAwarenessData();

		// Subscribe to awareness changes
		const onAwarenessChange = ( {
			added: _added,
			updated: _updated,
			removed: _removed,
		}: {
			added: Array< number >;
			updated: Array< number >;
			removed: Array< number >;
		} ) => {
			// Update awareness data on any change
			updateAwarenessData();
		};

		awareness.on( 'change', onAwarenessChange );

		// Cleanup subscription
		return () => {
			if ( awareness ) {
				awareness.off( 'change', onAwarenessChange );
			}
		};
	}, [] );

	return awarenessData;
}

const colors = [
	'6929c4',
	'1192e8',
	'005d5d',
	'9f1853',
	'fa4d56',
	'570408',
	'198038',
	'002d9c',
	'ee538b',
	'b28600',
	'009d9a',
	'012749',
	'8a3800',
	'a56eff',
];

/**
 * Creates a higher-order component that tracks block selection.
 */
function createSelectionTracker( awareness: awarenessProtocol.Awareness ) {
	return createHigherOrderComponent( ( BlockEdit: BlockEditComponent ) => {
		return ( props: BlockEditProps ) => {
			// Get the currently selected block ID from the block editor store
			const { isSelected, hasMultiSelection } = useSelect(
				select => {
					const blockEditorSelect = select( blockEditorStore ) as {
						isBlockSelected: ( clientId: string ) => boolean;
						hasMultiSelection: () => boolean;
					};

					return {
						isSelected: blockEditorSelect.isBlockSelected( props.clientId ),
						hasMultiSelection: blockEditorSelect.hasMultiSelection(),
					};
				},
				[ props.clientId ]
			);

			// Determine if this block should be considered selected by current user
			const shouldBeSelected = isSelected && ! hasMultiSelection;

			// Update awareness with current user's selected block
			useEffect( () => {
				if ( shouldBeSelected ) {
					console.log( 'Set selectedBlockId to', props.clientId );
					awareness.setLocalStateField( 'selectedBlockId', props.clientId );
				} else {
					// Only clear if this was the selected block
					const currentState = awareness.getLocalState() as UserAwarenessState | null;
					if ( currentState?.selectedBlockId === props.clientId ) {
						console.log( 'Clearing selectedBlockId' );
						awareness.setLocalStateField( 'selectedBlockId', null );
					}
				}
			}, [ props.clientId, shouldBeSelected ] );

			// Clean up awareness state when component unmounts
			useEffect( () => {
				return () => {
					const currentState = awareness.getLocalState() as UserAwarenessState | null;
					if ( currentState?.selectedBlockId === props.clientId ) {
						awareness.setLocalStateField( 'selectedBlockId', null );
					}
				};
			}, [ props.clientId ] );

			return createElement( BlockEdit, props );
		};
	}, 'withSelectionTracker' );
}

/**
 * Creates a higher-order component that applies visual highlighting.
 */
function createVisualHighlight( awareness: awarenessProtocol.Awareness ) {
	return createHigherOrderComponent( ( BlockEdit: BlockEditComponent ) => {
		return ( props: BlockEditProps ) => {
			// Use awareness hook to get highlighting state
			const { isBlockHighlighted } = useAwareness( awareness );
			const isHighlighted = isBlockHighlighted( props.clientId );

			// Create inline styles for the focus border
			const focusStyles = isHighlighted
				? {
						boxShadow: 'inset 0 0 0 5px #ff0000',
						borderRadius: '2px',
						position: 'relative' as const,
				  }
				: {};

			return createElement(
				'div',
				{
					style: focusStyles,
					className: isHighlighted ? 'vip-rtc-block-focused' : '',
				},
				createElement( BlockEdit, props )
			);
		};
	}, 'withVisualHighlight' );
}

/**
 * Creates the combined HOC that applies both selection tracking and visual highlighting.
 */
function createFocusBorder( awareness: awarenessProtocol.Awareness ) {
	const withSelectionTracker = createSelectionTracker( awareness );
	const withVisualHighlight = createVisualHighlight( awareness );

	return createHigherOrderComponent( ( BlockEdit: BlockEditComponent ) => {
		const TrackedBlockEdit = withSelectionTracker( BlockEdit );
		const HighlightedBlockEdit = withVisualHighlight( TrackedBlockEdit );
		return HighlightedBlockEdit;
	}, 'withFocusBorder' );
}

/**
 * Function to register the HOC with WordPress hooks.
 * Call this to enable the focus border functionality for all blocks.
 */
export function initializeBlockWrapper( awareness: awarenessProtocol.Awareness ) {
	const { addFilter } = require( '@wordpress/hooks' );

	// Create the HOC with the provided awareness instance
	const withFocusBorder = createFocusBorder( awareness );

	// Add the HOC to all block edit components
	addFilter( 'editor.BlockEdit', 'vip-realtime-collaboration/with-focus-border', withFocusBorder );
}

// Export the HOC creators for separate use if needed
export { createSelectionTracker, createVisualHighlight, createFocusBorder, useAwareness };
