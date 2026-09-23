import { SHUTTLE } from '@/constants/shuttle';

export const ShuttleSection: React.FC = () => {
  return (
    <div className="flex justify-center px-6">
      <div className="w-full max-w-2xl p-6 sm:p-8 rounded-2xl bg-white/80 shadow-sm ring-1 ring-sage-100 text-sage-700">
        <h2 className="text-2xl text-center text-sage-800">Shuttle</h2>

        <p className="mt-4 p-4 rounded-xl bg-sage-50 ring-1 ring-sage-200 text-center text-sage-800">
          <span className="font-semibold">Please ride the shuttle!</span>{' '}
          Parking at the farm is extremely limited, so we&apos;re asking everyone to leave the car at the hotel.
        </p>

        <p className="text-sm mt-6 text-center">
          The bus picks up at {SHUTTLE.stops[0]}, then {SHUTTLE.stops[1]} across the street, and heads
          straight to the farm. Be out front at the pickup time.
        </p>
        <p className="text-sm mt-2 text-center">
          Each run seats {SHUTTLE.capacity} guests, first come, first served. If a bus is full, catch the
          next one.
        </p>

        <div className="mt-8 grid gap-8 sm:grid-cols-2">
          <div>
            <h3 className="text-xs uppercase tracking-[0.3em] text-sage-700/70 text-center">To the farm</h3>
            <table className="mt-3 w-full text-sm">
              <thead>
                <tr className="text-sage-800">
                  <th className="text-left font-semibold pb-2">Hotel pickup</th>
                  <th className="text-right font-semibold pb-2">Arrives</th>
                </tr>
              </thead>
              <tbody>
                {SHUTTLE.toFarm.map((run) => (
                  <tr key={run.pickup} className="border-t border-sage-100">
                    <td className="py-1.5">
                      {run.pickup}
                      {run.note && <span className="block text-xs text-sage-700/70">{run.note}</span>}
                    </td>
                    <td className="py-1.5 text-right align-top">{run.arrival}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div>
            <h3 className="text-xs uppercase tracking-[0.3em] text-sage-700/70 text-center">Back to the hotels</h3>
            <table className="mt-3 w-full text-sm">
              <thead>
                <tr className="text-sage-800">
                  <th className="text-left font-semibold pb-2">Leaves the farm</th>
                </tr>
              </thead>
              <tbody>
                {SHUTTLE.toHotels.map((time, index) => (
                  <tr key={time} className="border-t border-sage-100">
                    <td className="py-1.5">
                      {time}
                      {index === SHUTTLE.toHotels.length - 1 && (
                        <span className="block text-xs text-sage-700/70">Last ride of the night</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
