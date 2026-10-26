import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/context/AuthProvider';
import { LoginPage } from '@/pages/LoginPage';
import { RegisterPage } from '@/pages/RegisterPage';
import { safeAuthDestination } from '@/lib/auth-navigation';
import { attendee, deferred, failure, json, organizer, userResponse } from './fixtures';

function show(path = '/login') {
  return render(<AuthProvider><MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/login" element={<LoginPage />} /><Route path="/register" element={<RegisterPage />} />
    <Route path="/attendee/dashboard" element={<h1>Attendee destination</h1>} />
    <Route path="/organizer/dashboard" element={<h1>Organizer destination</h1>} />
  </Routes></MemoryRouter></AuthProvider>);
}
function mockEndpoint(response: Response | Promise<Response> = userResponse()) {
  const fetcher = vi.fn((path: string) => Promise.resolve(path === '/api/auth/me' ? failure(401) : response));
  vi.stubGlobal('fetch', fetcher); return fetcher;
}
async function fillLogin() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Email address'), attendee.email);
  await user.type(screen.getByLabelText('Password'), 'Test-only strong password');
  return user;
}
async function fillRegistration() {
  const user = await fillLogin();
  await user.type(screen.getByLabelText('Full name'), 'Kai Sen');
  await user.type(screen.getByLabelText('Confirm password'), 'Test-only strong password');
  return user;
}

describe('login and registration experiences', () => {
  it('renders labeled login fields, correct autocomplete, and a keyboard-operable visibility toggle', async () => {
    mockEndpoint(); show();
    expect(screen.getByRole('heading', { name: 'Welcome back.' })).toBeInTheDocument();
    const password = screen.getByLabelText('Password');
    expect(password).toHaveAttribute('autocomplete', 'current-password');
    expect(password).toHaveAttribute('type', 'password');
    await userEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(password).toHaveAttribute('type', 'text');
    expect(screen.getByRole('link', { name: /Create an account/ })).toHaveAttribute('href', '/register');
  });

  it('shows required field errors and validates email without making a login request', async () => {
    const fetcher = mockEndpoint(); show();
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument();
    expect(screen.getByText('Use at least 8 characters.')).toBeInTheDocument();
    expect(screen.getByLabelText('Email address')).toHaveAttribute('aria-invalid', 'true');
    expect(fetcher.mock.calls.filter(([path]) => path === '/api/auth/login')).toHaveLength(0);
  });

  it('validates registration password confirmation and supports both role choices', async () => {
    const fetcher = mockEndpoint(); show('/register');
    const user = await fillRegistration();
    expect(screen.getByRole('radio', { name: /Attendee/ })).toBeChecked();
    await user.click(screen.getByRole('radio', { name: /Organizer/ }));
    expect(screen.getByRole('radio', { name: /Organizer/ })).toBeChecked();
    await user.clear(screen.getByLabelText('Confirm password'));
    await user.type(screen.getByLabelText('Confirm password'), 'Different password');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getByText('Your passwords do not match.')).toBeInTheDocument();
    expect(fetcher.mock.calls.filter(([path]) => path === '/api/auth/register')).toHaveLength(0);
  });

  it('logs in through the HTTP boundary and navigates to the actual user’s dashboard', async () => {
    mockEndpoint(); show();
    const user = await fillLogin();
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('heading', { name: 'Attendee destination' })).toBeInTheDocument();
  });

  it('registers the selected organizer role, omits confirmPassword, and redirects without another login', async () => {
    const fetcher = mockEndpoint(userResponse(organizer)); show('/register');
    const user = await fillRegistration();
    await user.click(screen.getByRole('radio', { name: /Organizer/ }));
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByRole('heading', { name: 'Organizer destination' })).toBeInTheDocument();
    const calls = fetcher.mock.calls as unknown as Array<[string, RequestInit]>;
    const body = calls.find(([path]) => path === '/api/auth/register')?.[1].body;
    expect(JSON.parse(String(body))).toMatchObject({ role: 'ORGANIZER', name: 'Kai Sen' });
    expect(JSON.parse(String(body))).not.toHaveProperty('confirmPassword');
    expect(calls.some(([path]) => path === '/api/auth/login')).toBe(false);
  });

  it.each([401, 409, 429, 503])('shows appropriate HTTP %s feedback and preserves input', async (status) => {
    const code = { 401: 'INVALID_CREDENTIALS', 409: 'EMAIL_IN_USE', 429: 'RATE_LIMITED', 503: 'AUTH_UNAVAILABLE' }[status];
    const response = status === 429 ? json({ success: false, error: { code } }, 429, { 'Retry-After': '120' }) : failure(status, code);
    mockEndpoint(response); show(status === 409 ? '/register' : '/login');
    const user = status === 409 ? await fillRegistration() : await fillLogin();
    await user.click(screen.getByRole('button', { name: status === 409 ? 'Create account' : 'Sign in' }));
    const alert = await screen.findByRole('alert');
    expect(alert).not.toHaveTextContent('secret-bearing');
    expect(screen.getByLabelText('Email address')).toHaveValue(attendee.email);
    expect(screen.getByLabelText('Password')).toHaveValue('Test-only strong password');
    if (status === 401) expect(alert).toHaveTextContent('Invalid email or password');
    if (status === 409) expect(alert).toHaveTextContent('already exists');
    if (status === 429) expect(alert).toHaveTextContent('2 minutes');
    if (status === 503) expect(alert).toHaveTextContent('temporarily unavailable');
  });

  it('disables submission and controls while pending and prevents duplicate requests', async () => {
    const pending = deferred<Response>(); const fetcher = mockEndpoint(pending.promise); show();
    const user = await fillLogin();
    await user.dblClick(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByRole('button', { name: /Signing in/ })).toBeDisabled();
    expect(screen.getByLabelText('Email address')).toBeDisabled();
    expect(fetcher.mock.calls.filter(([path]) => path === '/api/auth/login')).toHaveLength(1);
    pending.resolve(userResponse());
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Attendee destination' })).toBeInTheDocument());
  });
});

describe('safe role-aware return destinations', () => {
  it.each(['https://untrusted.example', '//untrusted.example', '/\\untrusted.example', '/organizer/dashboard', '/login', '/%2fattendee/dashboard'])('rejects an external or inaccessible target %s', (path) => {
    expect(safeAuthDestination('ATTENDEE', path)).toBe('/attendee/dashboard');
  });
  it('preserves a safe local destination for the verified role', () => {
    expect(safeAuthDestination('ORGANIZER', '/organizer/dashboard?tab=account#details')).toBe('/organizer/dashboard?tab=account#details');
  });
});
