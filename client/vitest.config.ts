import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  // One isolated jsdom worker bounds memory/cold-render contention, including
  // semantic axe scans. Keep every assertion deadline and per-file isolation.
  test: { maxWorkers: 1, environment: 'jsdom', setupFiles: ['./src/tests/setup.ts'], restoreMocks: true,
    include: ['src/tests/**/*.test.{ts,tsx}'], testTimeout: 10000 }
});
