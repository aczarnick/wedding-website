import { PartyManager } from '@/components/admin/PartyManager';

export const dynamic = 'force-dynamic';

const AdminPartiesPage = () => (
  <section>
    <h1 className='text-3xl text-sage-800'>Parties</h1>
    <p className='mt-2 text-sm text-sage-700/80'>
      Search the guest list, edit invitations, and record RSVPs on a guest&rsquo;s behalf.
    </p>

    <div className='mt-8'>
      <PartyManager />
    </div>
  </section>
);

export default AdminPartiesPage;
