/**
 * WordPress dependencies
 */
import {
	Setting,
	store as rtcSettingsStore,
	type SettingsStoreSelectors,
} from '@/store/settings-store';
import { use, useSelect } from '@wordpress/data';
import { useBlockEditingMode } from '@wordpress/block-editor';
import { createHigherOrderComponent } from '@wordpress/compose';
import { addFilter } from '@wordpress/hooks';

export function setupViewOnlyBlocks() {
	const viewOnlyBlocks = createHigherOrderComponent( BlockEdit => {
		return props => {
			const isViewOnlyModeEnabled = useSelect< SettingsStoreSelectors, boolean >( select =>
				select( rtcSettingsStore ).getSetting( Setting.VIEW_ONLY_MODE )
			);

			if ( isViewOnlyModeEnabled ) {
				useBlockEditingMode( 'disabled' );
			} else {
				useBlockEditingMode( 'default' );
			}

			return <BlockEdit { ...props } />;
		};
	}, 'withDisabledBlocks' );

	addFilter( 'editor.BlockEdit', 'vip-rtc-view-only-blocks', viewOnlyBlocks );
}
