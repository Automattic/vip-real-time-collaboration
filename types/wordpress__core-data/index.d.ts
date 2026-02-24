import '@wordpress/core-data';

declare module '@wordpress/core-data' {
	const store: {
		name: string;
	};

	type UserInfo = Pick< User< 'view' >, 'id' | 'name' | 'slug' | 'avatar_urls' > & {
		enteredAt: number;
	};
}
