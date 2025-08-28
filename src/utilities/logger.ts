import { isDevelopment } from '@/utilities/config';

export enum LogLevel {
	CRITICAL = 5,
	ERROR = 4,
	WARNING = 3,
	INFO = 2,
	DEBUG = 1,
}

const DEFAULT_LOG_THRESHOLD = isDevelopment() ? LogLevel.DEBUG : LogLevel.WARNING;

export class Logger {
	public constructor(
		private namespace: string = 'vip-rtc',
		private threshold: LogLevel = DEFAULT_LOG_THRESHOLD
	) {}

	protected log( level: LogLevel, ...args: unknown[] ): void {
		if ( level < this.threshold ) {
			return;
		}

		// eslint-disable-next-line security/detect-object-injection
		const levelStr = LogLevel[ level ];

		// eslint-disable-next-line no-console
		console.log( `[${ this.namespace }][${ levelStr }]`, ...args );
	}

	public debug( ...args: unknown[] ): void {
		this.log( LogLevel.DEBUG, ...args );
	}

	public info( ...args: unknown[] ): void {
		this.log( LogLevel.INFO, ...args );
	}

	public warn( ...args: unknown[] ): void {
		this.log( LogLevel.WARNING, ...args );
	}

	public error( ...args: unknown[] ): void {
		this.log( LogLevel.ERROR, ...args );
	}

	public critical( ...args: unknown[] ): void {
		this.log( LogLevel.CRITICAL, ...args );
	}
}
