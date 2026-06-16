import apiFetch from '@wordpress/api-fetch';
import { serialize, type Block } from '@wordpress/blocks';
import {
	Button,
	Modal,
	__experimentalHStack as HStack,
	__experimentalVStack as VStack,
} from '@wordpress/components';
import { useCopyToClipboard } from '@wordpress/compose';
import { select, useSelect } from '@wordpress/data';
import { useEffect, useRef, useState } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';

import { submitUpgradeTicket, type UpgradeTicketContext } from '@/components/submit-upgrade-ticket';
import { CUSTOM_MODAL_ERROR_CODES } from '@/constants/sync-errors';
import { CAPABILITIES, CONTACT_AJAX, SUPPORT_EMAIL } from '@/utilities/config';
import { Logger } from '@/utilities/logger';
import { getCoreDataSelectors } from '@/utilities/sync-connection-status';

import type { ConnectionErrorCode } from '@wordpress/sync';

interface EditorStore {
	getCurrentPostType?: () => string | null;
}

interface BlockEditorStore {
	getBlocks?: () => Block[];
}

interface CoreUserSiteStore {
	getCurrentUser?: () => { name?: string; email?: string } | undefined;
	getSite?: () => { title?: string; url?: string } | undefined;
}

interface ConnectionErrorMessage {
	title: string;
	body: string;
}

// The upgrade CTA only makes sense for the environment's collaborator limit
// (4003); the connection limit (4002) is transient server capacity that an
// upgrade wouldn't resolve.
const UPGRADE_ERROR_CODE: ConnectionErrorCode = 'collaborator-limit-exceeded';

type UpgradeState = 'idle' | 'submitting' | 'success';

function getConnectionErrorMessage(
	errorCode: ConnectionErrorCode | undefined,
	isAdmin: boolean
): ConnectionErrorMessage {
	if ( errorCode === 'room-connection-limit-exceeded' ) {
		// Client-side per-room connection cap. This yield is terminal — the
		// client does not auto-reconnect — so the copy must not promise a retry.
		return {
			title: __( 'Too many open connections', 'vip-real-time-collaboration' ),
			body: __(
				'This page has reached its active collaborator limit.',
				'vip-real-time-collaboration'
			),
		};
	}

	if ( errorCode === 'collaborator-limit-exceeded' ) {
		return {
			title: __( 'Collaborator limit reached', 'vip-real-time-collaboration' ),
			body: isAdmin
				? __(
						"This environment has reached its active collaborator limit. We'll keep trying to reconnect automatically. To change this limit, contact your WordPress VIP Relationship Manager.",
						'vip-real-time-collaboration'
				  )
				: __(
						"This environment has reached its active collaborator limit. We'll keep trying to reconnect automatically.",
						'vip-real-time-collaboration'
				  ),
		};
	}

	return {
		title: __( 'Connection limit reached', 'vip-real-time-collaboration' ),
		body: isAdmin
			? __(
					"The collaboration server for this environment is at capacity. We'll keep trying to reconnect automatically. To change this limit, contact your WordPress VIP Relationship Manager.",
					'vip-real-time-collaboration'
			  )
			: __(
					"The collaboration server for this environment is at capacity. We'll keep trying to reconnect automatically.",
					'vip-real-time-collaboration'
			  ),
	};
}

