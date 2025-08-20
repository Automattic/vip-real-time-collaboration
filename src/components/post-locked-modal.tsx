import {
	Modal,
	Button,
	__experimentalHStack as HStack,
	__experimentalVStack as VStack,
	Icon,
} from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import { error } from '@wordpress/icons';

import { useIsDisconnected } from '@/hooks/use-is-disconnected';
import '@/components/post-locked-modal.scss';

export function PostLockedModal() {
	const isDisconnected = useIsDisconnected();

	if ( ! isDisconnected ) {
		return null;
	}

	return (
		<Modal
			__experimentalHideHeader={ true }
			icon={ error }
			isDismissible={ false }
			isFullScreen={ true }
			onRequestClose={ () => {} }
			shouldCloseOnClickOutside={ false }
			shouldCloseOnEsc={ false }
		>
			<div className="vip-rtc-post-locked-modal__container">
				<VStack alignment="center" justify="center" spacing={ 2 }>
					<Icon fill="#ccc" icon={ error } size={ 64 } />
					<h1>{ __( 'Disconnected', 'vip-real-time-collaboration' ) }</h1>
					<p className="vip-rtc-post-locked-modal__p">
						You are currently disconnected from the collaborative editing server.{ ' ' }
						<strong>Editing is temporarily disabled</strong> to prevent conflicts with other users.
					</p>
					<HStack spacing={ 2 } justify="center">
						<Button href="edit.php" isDestructive={ true } variant="secondary">
							{ __( 'Edit another post', 'vip-real-time-collaboration' ) }
						</Button>
						<Button isDestructive={ true } onClick={ () => location.reload() } variant="secondary">
							{ __( 'Refresh', 'vip-real-time-collaboration' ) }
						</Button>
					</HStack>
				</VStack>
			</div>
		</Modal>
	);
}
