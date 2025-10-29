import { UserInfo } from '@/store/awareness-store';

type AvatarSize = 'small' | 'medium';

const avatarSizeStyles: Map< AvatarSize, React.CSSProperties > = new Map( [
	[
		'small',
		{
			width: '24px',
			height: '24px',
			borderRadius: '6px',
		},
	],
	[
		'medium',
		{
			width: '32px',
			height: '32px',
			borderRadius: '8px',
		},
	],
] );

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
	const styles = {
		backgroundImage: `url(${ userInfo.avatarUrl })`,
		backgroundSize: 'cover',
		backgroundPosition: 'center',
		borderRadius: '6px',
		border: '1.5px solid #ddd',
		fontSize: '0px',
		...avatarSizeStyles.get( size ),
		opacity: userInfo.isConnected ? 1 : 0.5,
		...( showUserColorBorder === true && {
			border: `1.5px solid ${ userInfo.color }`,
			boxShadow: 'inset 0px 0px 0px 1px rgba(255, 255, 255, 0.7)',
			backgroundClip: 'padding-box',
		} ),
	};

	return (
		<div
			className="vip-real-time-collaboration-avatar"
			style={ styles }
			title={ userInfo.name }
			aria-label={ userInfo.name }
		/>
	);
}
