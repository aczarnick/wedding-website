import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { SignInForm } from '@/components/admin/SignInForm';
import { GradientGlowDivider } from '@/components/dividers';
import { isAdminEmail } from '@/lib/auth/allowlist';
import { resolveAdminCallbackPath } from '@/lib/admin/callbackPath';

interface SignInPageProps {
  searchParams: Promise<{ callbackUrl?: string }>;
}

/**
 * Reads `callbackUrl` here rather than in the form: `useSearchParams()` inside a
 * client component would need a suspense boundary and fails the production build
 * without one.
 */
const SignInPage = async ({ searchParams }: SignInPageProps) => {
  const { callbackUrl } = await searchParams;
  const callbackPath = resolveAdminCallbackPath(callbackUrl);
  const session = await auth();

  if (isAdminEmail(session?.user?.email ?? '')) {
    redirect(callbackPath);
  }

  return (
    <div className='min-h-screen flex flex-col bg-sage-50/70'>
      <GradientGlowDivider className='flex-1 flex flex-col' glowPosition='top'>
        <main className='flex-1 flex flex-col items-center justify-center px-5 py-12 sm:px-6'>
          <div className='w-full max-w-md rounded-2xl border border-sage-200/70 bg-white/80 px-6 py-10 shadow-sm backdrop-blur-sm sm:px-10'>
            <div className='text-center'>
              <h1 className='text-3xl text-sage-800'>Admin sign in</h1>
              <p className='mt-3 text-xs uppercase tracking-[0.4em] text-sage-700/70'>
                Alex &amp; Claire
              </p>
              <div aria-hidden='true' className='mx-auto mt-5 h-0.5 w-16 bg-sage-200' />
            </div>

            <SignInForm callbackPath={callbackPath} />
          </div>
        </main>
      </GradientGlowDivider>
    </div>
  );
};

export default SignInPage;
