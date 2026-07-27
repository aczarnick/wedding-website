'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';

interface SignInFormProps {
  callbackPath: string;
}

const FIELD_CLASS =
  'mt-2 w-full rounded-lg border border-sage-200 bg-white px-4 py-2.5 text-sage-800 outline-none focus:border-sage-700';

export const SignInForm: React.FC<SignInFormProps> = ({ callbackPath }) => {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const result = await signIn('credentials', { email, password, redirect: false });

      if (result?.error) {
        setErrorMessage('Incorrect email or password.');
        return;
      }

      router.push(callbackPath);
      router.refresh();
    } catch {
      setErrorMessage('Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className='mt-8 w-full text-left'>
      <label htmlFor='email' className='block text-sm text-sage-700'>
        Email
        <input
          id='email'
          name='email'
          type='email'
          autoComplete='username'
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className={FIELD_CLASS}
        />
      </label>

      <label htmlFor='password' className='mt-5 block text-sm text-sage-700'>
        Password
        <input
          id='password'
          name='password'
          type='password'
          autoComplete='current-password'
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className={FIELD_CLASS}
        />
      </label>

      {errorMessage && (
        <p role='alert' className='mt-5 text-sm text-red-700'>
          {errorMessage}
        </p>
      )}

      <button
        type='submit'
        disabled={isSubmitting}
        className='mt-8 w-full rounded-lg bg-sage-700 px-4 py-2.5 text-white hover:bg-sage-800 disabled:opacity-60'
      >
        {isSubmitting ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
};
