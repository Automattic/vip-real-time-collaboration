import { UserInfo } from '@/store/awareness-store';

/**
 * Renders a circular avatar bubble for a user with an optional border.
 */
export function Avatar( {
	userInfo,
	showUserColorBorder,
}: {
	userInfo: UserInfo;
	showUserColorBorder?: boolean;
} ) {
	const style = {
		border: showUserColorBorder === true ? `2px solid ${ userInfo.color }` : undefined,
		opacity: userInfo.isConnected ? 1 : 0.5,
	};

	return (
		<div className="vip-real-time-collaboration-avatar">
			<img
				alt={ userInfo.name }
				src={ userInfo.avatarUrl }
				style={ style }
				title={ userInfo.name }
			/>
		</div>
	);
}
