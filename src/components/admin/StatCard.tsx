interface StatCardProps {
  label: string;
  value: number;
  /** Draws attention to a count that means work is waiting, such as flagged guests. */
  needsAttention?: boolean;
}

export const StatCard: React.FC<StatCardProps> = ({ label, value, needsAttention = false }) => (
  <div
    className={`rounded-2xl border px-5 py-6 shadow-sm ${
      needsAttention ? 'border-amber-300/70 bg-amber-50/80' : 'border-sage-200/70 bg-white/80'
    }`}
  >
    <dt className='text-xs uppercase tracking-[0.3em] text-sage-700/70'>{label}</dt>
    <dd className={`mt-3 text-4xl ${needsAttention ? 'text-amber-800' : 'text-sage-800'}`}>
      {value}
    </dd>
  </div>
);