export function CollaborationLimitModal() {
	const { connectionStatus, postType, currentUser, site } = useSelect( selectFn => {
		const coreStore = getCoreDataSelectors( selectFn );
		const editorStore = selectFn( 'core/editor' ) as EditorStore;
		const rawCore = selectFn( 'core' ) as CoreUserSiteStore;
		const currentPostTypeSlug = editorStore.getCurrentPostType?.() ?? null;

		return {
			connectionStatus: coreStore.getSyncConnectionStatus?.() ?? null,
			postType: currentPostTypeSlug ? coreStore.getPostType?.( currentPostTypeSlug ) : null,
			currentUser: rawCore.getCurrentUser?.() ?? null,
			// `getSite()` resolves `/wp/v2/settings`, which requires `manage_options`.
			// Only request it for admins; everyone else 403s and falls back to the
			// current origin below, so skip the doomed request entirely.
			site: CAPABILITIES.manage_options === true ? rawCore.getSite?.() ?? null : null,
		};
	}, [] );

	const isAdmin = CAPABILITIES.manage_options === true;

	const copyButtonRef = useCopyToClipboard< HTMLAnchorElement >( () => {
		const blockEditorStore = select( 'core/block-editor' ) as BlockEditorStore;
		const blocks = blockEditorStore.getBlocks?.() ?? [];
		return serialize( blocks );
	} );

	// Track visibility as state so it stays stable across reconnect cycles
	// (ignore `connecting`; only flip on `connected` or `disconnected`).
	const [ showModal, setShowModal ] = useState( false );
	const [ upgradeState, setUpgradeState ] = useState< UpgradeState >( 'idle' );
	useEffect( () => {
		if ( connectionStatus?.status === 'connected' ) {
			setShowModal( false );
			// Reset so a later limit in the same session starts from a clean
			// dialog rather than reopening on the stale "Request sent" view.
			setUpgradeState( 'idle' );
			return;
		}
		if ( connectionStatus?.status === 'disconnected' ) {
			const errorCode = connectionStatus.error?.code;
			setShowModal( errorCode !== undefined && CUSTOM_MODAL_ERROR_CODES.includes( errorCode ) );
		}
	}, [ connectionStatus ] );

	const errorCode = connectionStatus?.error?.code;
	const isUpgradeLimit = errorCode === UPGRADE_ERROR_CODE;

	const telemetryFired = useRef( false );

	// Record once that the collaborator-limit dialog was shown.
	useEffect( () => {
		if ( ! showModal || ! isUpgradeLimit || telemetryFired.current ) {
			return;
		}
		telemetryFired.current = true;
		apiFetch( {
			path: '/vip-rtc/v1/telemetry/limit-dialog',
			method: 'POST',
		} ).catch( error => {
			new Logger().warn( 'VIP RTC: failed to record limit-dialog telemetry.', error );
		} );
	}, [ showModal, isUpgradeLimit ] );

	if ( ! showModal ) {
		return null;
	}

	const editPostHref = postType?.slug ? `edit.php?post_type=${ postType.slug }` : 'edit.php';
	const backButtonLabel = sprintf(
		/* translators: %s: Post type name (e.g., "Posts", "Pages"). */
		__( 'Back to %s', 'vip-real-time-collaboration' ),
		postType?.labels?.name ?? __( 'Posts', 'vip-real-time-collaboration' )
	);
	const { title, body } = getConnectionErrorMessage( errorCode, isAdmin );

	const handleUpgradeClick = async (): Promise< void > => {
		setUpgradeState( 'submitting' );

		const context: UpgradeTicketContext = {
			siteName: site?.title ?? '',
			siteUrl: site?.url ?? window.location.origin,
			userName: currentUser?.name ?? '',
			userEmail: currentUser?.email ?? '',
			contactAjax: CONTACT_AJAX,
			supportEmail: SUPPORT_EMAIL ?? 'support@wpvip.com',
		};

		const outcome = await submitUpgradeTicket( context );

		// On a mailto: fallback the browser navigates to the mail client; reset
		// to idle so the dialog stays usable if that navigation is cancelled.
		setUpgradeState( outcome === 'submitted' ? 'success' : 'idle' );
	};

	// The success state reuses the same modal, swapping only the copy and the
	// upgrade CTA. The post is still disconnected here, so "Copy Post Content"
	// stays available to rescue any unsaved work.
	const isSuccess = isUpgradeLimit && upgradeState === 'success';

	return (
		<Modal
			title={ isSuccess ? __( 'Request sent', 'vip-real-time-collaboration' ) : title }
			isDismissible={ false }
			onRequestClose={ () => {} }
			shouldCloseOnClickOutside={ false }
			shouldCloseOnEsc={ false }
			size="medium"
		>
			<VStack spacing={ 6 }>
				<p>
					{ isSuccess
						? __(
								"Your request has been sent to our account team via ticket. If you don't have access to tickets, please contact your site administrator.",
								'vip-real-time-collaboration'
						  )
						: body }
				</p>
				<HStack justify="right">
					<Button
						__next40pxDefaultSize
						href={ editPostHref }
						isDestructive={ ! isSuccess }
						variant={ isSuccess ? 'primary' : 'tertiary' }
					>
						{ backButtonLabel }
					</Button>
					<Button
						__next40pxDefaultSize
						ref={ copyButtonRef }
						variant={ isUpgradeLimit ? 'secondary' : 'primary' }
					>
						{ __( 'Copy Post Content', 'vip-real-time-collaboration' ) }
					</Button>
					{ isUpgradeLimit && ! isSuccess && (
						<Button
							__next40pxDefaultSize
							variant="primary"
							isBusy={ upgradeState === 'submitting' }
							disabled={ upgradeState === 'submitting' }
							onClick={ () => {
								void handleUpgradeClick();
							} }
						>
							{ __( 'Upgrade Plan', 'vip-real-time-collaboration' ) }
						</Button>
					) }
				</HStack>
			</VStack>
		</Modal>
	);
}
