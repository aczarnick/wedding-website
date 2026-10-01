import { SCHEDULE } from '@/constants/schedule';

export const ScheduleSection: React.FC = () => {
  return (
    <div className="flex justify-center px-6">
      <div className="w-full max-w-2xl p-6 sm:p-8 rounded-2xl bg-white/80 shadow-sm ring-1 ring-sage-100 text-sage-700">
        <h2 className="text-2xl text-center text-sage-800">Schedule</h2>

        <ul className="mt-6 space-y-4 text-center">
          {SCHEDULE.map((item) => (
            <li key={item.event}>
              <span className="block text-xs uppercase tracking-[0.3em] text-sage-700/70">{item.time}</span>
              <span className="block mt-1 text-lg text-sage-800">{item.event}</span>
            </li>
          ))}
        </ul>

        <p className="mt-8 p-4 rounded-xl bg-sage-50 ring-1 ring-sage-200 text-center font-semibold text-sage-800">
          Come ready to dance!
        </p>
      </div>
    </div>
  );
};
