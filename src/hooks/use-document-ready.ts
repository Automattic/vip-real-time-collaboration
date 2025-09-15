import { useEffect, useState } from '@wordpress/element';

/**
 * Hook that tracks whether a document is ready. We use this instead
 * of `domReady()` from WordPress because it allows us to specify
 * which document to check, useful for iframe documents.
 *
 * @param document - The document to check for readiness
 * @returns boolean indicating if the document is ready
 */
export function useDocumentReady( document?: Document | null ): boolean {
	const [ isReady, setIsReady ] = useState( false );

	useEffect( () => {
		if ( ! document ) {
			setIsReady( false );
			return;
		}

		const onReady = (): void => setIsReady( true );

		if ( 'loading' !== document.readyState ) {
			onReady();
			return;
		}

		setIsReady( false );

		document.addEventListener( 'DOMContentLoaded', onReady );

		return () => document.removeEventListener( 'DOMContentLoaded', onReady );
	}, [ document ] );

	return isReady;
}
