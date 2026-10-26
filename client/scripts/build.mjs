// Set this before Vite resolves the shared API .env or selects React conditions.
process.env.NODE_ENV = 'production';
const { build } = await import('vite');
await build();
