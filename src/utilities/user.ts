import { areSelectionsEqual } from './selection';
import { EditorState, type UserState } from '@/store/awareness-store';

export function areUserStatesEqual( userState1: UserState, userState2: UserState ): boolean {
	if ( Object.keys( userState1 ).length !== Object.keys( userState2 ).length ) {
		return false;
	}

	return Object.entries( userState1 ).every( ( [ key, value ] ) => {
		// Update this switch with any non-primitive fields added to UserState.
		switch ( key ) {
			case 'editorState':
				return areEditorStatesEqual( userState1.editorState, userState2.editorState );

			default:
				return value === userState2[ key as keyof UserState ];
		}
	} );
}

function areEditorStatesEqual( state1?: EditorState, state2?: EditorState ): boolean {
	return Boolean( state1 && state2 && areSelectionsEqual( state1.selection, state2.selection ) );
}
