import { store as blockEditorStore } from '@wordpress/block-editor';
import { createBlock } from '@wordpress/blocks';
import { useSelect, useDispatch } from '@wordpress/data';
import { useState, useEffect, useRef } from '@wordpress/element';

import type { BlockEditorStoreSelectors, BlockEditorStoreActions } from '@wordpress/block-editor';

interface DebugInterfaceProps {
	iframeDocument: Document;
}

function findEditableElement(
	iframeDocument: Document,
	targetBlockId: string
): HTMLElement | null {
	const blockElement = iframeDocument.querySelector( `[data-block="${ targetBlockId }"]` );

	if ( blockElement && blockElement.getAttribute( 'contenteditable' ) === 'true' ) {
		return blockElement as HTMLElement;
	}

	return null;
}

function typeCharacter(
	targetElement: HTMLElement,
	character: string,
	iframeDocument: Document
): void {
	// Because we're editing a contenteditable, we need to manually
	// insert actual text nodes to simulate typing.
	const selection = iframeDocument.getSelection();
	if ( selection && selection.rangeCount > 0 ) {
		const range = selection.getRangeAt( 0 );
		range.deleteContents();
		const textNode = iframeDocument.createTextNode( character );
		range.insertNode( textNode );
		range.setStartAfter( textNode );
		range.setEndAfter( textNode );
		selection.removeAllRanges();
		selection.addRange( range );
	} else {
		// If no selection exists, fall back to end of element
		const range = iframeDocument.createRange();
		range.selectNodeContents( targetElement );
		range.collapse( false );
		const textNode = iframeDocument.createTextNode( character );
		range.insertNode( textNode );
		range.setStartAfter( textNode );
		range.setEndAfter( textNode );
		selection?.removeAllRanges();
		selection?.addRange( range );
	}
}

export function DebugInterface( { iframeDocument }: DebugInterfaceProps ) {
	const [ isTyping, setIsTyping ] = useState( false );
	const [ lastSelectedBlock, setLastSelectedBlock ] = useState< string | null >( null );
	const [ typingSpeed, setTypingSpeed ] = useState( 100 ); // Default 100ms per character
	const typingIntervalRef = useRef< NodeJS.Timeout | null >( null );

	const getSelectedBlockClientId = useSelect< BlockEditorStoreSelectors, () => string | null >(
		select => select( blockEditorStore ).getSelectedBlockClientId
	);
	const selectedBlockClientId = getSelectedBlockClientId();

	const { selectBlock, insertBlock } = useDispatch< BlockEditorStoreActions >( blockEditorStore );

	// Keep track of the last selected block when it changes
	useEffect( () => {
		if ( selectedBlockClientId && ! isTyping ) {
			setLastSelectedBlock( selectedBlockClientId );
		}
	}, [ selectedBlockClientId, isTyping ] );

	// Helper function to ensure we have a block to type in
	const ensureBlockExists = async (): Promise< string | null > => {
		// If we have a last selected block, use it
		if ( lastSelectedBlock ) {
			return lastSelectedBlock;
		}

		// If we have a currently selected block, use it
		if ( selectedBlockClientId ) {
			setLastSelectedBlock( selectedBlockClientId );
			return selectedBlockClientId;
		}

		// Create a new paragraph block
		const newBlock = createBlock( 'core/paragraph' );
		insertBlock( newBlock );

		// The block should now be selected, so we can get its ID
		// We need to wait a tick for the selection to update
		return new Promise( resolve => {
			setTimeout( () => {
				const currentSelection = getSelectedBlockClientId();

				if ( currentSelection ) {
					setLastSelectedBlock( currentSelection );
					resolve( currentSelection );
				} else {
					resolve( null );
				}
			}, 10 );
		} );
	};

	const startTypingInterval = ( targetBlockId: string ) => {
		let charIndex = 0;
		let currentLineIndex = 0;
		let currentLine: string =
			loremIpsumLines[ Math.floor( Math.random() * loremIpsumLines.length ) ] || '';

		// Re-select the block when we start typing
		selectBlock( targetBlockId );

		typingIntervalRef.current = setInterval( () => {
			// Find the editable element
			const targetElement = findEditableElement( iframeDocument, targetBlockId );

			if ( ! targetElement ) {
				setIsTyping( false );
				return;
			}

			// Focus the element if it's not already focused
			if ( iframeDocument.activeElement !== targetElement ) {
				targetElement.focus();
			}

			// Get the next character from the current line
			let nextChar = currentLine[ charIndex ];

			// If we've reached the end of the current line, pick a new random line
			if ( ! nextChar ) {
				currentLine = loremIpsumLines[ Math.floor( Math.random() * loremIpsumLines.length ) ] || '';
				charIndex = 0;
				nextChar = currentLine[ charIndex ];

				// Add a space between sentences
				if ( currentLineIndex > 0 ) {
					typeCharacter( targetElement, ' ', iframeDocument );
				}
				currentLineIndex++;
			}

			if ( ! nextChar ) {
				return;
			}

			// Type the character
			typeCharacter( targetElement, nextChar, iframeDocument );
			charIndex++;
		}, typingSpeed );
	};

	useEffect( () => {
		if ( isTyping ) {
			// Ensure we have a block to type in
			ensureBlockExists()
				.then( targetBlockId => {
					if ( ! targetBlockId ) {
						setIsTyping( false );
						return;
					}
					startTypingInterval( targetBlockId );
				} )
				.catch( () => {
					setIsTyping( false );
				} );
		} else if ( typingIntervalRef.current ) {
			clearInterval( typingIntervalRef.current );
			typingIntervalRef.current = null;
		}

		return () => {
			if ( typingIntervalRef.current ) {
				clearInterval( typingIntervalRef.current );
			}
		};
	}, [ isTyping, typingSpeed, iframeDocument, selectBlock, insertBlock ] );

	const handleCheckboxChange = ( event: React.ChangeEvent< HTMLInputElement > ) => {
		setIsTyping( event.target.checked );
	};

	const handleSpeedChange = ( event: React.ChangeEvent< HTMLInputElement > ) => {
		setTypingSpeed( parseInt( event.target.value, 10 ) );
	};

	const handleSpeedReset = () => {
		setTypingSpeed( 100 );
	};

	return (
		<div className="vip-real-time-collaboration-debug-interface">
			<div className="vip-real-time-collaboration-debug-header">Debug Tools</div>
			<label>
				<input type="checkbox" checked={ isTyping } onChange={ handleCheckboxChange } />
				<span>Start typing</span>
			</label>
			{ isTyping && (
				<div className="vip-real-time-collaboration-debug-speed">
					<div className="vip-real-time-collaboration-debug-speed-header">
						<span>Speed:</span>
						<button
							type="button"
							onClick={ handleSpeedReset }
							className="vip-real-time-collaboration-debug-reset"
						>
							Reset
						</button>
					</div>
					<input
						type="range"
						min="50"
						max="1000"
						value={ typingSpeed }
						onChange={ handleSpeedChange }
						className="vip-real-time-collaboration-debug-slider"
					/>
					<div className="vip-real-time-collaboration-debug-speed-value">
						{ typingSpeed }ms per character
					</div>
				</div>
			) }
		</div>
	);
}

