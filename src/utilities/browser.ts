export function getBrowserName() {
	const userAgent = window.navigator.userAgent;
	let browserName = 'Unknown';

	if ( userAgent.includes( 'Firefox' ) ) {
		browserName = 'Firefox';
	} else if ( userAgent.includes( 'Edg' ) ) {
		browserName = 'Microsoft Edge';
	} else if ( userAgent.includes( 'Chrome' ) && ! userAgent.includes( 'Edg' ) ) {
		browserName = 'Chrome';
	} else if ( userAgent.includes( 'Safari' ) && ! userAgent.includes( 'Chrome' ) ) {
		browserName = 'Safari';
	} else if ( userAgent.includes( 'MSIE' ) || userAgent.includes( 'Trident' ) ) {
		browserName = 'Internet Explorer';
	} else if ( userAgent.includes( 'Opera' ) || userAgent.includes( 'OPR' ) ) {
		browserName = 'Opera';
	}

	return browserName;
}
