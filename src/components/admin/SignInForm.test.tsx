import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SignInForm } from './SignInForm';

const signIn = vi.hoisted(() => vi.fn());
const push = vi.hoisted(() => vi.fn());
const refresh = vi.hoisted(() => vi.fn());

vi.mock('next-auth/react', () => ({ signIn }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }));

const submitCredentials = () => {
  fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'admin@example.com' } });
  fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'hunter2' } });
  fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
};

describe('SignInForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends the credentials without letting Auth.js redirect', async () => {
    signIn.mockResolvedValue({ error: undefined });
    render(<SignInForm callbackPath='/admin' />);

    submitCredentials();

    await waitFor(() =>
      expect(signIn).toHaveBeenCalledWith('credentials', {
        email: 'admin@example.com',
        password: 'hunter2',
        redirect: false,
      }),
    );
  });

  it('navigates to the resolved callback path on success', async () => {
    signIn.mockResolvedValue({ error: undefined });
    render(<SignInForm callbackPath='/admin/guests?flagged=1' />);

    submitCredentials();

    await waitFor(() => expect(push).toHaveBeenCalledWith('/admin/guests?flagged=1'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('reports a rejected sign-in without navigating', async () => {
    signIn.mockResolvedValue({ error: 'CredentialsSignin' });
    render(<SignInForm callbackPath='/admin' />);

    submitCredentials();

    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect email or password.');
    expect(push).not.toHaveBeenCalled();
  });

  it('does not disclose which half of the credentials was wrong', async () => {
    signIn.mockResolvedValue({ error: 'CredentialsSignin' });
    render(<SignInForm callbackPath='/admin' />);

    submitCredentials();

    const alert = await screen.findByRole('alert');

    expect(alert).not.toHaveTextContent(/CredentialsSignin/i);
    expect(alert).not.toHaveTextContent(/unknown|no such|not found/i);
  });

  it('reports a network failure instead of hanging on the submit button', async () => {
    signIn.mockRejectedValue(new Error('offline'));
    render(<SignInForm callbackPath='/admin' />);

    submitCredentials();

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong.');
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeEnabled();
  });
});
