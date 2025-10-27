import { areSelectionsEqual } from '@/utilities/selection';

import type { EditorState, UserInfo, UserState } from '@/store/awareness-store';

export function areUserStatesEqual( userState1: UserState, userState2: UserState ): boolean {
	return (
		areUserInfosEqual( userState1.userInfo, userState2.userInfo ) &&
		areEditorStatesEqual( userState1.editorState, userState2.editorState )
	);
}

export function areUserInfosEqual( userInfo1: UserInfo, userInfo2: UserInfo ): boolean {
	if ( Object.keys( userInfo1 ).length !== Object.keys( userInfo2 ).length ) {
		return false;
	}

	return Object.entries( userInfo1 ).every( ( [ key, value ] ) => {
		// Update this function with any non-primitive fields added to UserInfo.
		return value === userInfo2[ key as keyof UserInfo ];
	} );
}

export function areEditorStatesEqual( state1?: EditorState, state2?: EditorState ): boolean {
	return Boolean( state1 && state2 && areSelectionsEqual( state1.selection, state2.selection ) );
}
