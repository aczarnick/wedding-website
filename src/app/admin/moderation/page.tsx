import { ModerationQueue } from '@/components/admin/ModerationQueue';

export const dynamic = 'force-dynamic';

const AdminModerationPage = () => (
  <section>
    <h1 className='text-3xl text-sage-800'>Moderation</h1>
    <p className='mt-2 text-sm text-sage-700/80'>
      Plus-ones guests added themselves, waiting on your approval.
    </p>

    <div className='mt-8'>
      <ModerationQueue />
    </div>
  </section>
);

export default AdminModerationPage;
