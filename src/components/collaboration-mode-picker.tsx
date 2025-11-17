import { Button, Popover, Icon } from '@wordpress/components';
import { useSelect, useDispatch } from '@wordpress/data';
import { useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import { pencil, seen } from '@wordpress/icons';

import {
	store as collaborationModeStore,
	type CollaborationModeStoreSelectors,
	type CollaborationModeStoreActions,
} from '@/store/collaboration-mode-store';
import { CollaborationMode } from '@/types/collaboration-mode';

import '@/components/collaboration-mode-picker.scss';

interface ModeOption {
	value: CollaborationMode;
	label: string;
	description: string;
	icon: JSX.Element;
}

const MODES: ModeOption[] = [
	{
		value: CollaborationMode.EDIT,
		label: __( 'Editing', 'vip-real-time-collaboration' ),
		description: __( 'Edit document directly', 'vip-real-time-collaboration' ),
		icon: pencil,
	},
	{
		value: CollaborationMode.VIEW,
		label: __( 'Viewing', 'vip-real-time-collaboration' ),
		description: __( 'Focus on content', 'vip-real-time-collaboration' ),
		icon: seen,
	},
];

/**
 * CollaborationModePicker component that allows users to switch between View and Edit modes.
 * Displays the currently selected mode icon in the toolbar and opens a popover to select a different mode.
 */
export function CollaborationModePicker() {
	const [ isPopoverVisible, setIsPopoverVisible ] = useState( false );
	const [ popoverAnchor, setPopoverAnchor ] = useState< HTMLElement | null >( null );

	const selectedMode = useSelect< CollaborationModeStoreSelectors, CollaborationMode >(
		select => select( collaborationModeStore ).getMode(),
		[]
	);

	const { setMode } = useDispatch< CollaborationModeStoreActions >( collaborationModeStore );

	const currentMode = MODES.find( mode => mode.value === selectedMode );

	const handleModeSelect = ( mode: CollaborationMode ) => {
		setMode( mode );
		setIsPopoverVisible( false );
	};

	return (
		<>
			<Button
				className="vip-collaboration-mode-button"
				aria-label={ `Collaboration mode: ${ currentMode?.label }` }
				onClick={ () => setIsPopoverVisible( ! isPopoverVisible ) }
				isPressed={ isPopoverVisible }
				size="compact"
				ref={ setPopoverAnchor }
				text={ currentMode?.label }
				icon={ currentMode?.icon }
			/>
			{ isPopoverVisible && (
				<Popover
					anchor={ popoverAnchor }
					placement="bottom-start"
					offset={ 10 }
					className="vip-collaboration-mode-popover"
					onClose={ () => setIsPopoverVisible( false ) }
				>
					<div className="vip-collaboration-mode-menu">
						{ MODES.map( ( { value, label, description, icon } ) => {
							const isSelected = value === selectedMode;
							return (
								<button
									key={ value }
									className={ `vip-collaboration-mode-menu-item ${
										isSelected ? 'is-selected' : ''
									}` }
									onClick={ () => handleModeSelect( value ) }
									aria-pressed={ isSelected }
								>
									<div className="vip-collaboration-mode-menu-item-content">
										<div className="vip-collaboration-mode-menu-item-icon">
											<Icon icon={ icon } size={ 24 } />
										</div>
										<div className="vip-collaboration-mode-menu-item-label">
											<div className="vip-collaboration-mode-menu-item-title">{ label }</div>
											<div className="vip-collaboration-mode-menu-item-description">
												{ description }
											</div>
										</div>
									</div>
								</button>
							);
						} ) }
					</div>
				</Popover>
			) }
		</>
	);
}
