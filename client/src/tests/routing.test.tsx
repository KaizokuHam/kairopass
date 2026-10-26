import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/context/AuthProvider';
import { App } from '@/App';
import { attendee, deferred, failure, json, organizer, userResponse } from './fixtures';

function boundary(me: () => Response | Promise<Response>) {
  const fetcher = vi.fn((path: string) => {
    if (path === '/api/health') return Promise.resolve(json({ success: true, message: 'KairoPass API is running' }));
    if (path === '/api/auth/logout') return Promise.resolve(json({ success: true, message: 'Logged out successfully.' }));
    return Promise.resolve(me());
  });
  vi.stubGlobal('fetch', fetcher); return fetcher;
}
function show(path: string) {
  return render(<MemoryRouter useTransitions={false} initialEntries={[path]}><AuthProvider><App /></AuthProvider></MemoryRouter>);
}

describe('protected routes and role-aware navigation', () => {
  it('redirects a confirmed unauthenticated guest to login', async () => {
    boundary(() => failure(401)); show('/attendee/dashboard');
    expect(await screen.findByRole('heading', { name: 'Welcome back.' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Your account' })).not.toBeInTheDocument();
  });

  it('hides protected content until initialization finishes', async () => {
    const pending = deferred<Response>(); boundary(() => pending.promise); show('/attendee/dashboard');
    expect(screen.getByRole('heading', { name: 'Getting your space ready.' })).toBeInTheDocument();
    expect(screen.queryByText(attendee.email)).not.toBeInTheDocument();
    await act(async () => { pending.resolve(userResponse()); });
    expect(await screen.findByRole('heading', { name: `Welcome, ${attendee.name}.` })).toBeInTheDocument();
  });

  it('keeps unavailable sessions at a recoverable gate rather than redirecting to login', async () => {
    let unavailable = true; boundary(() => unavailable ? failure(503) : userResponse()); show('/attendee/dashboard');
    expect(await screen.findByRole('heading', { name: 'Let’s reconnect.' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Welcome back.' })).not.toBeInTheDocument();
    unavailable = false;
    await userEvent.click(screen.getByRole('button', { name: 'Retry connection' }));
    expect(await screen.findByText(attendee.email)).toBeInTheDocument();
  });

  it.each([
    { user: attendee, path: '/organizer/dashboard' }, { user: organizer, path: '/attendee/dashboard' }
  ])('rejects cross-role content for $user.role', async ({ user, path }) => {
    boundary(() => userResponse(user)); show(path);
    expect(await screen.findByRole('heading', { name: 'This space belongs to another role.' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Your account' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'Go to my dashboard' }));
    expect(await screen.findByRole('heading', { name: `Welcome, ${user.name}.` })).toBeInTheDocument();
  });

  it.each(['/login', '/register'])('redirects an authenticated organizer away from %s', async (path) => {
    boundary(() => userResponse(organizer)); show(path);
    expect(await screen.findByRole('heading', { name: `Welcome, ${organizer.name}.` })).toBeInTheDocument();
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();
  });

  it('shows actual account data and clearly unavailable future features', async () => {
    boundary(() => userResponse()); show('/attendee/dashboard');
    expect(await screen.findByText(attendee.email)).toBeInTheDocument();
    expect(screen.getByText('Explore Events').closest('li')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('My Reservations').closest('li')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.queryByRole('link', { name: /Explore Events/ })).not.toBeInTheDocument();
  });

  it('returns to the public page after confirmed logout and blocks a subsequent protected visit', async () => {
    let signedIn = true;
    const fetcher = boundary(() => signedIn ? userResponse() : failure(401));
    show('/attendee/dashboard');
    await screen.findByText(attendee.email);
    signedIn = false;
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('heading', { name: /Your next/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument();
    expect(fetcher.mock.calls.some(([path]) => path === '/api/auth/logout')).toBe(true);
  });

  it('keeps public pages accessible and operates compact navigation with Escape', async () => {
    boundary(() => failure(401)); show('/vision');
    expect(screen.getByRole('heading', { name: /Built around/ })).toBeInTheDocument();
    await screen.findByRole('link', { name: 'Get started' });
    const toggle = screen.getByRole('button', { name: 'Open navigation' });
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await userEvent.keyboard('{Escape}');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveFocus();
  });
});
