import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    env: { NODE_ENV: 'test', LOG_LEVEL: 'silent' },
    clearMocks: true,
    restoreMocks: true,
    hookTimeout: 180_000,
    testTimeout: 20_000
  }
});