const loremIpsumLines = [
	'Lorem ipsum dolor sit amet, consectetur adipiscing elit. ',
	'Suspendisse sem leo, gravida id nulla at, blandit laoreet risus. ',
	'Pellentesque velit justo, ullamcorper a ante nec, efficitur vulputate tortor. ',
	'Etiam sem dui, mollis vitae felis nec, sagittis facilisis libero. ',
	'Fusce justo tellus, consequat id enim eu, lacinia euismod lorem. ',
	'Donec faucibus varius aliquam. ',
	'Maecenas sit amet nisl ac sem pulvinar consequat vel a metus. ',
	'Suspendisse potenti. ',
	'Morbi blandit, enim vitae blandit malesuada, enim lorem accumsan nibh, nec maximus tellus quam vitae dui. ',
	'Curabitur lacinia, lectus et eleifend pretium, leo ante tincidunt quam, nec cursus tellus sem id odio. ',
	'Morbi eget nisl ligula. ',
	'Proin eget neque eget felis interdum dignissim. ',
	'Ut justo augue, accumsan eu efficitur et, placerat non ex. ',
	'Nullam id gravida risus. ',
	'Etiam vitae tortor vel nisl imperdiet mollis sed quis tortor. ',
	'Donec velit quam, elementum eu nibh in, convallis vehicula erat. ',
	'Sed viverra accumsan justo, eu egestas quam vehicula non. ',
	'Cras egestas consequat erat, ut laoreet massa ornare ut. ',
	'Vivamus vitae consequat arcu. ',
	'In at mollis libero, quis convallis elit. ',
	'Mauris bibendum mauris odio, et condimentum nisi convallis eu. ',
	'Mauris pharetra metus id laoreet tempor. ',
	'Sed gravida massa quis risus laoreet iaculis. ',
	'Donec non eros gravida nisl sodales porta. ',
	'Nullam a pellentesque tortor. ',
	'Curabitur rhoncus consectetur mauris ut ornare. ',
	'Vestibulum quis posuere enim. ',
	'Fusce id orci pharetra enim vestibulum imperdiet et ut nunc. ',
	'Mauris tempus arcu et est aliquet, sit amet tincidunt felis ultricies. ',
	'Curabitur in lorem lorem. ',
];
