import type { DiagnosticEvent } from '../types';

export abstract class BaseEventDetector {
	protected unsubscribe: ( () => void ) | null = null;

	constructor( private onEventDetected: ( event: DiagnosticEvent ) => void ) {}

	public abstract initialize(): void;

	public abstract destroy(): void;

	protected emitEvent( event: DiagnosticEvent ): void {
		this.onEventDetected( event );
	}
}
