import { DEFAULT_CONNECTION_TIMEOUT, DEFAULT_HOST, DEFAULT_PORT, JWT_SECRET } from './config';
import { createMetricsServer, startMetricsMaintenanceLoop } from './metrics';
import { createRtcServer } from './server';

if ( ! JWT_SECRET ) {
	// eslint-disable-next-line no-console
	console.error( 'VIP_RTC_WS_AUTH_SECRET environment variable is not set' );
	process.exit( 1 );
}

const host = process.env.HOST || DEFAULT_HOST;
const port = parseInt( process.env.PORT || '', 10 ) || DEFAULT_PORT;
const connectionTimeout =
	parseInt( process.env.CONNECTION_TIMEOUT || '', 10 ) || DEFAULT_CONNECTION_TIMEOUT;
const { server, wss } = createRtcServer( { jwtSecret: JWT_SECRET, connectionTimeout } );

server.listen( port, host, (): void => {
	// eslint-disable-next-line no-console
	console.log( `WebSocket server running at ws://${ host }:${ port }` );
} );

if ( process.env.METRICS_PORT ) {
	const metricsPort = parseInt( process.env.METRICS_PORT, 10 );
	const metricsServer = createMetricsServer();

	metricsServer.listen( metricsPort, host, (): void => {
		// eslint-disable-next-line no-console
		console.log( `WebSocket metrics server running at http://${ host }:${ metricsPort }` );
		startMetricsMaintenanceLoop( wss );
	} );
}
