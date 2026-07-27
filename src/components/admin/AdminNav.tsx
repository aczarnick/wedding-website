import Link from 'next/link';
import { ADMIN_NAV_LINKS } from '@/constants/admin';

export const AdminNav: React.FC = () => (
  <nav aria-label='Admin' className='flex items-center gap-6'>
    {ADMIN_NAV_LINKS.map((link) => (
      <Link key={link.href} href={link.href} className='text-sm text-sage-700 hover:text-sage-800'>
        {link.label}
      </Link>
    ))}
  </nav>
);
