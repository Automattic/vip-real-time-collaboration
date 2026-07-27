export interface RetryEligibility {
	attempts: number;
	eligible: boolean;
}

interface RetriableConnectOptions {
	fetchGrant: () => Promise< string >;
	connectWithGrant: ( grant: string ) => void;
	getBackoffDelay: ( attempts: number ) => number;
	wait: ( delayInMs: number ) => Promise< void >;
}

export function createRetriableConnect(
	state: RetryEligibility,
	options: RetriableConnectOptions
): () => Promise< void > {
	let hasAttemptedConnect = false;

	const connect = async (): Promise< void > => {
		if ( ! state.eligible ) {
			return;
		}

		if ( hasAttemptedConnect ) {
			const delayInMs = options.getBackoffDelay( state.attempts );
			await options.wait( delayInMs );
			if ( ! state.eligible ) {
				return;
			}
		}

		hasAttemptedConnect = true;
		state.attempts += 1;

		let grant: string;
		try {
			grant = await options.fetchGrant();
		} catch {
			if ( state.eligible ) {
				void connect().catch( () => {} );
			}
			return;
		}

		if ( ! state.eligible ) {
			return;
		}
		options.connectWithGrant( grant );
	};

	return connect;
}
