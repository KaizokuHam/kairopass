import { describe, expect, it } from 'vitest';
import { parseEnvironment } from '../src/config/env.js';

describe('environment configuration', () => {
  it('allows liveness without database or authentication configuration', () => {
    expect(parseEnvironment({})).toEqual({
      NODE_ENV: 'development', HOST: '127.0.0.1', PORT: 4000,
      CLIENT_ORIGIN: 'http://localhost:5173', LOG_LEVEL: 'info'
    });
  });

  it('parses explicit runtime values and a MongoDB Atlas URI', () => {
    expect(parseEnvironment({
      NODE_ENV: 'production', HOST: '0.0.0.0', PORT: '8080', LOG_LEVEL: 'silent',
      CLIENT_ORIGIN: 'https://kairopass.example', MONGODB_URI: 'mongodb+srv://cluster.example/kairopass'
    })).toEqual({
      NODE_ENV: 'production', HOST: '0.0.0.0', PORT: 8080,
      CLIENT_ORIGIN: 'https://kairopass.example', LOG_LEVEL: 'silent', MONGODB_URI: 'mongodb+srv://cluster.example/kairopass'
    });
  });

  it('defaults production to a network-reachable interface while honoring the platform port', () => {
    expect(parseEnvironment({ NODE_ENV: 'production', PORT: '8080' })).toMatchObject({ HOST: '0.0.0.0', PORT: 8080 });
    expect(parseEnvironment({ NODE_ENV: 'test' }).HOST).toBe('127.0.0.1');
  });

  it('preserves an explicitly configured bind address in production', () => {
    expect(parseEnvironment({ NODE_ENV: 'production', HOST: '127.0.0.1' }).HOST).toBe('127.0.0.1');
    expect(parseEnvironment({ NODE_ENV: 'production', HOST: '::' }).HOST).toBe('::');
    expect(() => parseEnvironment({ NODE_ENV: 'production', HOST: '' })).toThrow('Invalid environment configuration');
  });

  it.each([
    { PORT: '0' }, { PORT: '65536' }, { PORT: 'not-a-port' },
    { NODE_ENV: 'invalid' }, { LOG_LEVEL: 'debug' },
    { CLIENT_ORIGIN: 'https://example.com/a/path' }, { CLIENT_ORIGIN: 'file:///tmp' },
    { MONGODB_URI: '' }, { MONGODB_URI: 'https://example.com/database' }
  ])('rejects invalid runtime configuration: %o', (input) => {
    expect(() => parseEnvironment(input)).toThrow('Invalid environment configuration');
  });
});
