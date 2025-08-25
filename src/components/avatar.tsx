import { UserState } from '@/store/awareness-store';

/**
 * Renders a circular avatar bubble for a user with an optional border.
 */
export function Avatar( {
	userState,
	showUserColorBorder,
}: {
	userState: UserState;
	showUserColorBorder?: boolean;
} ) {
	const style = {
		border: showUserColorBorder === true ? `2px solid ${ userState.color }` : undefined,
		opacity: userState.isConnected ? 1 : 0.5,
	};

	return (
		<div className="vip-real-time-collaboration-avatar">
			<img
				alt={ userState.name }
				src={ userState.avatarUrl }
				style={ style }
				title={ userState.name }
			/>
		</div>
	);
}
