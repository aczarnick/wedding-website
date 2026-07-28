import Link from 'next/link';

interface SessionExpiredNoticeProps {
  className?: string;
}

export const SessionExpiredNotice: React.FC<SessionExpiredNoticeProps> = ({ className = '' }) => (
  <p role='alert' className={`text-sm text-red-700 ${className}`}>
    Your session has expired.{' '}
    <Link href='/signin' className='underline'>
      Sign in again
    </Link>
    .
  </p>
);
