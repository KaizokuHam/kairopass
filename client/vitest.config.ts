import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  // Bound concurrent jsdom instances so cold workflow renders remain reliable under load.
  test: { maxWorkers: 4, environment: 'jsdom', setupFiles: ['./src/tests/setup.ts'], restoreMocks: true,
    include: ['src/tests/**/*.test.{ts,tsx}'], testTimeout: 10000 }
});
