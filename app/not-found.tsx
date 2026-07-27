import Link from "next/link";

const DESTINATIONS = [
  {
    href: "/",
    label: "Home",
    detail: "Start again from the TMRE homepage",
  },
  {
    href: "/intelligence",
    label: "Intelligence",
    detail: "Live deal board, filters, and market graphs",
  },
  {
    href: "/deal-of-the-day",
    label: "Deal of the Day",
    detail: "Today’s best below-median value pick",
  },
] as const;

export default function NotFound() {
  return (
    <>
      <section className="navy-gradient text-white pt-20 pb-10 lg:pt-28 lg:pb-14 relative overflow-hidden">
        <div className="absolute inset-0 hero-grid opacity-40" aria-hidden />
        <div className="relative mx-auto max-w-7xl px-6 lg:px-10">
          <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold mb-3">
            404
          </p>
          <h1 className="font-serif italic text-4xl sm:text-5xl lg:text-6xl text-white leading-[1.05] max-w-3xl">
            Page not found.
          </h1>
          <p className="mt-3 text-sm lg:text-base text-white/70 max-w-xl leading-relaxed">
            That link doesn&rsquo;t lead anywhere on this site. Try one of these
            instead.
          </p>
        </div>
      </section>

      <section className="bg-cream py-12 lg:py-16">
        <div className="mx-auto max-w-7xl px-6 lg:px-10">
          <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold mb-6">
            Where to go
          </p>
          <ul className="space-y-5 max-w-xl">
            {DESTINATIONS.map((dest) => (
              <li key={dest.href}>
                <Link
                  href={dest.href}
                  className="group block text-left transition-colors"
                >
                  <span className="font-mono text-[12px] tracking-[0.16em] uppercase text-navy group-hover:text-gold transition-colors underline underline-offset-4 decoration-navy/25 group-hover:decoration-gold/50">
                    {dest.label}
                  </span>
                  <span className="mt-1 block text-sm text-charcoal/60 leading-snug">
                    {dest.detail}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}
