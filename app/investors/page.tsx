import type { Metadata } from "next";
import { formatTownList } from "@/lib/tmre-towns";

export const metadata: Metadata = {
  title: "For Investors — TMRE",
  description:
    `See the deal, not just the listing. Live deal scoring, multifamily pipeline, flip velocity, and below-replacement-cost alerts in ${formatTownList(["Norwalk", "Westport"])}.`,
};

const features = [
  {
    icon: "◐",
    label: "Live Deal Scoring",
    body: "Every active and pocket listing scored 1–10 against our underwriting model. Yield, ARV, risk, and operator difficulty — in one number.",
  },
  {
    icon: "◇",
    label: "Multifamily Pipeline",
    body: "2-to-12 unit properties surfaced from listings, owner-direct, and pre-foreclosure. Filtered to rent-grade neighborhoods only.",
  },
  {
    icon: "△",
    label: "Flip Velocity Data",
    body: "Median days from acquisition to resale by zip, type, and renovation depth. Stop guessing your exit window.",
  },
  {
    icon: "◈",
    label: "Below-Replacement-Cost Alerts",
    body: "Get pinged when an asset trades under reconstruction cost. The cleanest signal in the market.",
  },
];

export default function InvestorsPage() {
  return (
    <>
      <section className="bg-cream pt-32 pb-20 lg:pt-40 lg:pb-28 relative overflow-hidden">
        <div className="mx-auto max-w-7xl px-6 lg:px-10">
          <div className="grid lg:grid-cols-[1.15fr_1fr] gap-12 lg:gap-16 items-start">
            <div>
              <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold mb-4 animate-fade-up">
                For Investors
              </p>
              <h1 className="font-serif text-5xl lg:text-6xl text-navy leading-[1.05] animate-fade-up">
                See the deal,{" "}
                <span className="italic">not just the listing.</span>
              </h1>
              <p className="mt-6 text-lg text-slate max-w-xl leading-relaxed animate-fade-up-delay-1">
                The market shows you what's for sale. We show you what's worth
                buying. Same data, smarter signal — built by operators, for
                operators.
              </p>

              <div className="mt-12 grid sm:grid-cols-2 gap-4 animate-fade-up-delay-2">
                {features.map((f) => (
                  <article
                    key={f.label}
                    className="rounded-2xl bg-white border border-charcoal/[0.06] p-6 transition-all hover:border-gold/40 hover:shadow-xl hover:shadow-navy/5 hover:-translate-y-1"
                  >
                    <div className="text-2xl text-gold mb-4 font-serif">
                      {f.icon}
                    </div>
                    <h3 className="font-serif text-lg text-navy leading-snug mb-2">
                      {f.label}
                    </h3>
                    <p className="text-sm text-slate leading-relaxed">
                      {f.body}
                    </p>
                  </article>
                ))}
              </div>
            </div>

            <ComparisonCard />
          </div>
        </div>
      </section>

      <section className="navy-gradient text-white py-20 lg:py-28 relative overflow-hidden">
        <div className="absolute inset-0 hero-grid opacity-30" aria-hidden />
        <div className="relative mx-auto max-w-4xl px-6 lg:px-10 text-center">
          <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold mb-5">
            Co-invest with TMRE
          </p>
          <h2 className="font-serif text-4xl lg:text-5xl text-white leading-[1.1]">
            We don't just <span className="italic">surface</span> deals.
            We{" "}
            <span className="italic gold-shimmer">do</span> them.
          </h2>
          <p className="mt-6 text-white/70 text-lg max-w-2xl mx-auto leading-relaxed">
            Three active projects on the books and a pipeline filtered to the
            top 4% of listings. Accredited investors can co-invest at the deal
            level — same terms as principals.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row gap-3 justify-center">
            <a
              href="#"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-gold px-7 py-4 text-sm font-medium text-navy hover:bg-gold-light hover:shadow-2xl hover:shadow-gold/30 transition-all hover:-translate-y-0.5"
            >
              Request the deck →
            </a>
            <a
              href="/new-construction"
              className="inline-flex items-center justify-center gap-2 rounded-full border border-white/25 px-7 py-4 text-sm font-medium text-white hover:bg-white/5 hover:border-white/40 transition-all"
            >
              See active projects
            </a>
          </div>
        </div>
      </section>
    </>
  );
}

function ComparisonCard() {
  const rows = [
    { label: "Median price", norwalk: "$711K", westport: "$1.94M" },
    { label: "Days on market", norwalk: "12", westport: "8" },
    { label: "Sale-to-list", norwalk: "102.8%", westport: "101.9%" },
    { label: "Months supply", norwalk: "1.7", westport: "2.1" },
    { label: "Avg gross yield", norwalk: "5.8%", westport: "4.1%" },
    { label: "Median flip cycle", norwalk: "138d", westport: "182d" },
    { label: "Below-RC alerts (90d)", norwalk: "7", westport: "3" },
    { label: "Deals scored ≥ 8.0", norwalk: "11", westport: "4" },
  ];

  return (
    <aside className="rounded-3xl navy-gradient text-white p-8 lg:p-10 border border-white/10 shadow-2xl shadow-navy/20 lg:sticky lg:top-28">
      <div className="flex items-center justify-between mb-2">
        <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
          Side-by-side
        </p>
        <span className="font-mono text-[10px] text-white/40">90-day view</span>
      </div>
      <h3 className="font-serif text-3xl text-white leading-tight">
        Norwalk vs <span className="italic">Westport.</span>
      </h3>

      <div className="mt-8 grid grid-cols-[1fr_auto_auto] gap-x-6 gap-y-3 items-baseline">
        <span />
        <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-sky text-right">
          Norwalk
        </span>
        <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-gold text-right">
          Westport
        </span>

        {rows.map((r) => (
          <div
            key={r.label}
            className="contents [&>*]:py-2 [&>*]:border-t [&>*]:border-white/[0.08]"
          >
            <span className="text-[13px] text-white/75">{r.label}</span>
            <span className="font-mono text-right text-white tabular-nums">
              {r.norwalk}
            </span>
            <span className="font-mono text-right text-white tabular-nums">
              {r.westport}
            </span>
          </div>
        ))}
      </div>

      <p className="mt-8 pt-6 border-t border-white/10 text-sm italic font-serif text-white/70 leading-relaxed">
        Norwalk leans yield. Westport leans appreciation. The play depends on
        the dollar.
      </p>
    </aside>
  );
}
