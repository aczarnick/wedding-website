import { StatGrid } from '@/components/admin/StatGrid';
import { getSummaryStats } from '@/lib/admin/stats';
import { getPrismaClient } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const AdminDashboardPage = async () => {
  const stats = await getSummaryStats(getPrismaClient());

  return (
    <section>
      <h1 className='text-3xl text-sage-800'>Dashboard</h1>
      <p className='mt-2 text-sm text-sage-700/80'>Where the guest list stands right now.</p>

      <div className='mt-8'>
        <StatGrid stats={stats} />
      </div>
    </section>
  );
};

export default AdminDashboardPage;
