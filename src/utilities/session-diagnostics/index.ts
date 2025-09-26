import { SessionDiagnostics } from './session-diagnostics';

export { SessionDiagnostics };
export type { DiagnosticEvent, SessionDiagnosticsConfig } from './types';

export function getSessionDiagnostics() {
	return SessionDiagnostics.getInstance();
}
