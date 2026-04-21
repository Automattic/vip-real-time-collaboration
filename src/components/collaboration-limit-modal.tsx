import { serialize, type Block } from '@wordpress/blocks';
import {
	Button,
	Modal,
	__experimentalHStack as HStack,
	__experimentalVStack as VStack,
} from '@wordpress/components';
import { useCopyToClipboard } from '@wordpress/compose';
import { select, useSelect } from '@wordpress/data';
import { useEffect, useState } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';

import type { ConnectionErrorCode, ConnectionStatus } from '@wordpress/sync';

const CUSTOM_MODAL_ERROR_CODES: ReadonlyArray< ConnectionErrorCode > = [
	'collaborator-limit-exceeded',
	'connection-limit-exceeded',
];

interface CoreStoreWithSync {
	getSyncConnectionStatus?: () => ConnectionStatus | null | undefined;
	getPostType?: ( slug: string ) => { slug: string; labels?: { name?: string } } | null;
}

interface EditorStore {
	getCurrentPostType?: () => string | null;
}

interface BlockEditorStore {
	getBlocks?: () => Block[];
}

function getBodyText( errorCode: ConnectionErrorCode | undefined ): string {
	if ( errorCode === 'collaborator-limit-exceeded' ) {
		return __(
			'This environment has reached its active collaborator limit. You will be reconnected automatically once another collaborator disconnects, or an administrator can raise the limit.',
			'vip-real-time-collaboration'
		);
	}

	return __(
		'This environment has reached its active connection limit. You will be reconnected automatically once capacity becomes available, or an administrator can raise the limit.',
		'vip-real-time-collaboration'
	);
}

export function CollaborationLimitModal() {
	const { connectionStatus, postType } = useSelect( selectFn => {
		const coreStore = selectFn( 'core' ) as CoreStoreWithSync;
		const editorStore = selectFn( 'core/editor' ) as EditorStore;
		const currentPostTypeSlug = editorStore.getCurrentPostType?.() ?? null;

		return {
			connectionStatus: coreStore.getSyncConnectionStatus?.() ?? null,
			postType: currentPostTypeSlug ? coreStore.getPostType?.( currentPostTypeSlug ) : null,
		};
	}, [] );

	const copyButtonRef = useCopyToClipboard< HTMLAnchorElement >( () => {
		const blockEditorStore = select( 'core/block-editor' ) as BlockEditorStore;
		const blocks = blockEditorStore.getBlocks?.() ?? [];
		return serialize( blocks );
	} );

	// Track visibility as state so it stays stable across reconnect cycles
	// (ignore `connecting`; only flip on `connected` or `disconnected`).
	const [ showModal, setShowModal ] = useState( false );
	useEffect( () => {
		if ( connectionStatus?.status === 'connected' ) {
			setShowModal( false );
			return;
		}
		if ( connectionStatus?.status === 'disconnected' ) {
			const errorCode = connectionStatus.error?.code;
			setShowModal( errorCode !== undefined && CUSTOM_MODAL_ERROR_CODES.includes( errorCode ) );
		}
	}, [ connectionStatus ] );

	if ( ! showModal ) {
		return null;
	}

	const editPostHref = postType?.slug ? `edit.php?post_type=${ postType.slug }` : 'edit.php';
	const backButtonLabel = sprintf(
		/* translators: %s: Post type name (e.g., "Posts", "Pages"). */
		__( 'Back to %s', 'vip-real-time-collaboration' ),
		postType?.labels?.name ?? __( 'Posts', 'vip-real-time-collaboration' )
	);

	return (
		<Modal
			title={ __( 'Collaboration limit reached', 'vip-real-time-collaboration' ) }
			isDismissible={ false }
			onRequestClose={ () => {} }
			shouldCloseOnClickOutside={ false }
			shouldCloseOnEsc={ false }
			size="medium"
		>
			<VStack spacing={ 6 }>
				<p>{ getBodyText( connectionStatus?.error?.code ) }</p>
				<HStack justify="right">
					<Button __next40pxDefaultSize href={ editPostHref } isDestructive variant="tertiary">
						{ backButtonLabel }
					</Button>
					<Button __next40pxDefaultSize ref={ copyButtonRef } variant="primary">
						{ __( 'Copy Post Content', 'vip-real-time-collaboration' ) }
					</Button>
				</HStack>
			</VStack>
		</Modal>
	);
}
