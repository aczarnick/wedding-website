export default function EventDetails({ ceremony, reception, dressCode, notes }: { ceremony: { time: string; location: string }; reception: { time: string; location: string }; dressCode: string; notes: string; }) {
  return (
    <section id="details" className="bg-background px-6 py-20 sm:px-10">
      <div className="mx-auto max-w-4xl">
        <h2 className="font-display text-3xl tracking-tight text-text sm:text-[1.75rem]">Wedding Day Details</h2>
        <span className="mb-4 inline-flex items-center rounded-full border border-[#e7cfa4] bg-white/80 px-5 py-1 text-xs tracking-[0.25em] uppercase text-[#bfa76a] shadow-xs">
          October 10, 2026 · Boone, Iowa
        </span>
        <p className="text-base text-text/80">
          We&apos;re so excited to celebrate with you. Here&apos;s everything you need to know for the day.
        </p>
        <div className="mt-10 grid gap-8 sm:grid-cols-2">
          <div className="rounded-3xl border border-primary/30 bg-accent/40 p-8">
            <h3 className="font-display text-xl text-text">Ceremony</h3>
            <p className="mt-4 text-sm text-text/80">{ceremony.time} · {ceremony.location}</p>
          </div>
          <div className="rounded-3xl border border-primary/30 bg-accent/40 p-8">
            <h3 className="font-display text-xl text-text">Reception</h3>
            <p className="mt-4 text-sm text-text/80">{reception.time} · {reception.location}</p>
          </div>
        </div>
        <div className="mt-10 flex flex-col gap-6 rounded-3xl border border-dashed border-primary/40 bg-primary/10 p-8 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.25em] text-text/60">Dress Code</p>
            <p className="mt-2 text-base text-text">{dressCode}</p>
          </div>
          <p className="text-sm text-text/80">
            {notes}
          </p>
        </div>
      </div>
    </section>
  );
}
