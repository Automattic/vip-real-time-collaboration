export interface DiagnosticEvent {
	id: string;
	timestamp: number; // Unix timestamp for sorting/comparison
	timestamp_h: string; // UTC ISO format for readability
	category: 'blocks' | 'awareness' | 'editor' | 'sync';
	event_name: string;
	data: Record< string, unknown >;
	user_id: number; // Mandatory - logged in user
	username: string; // For readability in logs
	client_id?: number; // Optional Yjs client ID
}

export interface SessionDiagnosticsConfig {
	crdtRetentionMs: number;
	cleanupIntervalMs: number;
	enabled: boolean;
}
