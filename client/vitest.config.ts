import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: { environment: 'jsdom', setupFiles: ['./src/tests/setup.ts'], restoreMocks: true,
    include: ['src/tests/**/*.test.{ts,tsx}'], testTimeout: 10000 }
});
