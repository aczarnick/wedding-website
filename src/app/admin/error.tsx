'use client';

interface AdminErrorProps {
  reset: () => void;
}

/**
 * The database is Azure SQL serverless and auto-pauses, so the likeliest failure
 * on the first request of the day is a cold start rather than a broken query —
 * which makes retrying the right remedy to offer.
 */
const AdminError: React.FC<AdminErrorProps> = ({ reset }) => (
  <div className='rounded-2xl border border-sage-200/70 bg-white/80 px-6 py-10 text-center shadow-sm'>
    <h1 className='text-2xl text-sage-800'>Couldn&apos;t load the dashboard</h1>
    <p className='mt-3 text-sm text-sage-700'>The database may still be waking up.</p>

    <button
      type='button'
      onClick={reset}
      className='mt-8 rounded-lg bg-sage-700 px-5 py-2.5 text-white hover:bg-sage-800'
    >
      Try again
    </button>
  </div>
);

export default AdminError;
