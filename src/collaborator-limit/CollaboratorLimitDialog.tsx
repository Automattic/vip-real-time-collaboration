import apiFetch from '@wordpress/api-fetch';
import { Button, Flex, FlexItem, Modal } from '@wordpress/components';
import { useSelect } from '@wordpress/data';
import { useEffect, useRef, useState } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';

import { submitUpgradeTicket, type UpgradeTicketContext } from './submit-upgrade-ticket';
import {
	COLLABORATOR_LIMIT,
	COLLABORATOR_LIMIT_TIER,
	CONTACT_AJAX,
	SUPPORT_EMAIL,
} from '@/utilities/config';
import { Logger } from '@/utilities/logger';

interface SyncConnectionStatus {
	error?: { code?: string };
}

interface CurrentUser {
	name?: string;
	email?: string;
}

interface SiteData {
	title?: string;
	url?: string;
}

const TARGET_ERROR_CODE = 'connection-limit-exceeded';

type DialogState = 'idle' | 'submitting' | 'success';

function navigateToPostsList( postTypeSlug?: string ): void {
	const path =
		postTypeSlug && postTypeSlug !== 'post'
			? `/wp-admin/edit.php?post_type=${ encodeURIComponent( postTypeSlug ) }`
			: '/wp-admin/edit.php';
	window.location.href = path;
}

export function CollaboratorLimitDialog(): JSX.Element | null {
	const errorCode = useSelect( select => {
		const core = select( 'core' ) as unknown as {
			getSyncConnectionStatus?: () => SyncConnectionStatus | undefined;
		};
		return core.getSyncConnectionStatus?.()?.error?.code;
	}, [] );

	const currentUser = useSelect( select => {
		const core = select( 'core' );
		const getter = (
			core as unknown as {
				getCurrentUser?: () => CurrentUser | undefined;
			}
		 ).getCurrentUser;
		return getter ? getter() : undefined;
	}, [] );

	const siteData = useSelect( select => {
		const core = select( 'core' );
		const getter = (
			core as unknown as {
				getSite?: () => SiteData | undefined;
			}
		 ).getSite;
		return getter ? getter() : undefined;
	}, [] );

	const postTypeSlug = useSelect( select => {
		const editor = select( 'core/editor' ) as unknown as {
			getCurrentPostType?: () => string | undefined;
		};
		return editor.getCurrentPostType?.();
	}, [] );

	const [ state, setState ] = useState< DialogState >( 'idle' );
	const telemetryFired = useRef( false );

	const isLimitExceeded = errorCode === TARGET_ERROR_CODE;

	useEffect( () => {
		if ( ! isLimitExceeded || telemetryFired.current ) {
			return;
		}
		telemetryFired.current = true;
		apiFetch( {
			path: '/vip-rtc/v1/telemetry/limit-dialog',
			method: 'POST',
		} ).catch( error => {
			new Logger().warn( 'VIP RTC: failed to record limit-dialog telemetry.', error );
		} );
	}, [ isLimitExceeded ] );

	if ( ! isLimitExceeded ) {
		return null;
	}

	const tier = COLLABORATOR_LIMIT_TIER ?? 'Standard';
	const limit = COLLABORATOR_LIMIT ?? 10;

	const handleUpgradeClick = async (): Promise< void > => {
		setState( 'submitting' );

		const context: UpgradeTicketContext = {
			siteName: siteData?.title ?? '',
			siteUrl: siteData?.url ?? window.location.origin,
			userName: currentUser?.name ?? '',
			userEmail: currentUser?.email ?? '',
			currentTier: tier,
			collaboratorLimit: limit,
			contactAjax: CONTACT_AJAX,
			supportEmail: SUPPORT_EMAIL ?? 'support@wpvip.com',
		};

		const outcome = await submitUpgradeTicket( context );

		if ( outcome === 'submitted' ) {
			setState( 'success' );
		} else {
			// For mailto: fallback the browser will navigate to the mail client;
			// reset to idle so the dialog is usable if the navigation is cancelled.
			setState( 'idle' );
		}
	};

	const title =
		state === 'success'
			? __( 'Request sent', 'vip-real-time-collaboration' )
			: sprintf(
					/* translators: %s: marketing tier name, e.g. "Standard". */
					__( 'Your team has reached the %s collaboration limit', 'vip-real-time-collaboration' ),
					tier
			  );

	return (
		<Modal
			title={ title }
			isDismissible={ false }
			shouldCloseOnClickOutside={ false }
			shouldCloseOnEsc={ false }
			onRequestClose={ () => {
				/* dialog is non-dismissible */
			} }
		>
			{ state === 'success' ? (
				<>
					<p>
						{ __(
							"Your request has been sent to our account team, via ticket. If you don't have access to tickets, please contact your site administrator.",
							'vip-real-time-collaboration'
						) }
					</p>
					<Flex justify="flex-end">
						<FlexItem>
							<Button variant="primary" onClick={ () => navigateToPostsList( postTypeSlug ) }>
								{ __( 'Back to Posts', 'vip-real-time-collaboration' ) }
							</Button>
						</FlexItem>
					</Flex>
				</>
			) : (
				<>
					<p>
						{ sprintf(
							/* translators: %d: number of real-time collaborators allowed on the site. */
							__(
								'Your current package supports up to %d real-time collaborators. Upgrade your plan to add capacity, boost your site engagement, and accelerate ticket response times.',
								'vip-real-time-collaboration'
							),
							limit
						) }
					</p>
					<Flex justify="flex-end" gap={ 3 }>
						<FlexItem>
							<Button variant="tertiary" onClick={ () => navigateToPostsList( postTypeSlug ) }>
								{ __( 'Back to Posts', 'vip-real-time-collaboration' ) }
							</Button>
						</FlexItem>
						<FlexItem>
							<Button
								variant="primary"
								isBusy={ state === 'submitting' }
								disabled={ state === 'submitting' }
								onClick={ () => {
									void handleUpgradeClick();
								} }
							>
								{ __( 'Upgrade Plan', 'vip-real-time-collaboration' ) }
							</Button>
						</FlexItem>
					</Flex>
				</>
			) }
		</Modal>
	);
}
