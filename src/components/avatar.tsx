import { UserInfo } from '@/store/awareness-store';

import '@/components/avatar.scss';

type AvatarSize = 'small' | 'medium';

/**
 * Renders a circular avatar bubble for a user with an optional border.
 */
export function Avatar( {
	userInfo,
	showUserColorBorder,
	size = 'small',
}: {
	userInfo: UserInfo;
	showUserColorBorder?: boolean;
	size?: AvatarSize;
} ) {
	const className = [
		'vip-real-time-collaboration-avatar',
		`vip-real-time-collaboration-avatar--${ size }`,
		showUserColorBorder && 'vip-real-time-collaboration-avatar--with-color-border',
	]
		.filter( Boolean )
		.join( ' ' );

	const avatarStyles = {
		'--avatar-url': `url(${ userInfo.avatarUrl })`,
		'--user-color': userInfo.color,
		opacity: userInfo.isConnected ? 1 : 0.5,
	};

	return (
		<div
			className={ className }
			style={ avatarStyles }
			title={ userInfo.name }
			aria-label={ userInfo.name }
		/>
	);
}
