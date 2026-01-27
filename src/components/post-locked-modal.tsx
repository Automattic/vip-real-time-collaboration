import {
	Modal,
	Button,
	__experimentalHStack as HStack,
	__experimentalVStack as VStack,
	Icon,
} from '@wordpress/components';
import { useIsDisconnected } from '@wordpress/core-data';
import { __ } from '@wordpress/i18n';
import { error } from '@wordpress/icons';

import { useCopyPostContentToClipboard } from '@/hooks/use-copy-post-content-to-clipboard';
import '@/components/post-locked-modal.scss';

interface PostLockedModalProps {
	postId: number | null;
	postType: string | null;
}

export function PostLockedModal( { postId, postType }: PostLockedModalProps ) {
	const buttonRef = useCopyPostContentToClipboard();
	const isDisconnected = useIsDisconnected( postId ?? null, postType ?? null );

	if ( ! isDisconnected ) {
		return null;
	}

	return (
		<Modal
			__experimentalHideHeader={ true }
			icon={ error }
			isDismissible={ false }
			isFullScreen={ false }
			onRequestClose={ () => {} }
			shouldCloseOnClickOutside={ false }
			shouldCloseOnEsc={ false }
		>
			<div className="vip-rtc-post-locked-modal__container">
				<VStack alignment="center" justify="center" spacing={ 2 }>
					<Icon fill="#ccc" icon={ error } size={ 64 } />
					<h1>{ __( 'Disconnected', 'vip-real-time-collaboration' ) }</h1>
					<p className="vip-rtc-post-locked-modal__p">
						{ __(
							'You are currently disconnected from the collaborative editing server.',
							'vip-real-time-collaboration'
						) }{ ' ' }
						{ __(
							'Editing is temporarily disabled to prevent conflicts with other users.',
							'vip-real-time-collaboration'
						) }
					</p>
					<HStack spacing={ 2 } justify="center">
						<Button ref={ buttonRef } variant="primary">
							{ __( 'Copy post content', 'vip-real-time-collaboration' ) }
						</Button>
						<Button href="edit.php" isDestructive={ true } variant="secondary">
							{ __( 'Edit another post', 'vip-real-time-collaboration' ) }
						</Button>
					</HStack>
				</VStack>
			</div>
		</Modal>
	);
}
