export default function Accommodations({ hotels, notes }: { hotels: { name: string; address: string; additionalDetails?: string; link: string }[]; notes: string; }) {
  return (
    <section id="accommodations" className="bg-accent/40 px-6 py-20 sm:px-10">
      <div className="mx-auto max-w-4xl">
        <h2 className="font-display text-3xl tracking-tight text-text sm:text-[1.75rem]">Stay Nearby</h2>
        <p className="mt-4 text-base text-text/80">{notes}</p>
        <div className="mt-10 grid gap-6 sm:grid-cols-2">
          {hotels.map((hotel) => (
            <article key={hotel.name} className="rounded-3xl border border-primary/40 bg-background p-6 shadow-xs">
              <h3 className="font-display text-xl text-text">{hotel.name}</h3>
              <p className="mt-2 text-sm text-text/70">{hotel.address}</p>
              <p className="mt-2 text-sm text-text/70">{hotel.additionalDetails}</p>
              {hotel.link ? (
                <a
                  href={hotel.link}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 inline-flex text-sm font-medium text-text underline underline-offset-4"
                >
                  View Website
                </a>
              ) : (
                <p className="mt-4 text-sm text-text/60">Booking link coming soon.</p>
              )}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
