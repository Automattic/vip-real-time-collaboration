// Type declarations for WordPress build-types paths that are imported in the codebase

declare module '@wordpress/data/build-types/registry' {
	export interface WPDataRegistry {
		dispatch: (
			namespace: string | { name: string }
		) => Record< string, ( ...args: unknown[] ) => void >;
		select: ( namespace: string | { name: string } ) => any;
	}
}

declare module '@wordpress/editor/build-types/store/selectors' {
	export type WPBlockSelection = {
		clientId: string;
		attributeKey: string;
		offset: number;
	};
}
