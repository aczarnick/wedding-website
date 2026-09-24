import { SHUTTLE } from '@/constants/shuttle';

export const ShuttleSection: React.FC = () => {
  const [firstRideHome, lastRideHome] = SHUTTLE.lastRidesHome;

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
          straight to the farm. Each run seats {SHUTTLE.capacity} guests, first come, first served. If a bus
          is full, catch the next one.
        </p>

        <div className="mt-8 space-y-6 text-center">
          <div>
            <h3 className="text-xs uppercase tracking-[0.3em] text-sage-700/70">Before the ceremony</h3>
            <ul className="mt-3 space-y-1 text-sage-800">
              {SHUTTLE.preCeremony.map((trip) => (
                <li key={trip.pickup}>
                  Hotel pickup {trip.pickup}, arrives at the farm {trip.arrival}
                  {trip.note && <span className="block text-xs text-sage-700/70">{trip.note}</span>}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-xs uppercase tracking-[0.3em] text-sage-700/70">After that</h3>
            <p className="mt-3 text-sage-800">
              The shuttle runs every hour, on the hour, starting at {SHUTTLE.hourlyFrom}.
            </p>
          </div>

          <div>
            <h3 className="text-xs uppercase tracking-[0.3em] text-sage-700/70">Heading home</h3>
            <p className="mt-3 text-sage-800">
              The last rides back to the hotels leave the farm at {firstRideHome} and {lastRideHome}.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
