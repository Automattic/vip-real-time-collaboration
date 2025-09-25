export interface SessionDiagnosticEvent {
	id: string;
	timestamp: number;
	timestamp_h: string;
	event_name: string;
	data: Record< string, unknown >;
}

export interface SessionDiagnosticsConfig {
	crdtRetentionMs: number;
	cleanupIntervalMs: number;
	enabled: boolean;
}
