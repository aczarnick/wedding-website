import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { isAdminEmail } from '@/lib/auth/allowlist';
import { verifyAdminCredentials } from '@/lib/auth/credentials';

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: 'jwt', maxAge: SESSION_MAX_AGE_SECONDS },
  pages: { signIn: '/signin' },
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const email = typeof credentials?.email === 'string' ? credentials.email : '';
        const password = typeof credentials?.password === 'string' ? credentials.password : '';

        if (!(await verifyAdminCredentials(email, password))) {
          return null;
        }

        return { id: email.trim().toLowerCase(), email: email.trim().toLowerCase() };
      },
    }),
  ],
  callbacks: {
    signIn({ user }) {
      return isAdminEmail(user.email ?? '');
    },
  },
});
