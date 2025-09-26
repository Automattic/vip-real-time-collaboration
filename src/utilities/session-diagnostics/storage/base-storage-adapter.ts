import type { DiagnosticEvent } from '../types';

export abstract class BaseStorageAdapter {
	public abstract initialize(): void;

	public abstract store( event: DiagnosticEvent ): void;

	public abstract getEvents(): DiagnosticEvent[];

	public abstract cleanup(): void;

	public abstract destroy(): void;
}
