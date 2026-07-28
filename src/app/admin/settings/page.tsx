import { SettingsForm } from '@/components/admin/SettingsForm';

const AdminSettingsPage = () => (
  <section>
    <h1 className='text-3xl text-sage-800'>Settings</h1>
    <p className='mt-2 text-sm text-sage-700/80'>
      Control the RSVP deadline and how many extra guests a party may add.
    </p>

    <div className='mt-8'>
      <SettingsForm />
    </div>
  </section>
);

export default AdminSettingsPage;
