import { randomBytes } from 'node:crypto';
import request from 'supertest';
import { createApp } from '../../src/app.js';

export const origin = 'http://localhost:5173';
export const eventTime = new Date('2040-01-01T00:00:00.000Z');
export const eventInput = {
  title: 'Cloud Engineering Workshop', description: 'A hands-on workshop.', venue: 'SST Bengaluru',
  startAt: '2040-02-10T10:00:00.000Z', endAt: '2040-02-10T13:00:00.000Z',
  registrationDeadline: '2040-02-09T18:00:00.000Z', capacity: 100, pricePaise: 19900
};
export function eventsApp() {
  return createApp({ mode: 'test', logLevel: 'silent', authEnvironment: {
    JWT_SECRET: randomBytes(48).toString('base64url'), CLIENT_ORIGIN: origin,
    AUTH_LOGIN_MAX_REQUESTS: '1000', AUTH_REGISTER_MAX_REQUESTS: '1000'
  } });
}
export type EventsApp = ReturnType<typeof eventsApp>;
export async function actor(app: EventsApp, role = 'ORGANIZER', email = 'organizer@example.test') {
  const response = await request(app).post('/api/auth/register').set('Origin', origin).send({
    name: 'Test Organizer', email, role, password: 'Disposable Test-only Password!'
  }).expect(201);
  const cookies = response.headers['set-cookie'] as unknown as string[];
  const cookie = cookies[0]?.split(';')[0];
  if (!cookie) throw new Error('Expected test session cookie');
  return { cookie, id: response.body.data.user.id as string };
}
export function createDraft(app: EventsApp, cookie: string, overrides: Record<string, unknown> = {}) {
  return request(app).post('/api/organizer/events').set('Origin', origin).set('Cookie', cookie).send({ ...eventInput, ...overrides });
}
