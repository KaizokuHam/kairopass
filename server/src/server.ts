import { createApp } from './app.js';
import { env } from './config/env.js';

const server = createApp().listen(env.PORT, env.HOST, () => {
  console.info(`KairoPass API listening at http://${env.HOST}:${env.PORT} (${env.NODE_ENV})`);
});

server.on('error', (error: NodeJS.ErrnoException) => {
  console.error(`Unable to start KairoPass: ${error.code ?? error.message}`);
  process.exitCode = 1;
});

function shutdown(signal: string) {
  console.info(`Received ${signal}; closing the HTTP server.`);
  const deadline = setTimeout(() => {
    console.error('Graceful shutdown timed out.');
    process.exit(1);
  }, 10_000);
  deadline.unref();
  server.close(() => {
    clearTimeout(deadline);
    process.exitCode = 0;
  });
}

process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));
