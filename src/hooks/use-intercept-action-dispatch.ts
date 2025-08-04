import { BlockEditorStoreDescriptor } from '@wordpress/block-editor';
import { use } from '@wordpress/data';
import { WPDataRegistry } from '@wordpress/data/build-types/registry';
import { useEffect } from '@wordpress/element';

type UseRegistryCallback = ( registry: WPDataRegistry ) => {
	dispatch: (
		namespace: string | { name: string }
	) => Record< string, ( ...args: unknown[] ) => void >;
};

type ActionOverride = {
	actionIntercept: ( ( ...args: unknown[] ) => void ) | false;
	callback: ( originalAction: ( ...args: unknown[] ) => void, args: unknown[] ) => void;
};

type StoreOverrides = Record< string, ActionOverride >;

const functionOverrides: Record< string, StoreOverrides > = {};

/* eslint-disable security/detect-object-injection */
// This code is called from a Gutenberg plugin context, where provided store and action names are fixed strings.
// We've also added type checks to lower the surface area for injection attacks.

export default function useInterceptActionDispatch(
	storeDescriptor: BlockEditorStoreDescriptor,
	actionName: string,
	callback: ( originalAction: ( ...args: unknown[] ) => void, args: unknown[] ) => void
) {
	if ( typeof storeDescriptor.name !== 'string' ) {
		throw new Error( 'Invalid storeDescriptor for useInterceptActionDispatch' );
	}

	if ( typeof actionName !== 'string' ) {
		throw new Error( 'Invalid actionName for useInterceptActionDispatch' );
	}

	const storeName = storeDescriptor.name;

	// Create a new entry to track this function override if it doesn't exist
	if ( ! functionOverrides?.[ storeName ]?.[ actionName ] ) {
		if ( ! functionOverrides?.[ storeName ] ) {
			functionOverrides[ storeName ] = {};
		}

		// Registy override for this action.
		// The purpose of `actionIntercept` is to provide a single unchanging reference to interception logic.
		// Without this, each time useInterceptActionDispatch() is called we will create a new dispatch override and
		// trigger rerenders of components that use dispatch functions as dependencies.
		// `actionIntercept` will be set during dispatch registration after we have access to the original action.
		//
		// The `callback` key is used to store the actual callback function. When this changes we update it a new
		// value with useEffect below and leave actionIntercept unchanged, making dispatch dependencies happy.
		// This allows action intercepts with changing callbacks to work as expected.
		functionOverrides[ storeName ][ actionName ] = {
			actionIntercept: false,
			callback,
		};
	}

	useEffect( () => {
		// When a new callback is provided, update the stored dynamic callback
		if ( functionOverrides?.[ storeName ]?.[ actionName ] ) {
			functionOverrides[ storeName ][ actionName ].callback = callback;
		}
	}, [ storeName, actionName, callback ] );

	( use as ( callback: UseRegistryCallback ) => void )( ( registry: WPDataRegistry ) => ( {
		dispatch: ( namespace: string | { name: string } ) => {
			const namespaceName = typeof namespace === 'string' ? namespace : namespace.name;
			const actions = { ...registry.dispatch( namespaceName ) } as Record<
				string,
				( ...args: unknown[] ) => void
			>;

			if ( namespaceName !== storeName ) {
				// This is an unrelated registry namespace, return original actions
				return actions;
			}

			const override = functionOverrides?.[ storeName ]?.[ actionName ];

			if ( override && ! override.actionIntercept && actions[ actionName ] ) {
				// Create new function to override actionIntercept, just once, to avoid rerenders
				const originalAction = actions[ actionName ];

				override.actionIntercept = ( ...args ) => {
					// Call the actual provided callback internally
					functionOverrides?.[ storeName ]?.[ actionName ]?.callback( originalAction, args );
				};
			}

			if ( override && override.actionIntercept ) {
				// Add our override into the dispatch registry
				actions[ actionName ] = override.actionIntercept;
			}

			return actions;
		},
	} ) );
}
