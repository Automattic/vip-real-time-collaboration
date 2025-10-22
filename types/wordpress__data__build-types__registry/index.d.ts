declare module '@wordpress/data/build-types/registry' {
	export interface WPDataRegistry {
		dispatch( namespaceName: string ): Record< string, ( ...args: unknown[] ) => void >;
	}
}
