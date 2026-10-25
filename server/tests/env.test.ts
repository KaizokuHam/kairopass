import { describe, expect, it } from 'vitest';
import { parseEnvironment } from '../src/config/env.js';

describe('environment configuration', () => {
  it('has working defaults without database or authentication configuration', () => {
    expect(parseEnvironment({})).toEqual({
      NODE_ENV: 'development', HOST: '127.0.0.1', PORT: 4000,
      CLIENT_ORIGIN: 'http://localhost:5173', LOG_LEVEL: 'info'
    });
  });

  it('parses explicit runtime values and ignores future configuration', () => {
    expect(parseEnvironment({
      NODE_ENV: 'production', HOST: '0.0.0.0', PORT: '8080', LOG_LEVEL: 'silent',
      CLIENT_ORIGIN: 'https://kairopass.example', DATABASE_URL: 'unused-in-task-01'
    })).toEqual({
      NODE_ENV: 'production', HOST: '0.0.0.0', PORT: 8080,
      CLIENT_ORIGIN: 'https://kairopass.example', LOG_LEVEL: 'silent'
    });
  });

  it.each([
    { PORT: '0' }, { PORT: '65536' }, { PORT: 'not-a-port' },
    { NODE_ENV: 'invalid' }, { LOG_LEVEL: 'debug' },
    { CLIENT_ORIGIN: 'https://example.com/a/path' }, { CLIENT_ORIGIN: 'file:///tmp' }
  ])('rejects invalid runtime configuration: %o', (input) => {
    expect(() => parseEnvironment(input)).toThrow('Invalid environment configuration');
  });
});
