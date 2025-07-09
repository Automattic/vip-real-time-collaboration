( function ( wp ) {
	wp.data.dispatch( 'core/notices' ).createNotice(
		'warning',
		'Post lock overridden.', // Temp placeholder, could be used for indicating users or number of users editing.
		{
			isDismissible: true,
		}
	);
} )( window.wp );
