import { areSelectionsEqual } from '@/utilities/selection';

import type { EditorState, UserInfo } from '@/awareness/awareness-types';

export function areUserInfosEqual( userInfo1?: UserInfo, userInfo2?: UserInfo ): boolean {
	if ( ! userInfo1 || ! userInfo2 ) {
		return userInfo1 === userInfo2;
	}

	if ( Object.keys( userInfo1 ).length !== Object.keys( userInfo2 ).length ) {
		return false;
	}

	return Object.entries( userInfo1 ).every( ( [ key, value ] ) => {
		// Update this function with any non-primitive fields added to UserInfo.
		return value === userInfo2[ key as keyof UserInfo ];
	} );
}

export function areEditorStatesEqual( state1?: EditorState, state2?: EditorState ): boolean {
	if ( ! state1 || ! state2 ) {
		return state1 === state2;
	}

	return areSelectionsEqual( state1.selection, state2.selection );
}
