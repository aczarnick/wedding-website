import { RSVP_STATUS } from '@/lib/enums';

const PILL_CLASSES: Record<string, string> = {
  [RSVP_STATUS.attending]: 'bg-sage-700 text-white',
  [RSVP_STATUS.declined]: 'bg-sage-200 text-sage-800',
  [RSVP_STATUS.pending]: 'border border-sage-300 text-sage-700',
};

export const RsvpStatusBadge: React.FC<{ status: string }> = ({ status }) => (
  <span
    className={`rounded-full px-2.5 py-0.5 text-xs capitalize ${
      PILL_CLASSES[status] ?? PILL_CLASSES[RSVP_STATUS.pending]
    }`}
  >
    {status}
  </span>
);
