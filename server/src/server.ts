import dns from 'node:dns';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { parseAuthEnvironment } from './config/auth.js';
import { parseTicketEnvironment } from './modules/tickets/tickets.crypto.js';
import { createExpirationWorker } from './modules/reservations/reservation-expiration.js';

if (env.NODE_ENV !== 'production' && dns.getServers().some((s) => s === '127.0.0.1' || s === '::1')) {
  dns.setServers(['1.1.1.1', '1.0.0.1']);
}

const expirationWorker = createExpirationWorker();
try { parseTicketEnvironment(process.env); }
catch { console.error('Ticket signing unavailable: configure an independent strong TICKET_HMAC_SECRET. See .env.example.'); }

try {
  parseAuthEnvironment(process.env);
} catch {
  console.error('Authentication unavailable: configure a strong JWT_SECRET and the required origin settings. See .env.example.');
}

const server = createApp().listen(env.PORT, env.HOST, () => {
  console.info(`KairoPass API listening at http://${env.HOST}:${env.PORT} (${env.NODE_ENV})`);
  void connectDatabase().then(() => { if (!stopping) expirationWorker.start(); }).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'MongoDB initialization failed.');
    console.error('API liveness remains available; /api/ready returns 503 until MongoDB is configured and reachable.');
  });
});

server.on('error', (error: NodeJS.ErrnoException) => {
  console.error(`Unable to start KairoPass: ${error.code ?? error.message}`);
  process.exitCode = 1;
});

let stopping = false;
function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  // Stop accepting cleanup work while HTTP requests drain, so both share the shutdown budget.
  const workerStopped = expirationWorker.stop();
  console.info(`Received ${signal}; closing the HTTP server.`);
  const deadline = setTimeout(() => {
    console.error('Graceful shutdown timed out.');
    process.exit(1);
  }, 10_000);
  deadline.unref();
  server.close(() => {
    void workerStopped.then(() => disconnectDatabase()).then(() => {
      clearTimeout(deadline);
      process.exitCode = 0;
    }).catch(() => {
      clearTimeout(deadline);
      console.error('MongoDB shutdown failed.');
      process.exitCode = 1;
    });
  });
}

process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));
