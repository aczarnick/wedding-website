import Link from 'next/link';
import { StepHeading } from './StepHeading';

interface RsvpClosedProps {
  deadline: string | null;
}

/**
 * Formats the deadline in UTC so every guest sees the same date the server
 * stored, rather than one shifted by their own timezone.
 */
const formatDeadline = (deadline: string | null): string | null => {
  if (!deadline) {
    return null;
  }

  const parsed = new Date(deadline);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toLocaleDateString('en-US', {
    timeZone: 'UTC',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
};

export const RsvpClosed: React.FC<RsvpClosedProps> = ({ deadline }) => {
  const closedOn = formatDeadline(deadline);

  return (
    <section className='w-full text-center'>
      <StepHeading title='RSVPs are closed' eyebrow='Guest list closed' />

      <p className='mt-6 text-sage-700'>
        {closedOn
          ? `Thank you — our guest list closed on ${closedOn}.`
          : 'Thank you — our guest list is now closed.'}
      </p>

      <p className='mt-4 text-sm text-sage-700'>
        If you need to make a change, please contact the bride or groom.
      </p>

      <Link href='/' className='mt-8 block text-sm text-sage-700 underline'>
        Back to the wedding site
      </Link>
    </section>
  );
};
