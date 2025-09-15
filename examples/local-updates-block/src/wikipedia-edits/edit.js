/**
 * External dependencies
 */
import { __ } from '@wordpress/i18n';
import { useBlockProps } from '@wordpress/block-editor';
import { Button } from '@wordpress/components';
import { useState, useEffect } from '@wordpress/element';

/**
 * A block that displays recent Wikipedia edits. It allows the user to refresh
 * that list and connected peers will also see the updated list.
 *
 * It does this by setting a `lastUpdated` block attribute to the current timestamp whenever
 * the user clicks the refresh button. This triggers a re-fetch of the data.
 * Peers see the updated `lastUpdated` attribute and also re-fetch the data (plugging
 * into the `rcstart` parameter of the Wikipedia API).
 *
 * Users should see hyperlinked titles of the most recent edits to Wikipedia articles.
 */

// Example request URL:
// https://en.wikipedia.org/w/api.php?action=query&list=recentchanges&rclimit=10&format=json&rcnamespace=0&rctype=edit&&rcstart=2025-09-01T12:00:00Z&rcdir=older

/**
 * Fetches recent Wikipedia edits from the API
 * @param {string} startTime - ISO timestamp to start fetching from
 * @returns {Promise<Array>} Array of recent changes
 */
async function fetchWikipediaEdits( startTime = null ) {
	const baseUrl = 'https://en.wikipedia.org/w/api.php';
	const params = new URLSearchParams( {
		action: 'query',
		format: 'json',
		list: 'recentchanges',
		origin: '*', // Required for CORS
		rcdir: 'older',
		rclimit: '10',
		rcnamespace: '0',
		rctype: 'edit',
	} );

	if ( startTime ) {
		params.append( 'rcstart', startTime );
	}

	try {
		const response = await fetch( `${ baseUrl }?${ params }` );
		const data = await response.json();
		return data.query?.recentchanges || [];
	} catch ( error ) {
		console.error( 'Failed to fetch Wikipedia edits:', error );
		return [];
	}
}

export function Edit( { attributes, setAttributes } ) {
	const { lastUpdated } = attributes;
	const blockProps = useBlockProps();
	const [ edits, setEdits ] = useState( [] );
	const [ isLoading, setIsLoading ] = useState( false );
	const [ error, setError ] = useState( null );

	// Load edits when lastUpdated changes or on initial load
	useEffect( () => {
		async function loadEdits() {
			setIsLoading( true );
			setError( null );

			try {
				const startTime = lastUpdated || null;
				const fetchedEdits = await fetchWikipediaEdits( startTime );
				setEdits( fetchedEdits );
			} catch ( err ) {
				setError( __( 'Failed to load Wikipedia edits' ) );
				console.error( err );
			} finally {
				setIsLoading( false );
			}
		}

		void loadEdits();
	}, [ lastUpdated ] );

	// Handle refresh button click
	const handleRefresh = () => {
		setAttributes( { lastUpdated: new Date().toISOString() } );
	};

	return (
		<div { ...blockProps }>
			<div style={ { marginBottom: '1rem' } }>
				<h3>{ __( 'Recent Wikipedia Edits' ) }</h3>
				<Button
					variant="secondary"
					onClick={ handleRefresh }
					isBusy={ isLoading }
					disabled={ isLoading }
				>
					{ isLoading ? __( 'Refreshing...' ) : __( 'Refresh' ) }
				</Button>
			</div>

			{ error && (
				<div style={ { color: '#d63638', marginBottom: '1rem' } }>
					{ error }
				</div>
			) }

			{ isLoading && ! error && (
				<div>{ __( 'Loading Wikipedia edits...' ) }</div>
			) }

			{ ! isLoading && ! error && edits.length === 0 && (
				<div>{ __( 'No recent edits found.' ) }</div>
			) }

			{ ! isLoading && ! error && edits.length > 0 && (
				<ul style={ { listStyle: 'disc', paddingLeft: '1.5rem' } }>
					{ edits.map( ( edit ) => (
						<li
							key={ edit.rcid }
							style={ { marginBottom: '0.5rem' } }
						>
							<a
								href={ `https://en.wikipedia.org/wiki/${ encodeURIComponent(
									edit.title
								) }` }
								target="_blank"
								rel="noopener noreferrer"
							>
								{ edit.title }
							</a>
							<span
								style={ {
									color: '#757575',
									fontSize: '0.9em',
									marginLeft: '0.5rem',
								} }
							>
								({ new Date( edit.timestamp ).toLocaleString() }
								)
							</span>
						</li>
					) ) }
				</ul>
			) }

			{ lastUpdated && (
				<div
					style={ {
						fontSize: '0.8em',
						color: '#757575',
						marginTop: '1rem',
					} }
				>
					{ __( 'Last updated:' ) }{ ' ' }
					{ new Date( lastUpdated ).toLocaleString() }
				</div>
			) }
		</div>
	);
}
