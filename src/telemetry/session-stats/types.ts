/**
 * Defines the structure of a session stats export.
 */
export type SessionStatsExport = {
	postId: PostId;
	sessionDuration: number;
	timestamp: number;
	usersActive: number;
	usersInactive: number;
	usersTotal: number;
};

/**
 * Defines the possible value types of a Post ID.
 */
export type PostId = string | number | null;
