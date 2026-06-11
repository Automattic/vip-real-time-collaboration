import { Logger } from '@/utilities/logger';

export type UpgradeTicketOutcome = 'submitted' | 'mailto';

export interface ContactAjaxConfig {
	url: string;
	nonce: string;
}

interface ContactAjaxResponse {
	status?: string;
}

export interface UpgradeTicketContext {
	siteName: string;
	siteUrl: string;
	userName: string;
	userEmail: string;
	contactAjax: ContactAjaxConfig | null;
	supportEmail: string;
}

function buildSubject( context: UpgradeTicketContext ): string {
	return `[VIP RTC] Collaborator limit upgrade request — ${ context.siteName || context.siteUrl }`;
}

function buildBody( context: UpgradeTicketContext ): string {
	return [
		`A user on ${ context.siteUrl } has reached the real-time collaboration limit ` +
			'and would like to upgrade.',
		'',
		`Site: ${ context.siteUrl }`,
		`Requested by: ${ context.userName } <${ context.userEmail }>`,
	].join( '\n' );
}

function openMailtoFallback( context: UpgradeTicketContext ): void {
	const subject = encodeURIComponent( buildSubject( context ) );
	const body = encodeURIComponent( buildBody( context ) );
	window.location.href = `mailto:${ context.supportEmail }?subject=${ subject }&body=${ body }`;
}

/**
 * Submit a pre-populated support ticket via the vip-dashboard contact form
 * handler. Falls back to a mailto: link when the handler isn't available or
 * the request fails.
 */
export async function submitUpgradeTicket(
	context: UpgradeTicketContext
): Promise< UpgradeTicketOutcome > {
	if ( ! context.contactAjax ) {
		openMailtoFallback( context );
		return 'mailto';
	}

	const params = new URLSearchParams();
	params.set( 'action', 'vip_contact' );
	params.set( 'name', context.userName );
	params.set( 'email', context.userEmail );
	params.set( 'subject', buildSubject( context ) );
	params.set( 'body', buildBody( context ) );
	params.set( 'priority', 'Medium' );

	const url = `${ context.contactAjax.url }?action=vip_contact&_wpnonce=${ encodeURIComponent(
		context.contactAjax.nonce
	) }`;

	try {
		const response = await fetch( url, {
			method: 'POST',
			credentials: 'same-origin',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: params.toString(),
		} );

		if ( ! response.ok ) {
			new Logger().warn(
				`VIP RTC: vip_contact handler returned ${ response.status }; falling back to mailto:.`
			);
			openMailtoFallback( context );
			return 'mailto';
		}

		const result = ( await response.json() ) as ContactAjaxResponse;
		if ( result.status !== 'success' ) {
			new Logger().warn(
				'VIP RTC: vip_contact handler reported failure; falling back to mailto:.'
			);
			openMailtoFallback( context );
			return 'mailto';
		}

		return 'submitted';
	} catch ( error ) {
		new Logger().warn( 'VIP RTC: vip_contact request failed; falling back to mailto:.', error );
		openMailtoFallback( context );
		return 'mailto';
	}
}
