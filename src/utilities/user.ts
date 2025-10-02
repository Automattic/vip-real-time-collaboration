import { type UserState } from '@/store/awareness-store';

export function areUserStatesEqual( userState1: UserState, userState2: UserState ): boolean {
	return JSON.stringify( userState1 ) === JSON.stringify( userState2 );
}
