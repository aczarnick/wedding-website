import { redirect } from 'next/navigation';
import { auth, signOut } from '@/auth';
import { AdminNav } from '@/components/admin/AdminNav';
import { isAdminEmail } from '@/lib/auth/allowlist';

/**
 * Guards the console a second time behind `src/proxy.ts`. The proxy already
 * rejects unauthenticated requests, but a page cannot use
 * `requireAdminSession()` — that helper answers with a JSON `Response` for route
 * handlers, whereas a browser navigating here needs the redirect the proxy
 * serves for page paths.
 */
const AdminLayout = async ({ children }: { children: React.ReactNode }) => {
  const session = await auth();
  const email = session?.user?.email ?? '';

  if (!isAdminEmail(email)) {
    redirect('/signin?callbackUrl=/admin');
  }

  const endSession = async () => {
    'use server';
    await signOut({ redirectTo: '/signin' });
  };

  return (
    <div className='min-h-screen bg-sage-50/70'>
      <header className='border-b border-sage-200/70 bg-white/80 backdrop-blur-sm'>
        <div className='mx-auto flex max-w-5xl flex-wrap items-center gap-x-8 gap-y-3 px-5 py-4 sm:px-6'>
          <span className='text-lg text-sage-800'>Alex &amp; Claire</span>

          <AdminNav />

          <div className='ml-auto flex items-center gap-4'>
            <span className='hidden text-sm text-sage-700/80 sm:inline'>{email}</span>
            <form action={endSession}>
              <button
                type='submit'
                className='rounded-lg border border-sage-200 px-3 py-1.5 text-sm text-sage-700 hover:bg-sage-100'
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className='mx-auto max-w-5xl px-5 py-10 sm:px-6 sm:py-12'>{children}</main>
    </div>
  );
};

export default AdminLayout;
