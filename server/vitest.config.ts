import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Isolate replica-set fixtures from host contention. Real 20-request races stay parallel
    // inside their suites; per-file isolation and all existing deadlines remain.
    maxWorkers: 1,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    env: { NODE_ENV: 'test', LOG_LEVEL: 'silent' },
    clearMocks: true,
    restoreMocks: true,
    hookTimeout: 180_000,
    testTimeout: 20_000
  }
});
