import Link from "next/link";
import { TMRE_TOWNS_LABEL } from "@/lib/tmre-towns";

export const metadata = {
  title: "The Deal Model — TMRE",
  description:
    "How TMRE ranks active listings — an abstract overview of the deal model used on Intelligence, Deal of the Day, and across TMRE tools.",
};

const pillars = [
  {
    title: "Value in context",
    body: "A list price only means something relative to its town, its neighbors, and what else is for sale today. The model compares each listing to local medians and peer inventory — not national averages or stale comps.",
  },
  {
    title: "Timing & momentum",
    body: "Days on market and recent price changes are honest signals. Fresh listings and motivated sellers (price cuts) score differently than properties that have sat unchanged for months.",
  },
  {
    title: "Layout & livability",
    body: "Bed and bath mix, square footage, and floor-plan quality matter for both resale liquidity and rental demand. The model rewards configurations buyers actually shop for in each market.",
  },
  {
    title: "Condition & presentation",
    body: "Age, renovation language, finishes, and photo depth proxy for how move-in ready a property feels — without pretending a listing description is a home inspection.",
  },
  {
    title: "Place & schools",
    body: "Town-level baselines and school context adjust the score so a strong pick in Norwalk is measured against Norwalk — not against a trophy address in Westport.",
  },
];

export default function DealModelPage() {
  return (
    <>
      <section className="navy-gradient text-white pt-20 pb-8 lg:pt-28 lg:pb-12 relative overflow-hidden">
        <div className="absolute inset-0 hero-grid opacity-40" aria-hidden />
        <div className="relative mx-auto max-w-7xl px-6 lg:px-10">
          <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold mb-3 animate-fade-up">
            Methodology
          </p>
          <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl text-white leading-[1.05] max-w-3xl animate-fade-up">
            The <span className="italic gold-shimmer">deal model.</span>
          </h1>
          <p className="mt-3 text-sm lg:text-base text-white/70 max-w-2xl leading-relaxed animate-fade-up-delay-1">
            An abstract framework for ranking active listings in {TMRE_TOWNS_LABEL} — built to
            answer one question: <em className="text-white/85 not-italic">where should you look first?</em>
          </p>
        </div>
      </section>

      <section className="bg-cream py-10 lg:py-16">
        <div className="mx-auto max-w-3xl px-6 lg:px-10 space-y-10">
          <div className="rounded-2xl bg-white border border-charcoal/[0.08] p-6 lg:p-8 space-y-4">
            <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">In plain terms</p>
            <p className="font-serif text-2xl text-navy leading-snug">
              Signal over noise — relative, not absolute.
            </p>
            <p className="text-charcoal/75 leading-relaxed">
              The deal model is not a price opinion and not investment advice. It is a consistent
              way to compare listings against the <strong className="font-medium text-navy">current active market</strong> in
              each town — sales and rentals, residential and commercial — so you spend time on
              properties that actually stand out, not on everything that happens to be listed.
            </p>
            <p className="text-charcoal/75 leading-relaxed">
              Scores are calibrated <strong className="font-medium text-navy">per city</strong>. A strong
              pick in Wilton is judged against Wilton inventory; the same number in Fairfield reflects
              Fairfield. That keeps rankings fair when absolute prices differ by millions between towns.
            </p>
            <p className="text-charcoal/75 leading-relaxed">
              On Intelligence, Deal of the Day, and Deal of the Week, every listing receives the same
              Goldilocks composite (0–100) — a weighted blend of age &amp; condition, finishes,
              price-per-sqft fit, layout, and schools. Deal of the Day adds extra filters (below town
              median, no new construction) to crown one value pick, but the underlying score is the
              same model on the board.
            </p>
          </div>

          <div>
            <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-slate mb-5">
              What the model looks at
            </p>
            <div className="space-y-4">
              {pillars.map((p, i) => (
                <div
                  key={p.title}
                  className="rounded-2xl bg-white border border-charcoal/[0.08] p-6 lg:p-7"
                >
                  <div className="flex items-baseline gap-3 mb-2">
                    <span className="font-mono text-[10px] tracking-[0.15em] uppercase text-slate/50">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <h2 className="font-serif text-xl text-navy">{p.title}</h2>
                  </div>
                  <p className="text-sm text-charcoal/75 leading-relaxed">{p.body}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl bg-navy text-white p-6 lg:p-8 space-y-4">
            <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
              What it is not
            </p>
            <ul className="space-y-3 text-sm text-white/70 leading-relaxed list-disc pl-5">
              <li>Not a Zestimate or automated valuation — we rank deals, we don&apos;t appraise homes.</li>
              <li>Not a substitute for walking the property, reading disclosures, or underwriting your own numbers.</li>
              <li>Not static — when price, status, or competition changes, the ranking changes with the next sync.</li>
            </ul>
          </div>

          <div className="flex flex-wrap items-center gap-4 pt-2">
            <Link
              href="/intelligence"
              className="inline-flex items-center justify-center rounded-full bg-gold px-6 py-3 text-sm font-medium text-navy transition-all hover:bg-gold-light"
            >
              Back to Intelligence →
            </Link>
            <Link
              href="/score"
              className="font-mono text-[11px] tracking-[0.15em] uppercase text-slate hover:text-gold transition-colors"
            >
              How the Goldilocks score works (0–100) →
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
