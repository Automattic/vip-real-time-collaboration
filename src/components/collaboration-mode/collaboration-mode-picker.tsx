import { Button, Popover, Icon } from '@wordpress/components';
import { useState } from '@wordpress/element';
import { paragraph } from '@wordpress/icons';

import { viewIcon } from './view-icon';

import '@/components/collaboration-mode/collaboration-mode-picker.scss';

type CollaborationModeType = 'view' | 'edit';

interface ModeOption {
	value: CollaborationModeType;
	label: string;
	description: string;
	icon: JSX.Element;
}

const MODES: ModeOption[] = [
	{
		value: 'view',
		label: 'View',
		description: 'Focus on content',
		icon: viewIcon,
	},
	{
		value: 'edit',
		label: 'Edit',
		description: 'Make changes',
		icon: paragraph,
	},
];

/**
 * CollaborationModePicker component that allows users to switch between View and Edit modes.
 * Displays the currently selected mode icon in the toolbar and opens a popover to select a different mode.
 */
export function CollaborationModePicker() {
	const [ selectedMode, setSelectedMode ] = useState< CollaborationModeType >( 'edit' );
	const [ isPopoverVisible, setIsPopoverVisible ] = useState( false );
	const [ popoverAnchor, setPopoverAnchor ] = useState< HTMLElement | null >( null );

	const currentMode = MODES.find( mode => mode.value === selectedMode );
	const currentIcon = currentMode?.icon || paragraph;

	const handleModeSelect = ( mode: CollaborationModeType ) => {
		setSelectedMode( mode );
		setIsPopoverVisible( false );
	};

	return (
		<>
			<Button
				className="vip-collaboration-mode-button"
				variant="primary"
				aria-label={ `Collaboration mode: ${ currentMode?.label }` }
				onClick={ () => setIsPopoverVisible( ! isPopoverVisible ) }
				isPressed={ isPopoverVisible }
				icon={ currentIcon }
				ref={ setPopoverAnchor }
				iconSize={ 24 }
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
