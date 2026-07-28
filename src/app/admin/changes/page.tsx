import { AuditLogViewer } from '@/components/admin/AuditLogViewer';

const AdminChangesPage = () => (
  <section>
    <h1 className='text-3xl text-sage-800'>Changes</h1>
    <p className='mt-2 text-sm text-sage-700/80'>
      A change log of every party, guest, and settings update, newest first.
    </p>

    <div className='mt-8'>
      <AuditLogViewer />
    </div>
  </section>
);

export default AdminChangesPage;
