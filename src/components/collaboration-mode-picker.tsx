import { Button, Popover, Icon } from '@wordpress/components';
import {
	store as coreStore,
	type CoreDataSelectors,
	type CoreDataStoreActions,
} from '@wordpress/core-data';
import { useSelect, useDispatch } from '@wordpress/data';
import { store as editorStore, type EditorStoreSelectors } from '@wordpress/editor';
import { useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import { pencil, seen, chevronDown } from '@wordpress/icons';

import '@/components/collaboration-mode-picker.scss';

interface ModeOption {
	value: 'edit' | 'view';
	label: string;
	description: string;
	icon: JSX.Element;
}

// RTC meta structure for enforced collaboration mode.
interface RtcMeta {
	enforcedMode?: 'codeEditor' | null;
	enforcedModeOwner?: number | null;
}

// Entity record with RTC meta.
interface EntityRecordWithRtcMeta {
	meta?: {
		rtc?: RtcMeta;
	};
}

const MODES: ModeOption[] = [
	{
		value: 'edit',
		label: __( 'Editing', 'vip-real-time-collaboration' ),
		description: __( 'Edit document directly', 'vip-real-time-collaboration' ),
		icon: pencil,
	},
	{
		value: 'view',
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

	const { selectedCollaborationEditorMode, shouldPickerBeLockedDown } = useSelect( select => {
		const { getCurrentPostType, getCurrentPostId } = select( editorStore ) as EditorStoreSelectors;
		const { getEditedEntityRecord, getCollaboratorMode } = select( coreStore ) as CoreDataSelectors;

		const postType = getCurrentPostType();
		const postId = getCurrentPostId();

		let isLockedDown = false;

		if ( postType && postId ) {
			// This mirrors the way it's done in the switchEditorMode action.
			const entityRecord = getEditedEntityRecord( 'postType', postType, postId ) as
				| EntityRecordWithRtcMeta
				| undefined;
			const rtcMeta = entityRecord?.meta?.rtc as RtcMeta | undefined;
			if ( rtcMeta?.enforcedModeOwner && rtcMeta?.enforcedMode === 'codeEditor' ) {
				isLockedDown = true;
			}
		}

		return {
			selectedCollaborationEditorMode: getCollaboratorMode() as 'edit' | 'view',
			shouldPickerBeLockedDown: isLockedDown,
		};
	} );

	const { setCollaboratorMode } = useDispatch< CoreDataStoreActions >( coreStore );

	const currentMode = MODES.find( mode => mode.value === selectedCollaborationEditorMode );

	const handleModeSelect = ( mode: 'edit' | 'view' ) => {
		setCollaboratorMode( mode );
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
				disabled={ shouldPickerBeLockedDown }
				text={ currentMode?.label }
				icon={ currentMode?.icon }
			>
				<Icon icon={ chevronDown } />
			</Button>
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
							const isSelected = value === selectedCollaborationEditorMode;
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
