export default function Registry({ entries, notes }) {
  return (
    <section id="registry" className="bg-accent/20 px-6 py-20 sm:px-10">
      <div className="mx-auto max-w-4xl">
        <h2 className="font-display text-3xl tracking-tight text-text sm:text-[1.75rem]">Registry</h2>
        <p className="mt-4 text-base text-text/80">{notes}</p>
        <div className="mt-10 grid gap-6 sm:grid-cols-2">
          {entries.map((entry) => (
            <article
              key={entry.platform}
              className="flex flex-col rounded-3xl border border-primary/40 bg-background p-6 shadow-sm"
            >
              <h3 className="font-display text-xl text-text">{entry.platform}</h3>
              {entry.url ? (
                <a
                  href={entry.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 inline-flex text-sm font-medium text-text underline underline-offset-4"
                >
                  Visit Registry
                </a>
              ) : (
                <p className="mt-4 text-sm text-text/60">Link coming soon.</p>
              )}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
