import type { SummaryStats } from '@/lib/admin/stats';
import { StatCard } from './StatCard';

interface StatGridProps {
  stats: SummaryStats;
}

export const StatGrid: React.FC<StatGridProps> = ({ stats }) => (
  <dl className='grid grid-cols-2 gap-4 sm:grid-cols-3'>
    <StatCard label='Parties' value={stats.parties} />
    <StatCard label='Invited' value={stats.invited} />
    <StatCard label='Attending' value={stats.attending} />
    <StatCard label='Declined' value={stats.declined} />
    <StatCard label='Pending' value={stats.pending} />
    <StatCard label='Flagged' value={stats.flagged} needsAttention={stats.flagged > 0} />
  </dl>
);
