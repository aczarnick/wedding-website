import { ImportForm } from '@/components/admin/ImportForm';

const AdminDataPage = () => (
  <section>
    <h1 className='text-3xl text-sage-800'>Data</h1>
    <p className='mt-2 text-sm text-sage-700/80'>
      Export the full guest list as a CSV, or import new parties from one.
    </p>

    <div className='mt-8'>
      <h2 className='text-lg text-sage-800'>Export</h2>
      <a
        href='/api/admin/export'
        download
        className='mt-3 inline-block rounded-lg bg-sage-700 px-4 py-2.5 text-white hover:bg-sage-800'
      >
        Download CSV
      </a>
    </div>

    <div className='mt-10'>
      <h2 className='text-lg text-sage-800'>Import</h2>
      <ImportForm />
    </div>
  </section>
);

export default AdminDataPage;
