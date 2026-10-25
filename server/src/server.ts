import { createApp } from './app.js';
import { env } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';

const server = createApp().listen(env.PORT, env.HOST, () => {
  console.info(`KairoPass API listening at http://${env.HOST}:${env.PORT} (${env.NODE_ENV})`);
  void connectDatabase().catch((error: unknown) => {
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
  console.info(`Received ${signal}; closing the HTTP server.`);
  const deadline = setTimeout(() => {
    console.error('Graceful shutdown timed out.');
    process.exit(1);
  }, 10_000);
  deadline.unref();
  server.close(() => {
    void disconnectDatabase().then(() => {
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
