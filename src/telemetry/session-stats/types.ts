/**
 * Internal dependencies
 */
import { SessionStatsSchema } from './SessionStats';

/**
 * Defines the structure of a session stats export.
 */
export type SessionStatsExport = Pick<
	SessionStatsSchema,
	'sessionTimeLastActivity' | 'sessionTimeStart'
> & {
	postId: PostId;
	sessionDuration: number;
	timestamp: number;
	usersActive: number;
	usersInactive: number;
	usersMax: number;
};

/**
 * Defines the possible value types of a Post ID.
 */
export type PostId = string | number | null;
