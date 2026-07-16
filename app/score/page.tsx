import {
  FACTOR_DESCRIPTIONS,
  FACTOR_LABELS,
} from "@/lib/goldilocks-score-info";
import type { GoldilocksFactorKey } from "@/lib/goldilocks-score-info";
import { getGoldilocksConfigFresh } from "@/lib/goldilocks-config";
import { GOLDILOCKS_FACTOR_ORDER } from "@/lib/goldilocks-config-shared";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Score — TMRE",
  description:
    "How TMRE scores every active listing 0–100. The Goldilocks composite model used on Intelligence, Deal of the Day, and across TMRE tools.",
};

const FACTOR_ICONS: Record<GoldilocksFactorKey, string> = {
  age: "◉",
  condition: "◎",
  finishes: "◐",
  ppsf: "◇",
  layout: "△",
  schools: "◈",
};

export default async function ScorePage() {
  // Live weights from Postgres (same store Admin Goldilocks tab writes).
  const { weights } = await getGoldilocksConfigFresh();
  const signals = GOLDILOCKS_FACTOR_ORDER.map((key) => ({
    label: FACTOR_LABELS[key],
    weight: weights[key],
    icon: FACTOR_ICONS[key],
    body: FACTOR_DESCRIPTIONS[key],
  }));

  const tiers = [
    {
      range: "85 – 100",
      label: "Top pick",
      color: "text-sage",
      bg: "bg-sage/10 border-sage/20",
      descClass: "text-charcoal/70",
      desc: "Exceptional composite — strong across age, value, layout, and schools. Act fast.",
    },
    {
      range: "70 – 84",
      label: "Strong",
      color: "text-gold",
      bg: "bg-gold/10 border-gold/20",
      descClass: "text-charcoal/70",
      desc: "Above-market fundamentals. Worth a close look and offer consideration.",
    },
    {
      range: "0 – 69",
      label: "Watch",
      color: "text-slate",
      bg: "bg-slate/10 border-slate/20",
      descClass: "text-charcoal/70",
      desc: "In the market but not standing out. Monitor for price or status changes.",
    },
  ];

  return (
    <>
      <section className="navy-gradient text-white pt-20 pb-8 lg:pt-28 lg:pb-12 relative overflow-hidden">
        <div className="absolute inset-0 hero-grid opacity-40" aria-hidden />
        <div className="relative mx-auto max-w-7xl px-6 lg:px-10">
          <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold mb-3 animate-fade-up">
            Scoring
          </p>
          <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl text-white leading-[1.05] max-w-3xl animate-fade-up">
            How we score <span className="italic gold-shimmer">every listing.</span>
          </h1>
          <p className="mt-3 text-sm lg:text-base text-white/70 max-w-xl leading-relaxed animate-fade-up-delay-1">
            Every active listing in our markets gets a 0–100 Goldilocks composite the moment it hits the board.
            Here&rsquo;s what goes into it — and what doesn&rsquo;t.
          </p>
        </div>
      </section>

      <section className="bg-cream py-10 lg:py-16">
        <div className="mx-auto max-w-4xl px-6 lg:px-10 space-y-12">

          {/* Overview */}
          <div className="rounded-2xl bg-white border border-charcoal/[0.08] p-6 lg:p-8 space-y-4">
            <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">How it works</p>
            <p className="font-serif text-2xl text-navy leading-snug">
              One number that tells you where to look first.
            </p>
            <p className="text-charcoal/75 leading-relaxed">
              Every listing that enters our markets is evaluated through the Goldilocks model — the same composite used on Intelligence, Deal of the Day, and Deal of the Week. Six factors are each scored 0–100, weighted, and summed into a single composite out of 100.
            </p>
            <p className="text-charcoal/75 leading-relaxed">
              The model is calibrated separately for each city, so an 82 in Norwalk reflects the same relative strength as an 82 in Westport — even though the absolute prices are very different. Scores are relative to active inventory, not absolute thresholds.
            </p>
            <p className="text-charcoal/75 leading-relaxed">
              We built this because the hardest part of finding a good deal isn&rsquo;t access to listings — it&rsquo;s knowing which ones are actually worth your time. The score is designed to do that filtering for you, surfacing the properties worth a second look and letting the rest fade into the background.
            </p>
            <div className="pt-2 border-t border-charcoal/[0.06] flex flex-wrap gap-6">
              {[
                ["0–100", "Score range"],
                ["6", "Weighted factors"],
                ["6 towns", "Independently calibrated"],
                ["Every sync", "Refreshed automatically"],
              ].map(([value, label]) => (
                <div key={label}>
                  <p className="font-mono text-xl text-navy font-medium tabular-nums">{value}</p>
                  <p className="font-mono text-[9px] tracking-[0.15em] uppercase text-slate mt-0.5">{label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Score tiers */}
          <div>
            <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-slate mb-5">Score tiers</p>
            <div className="grid sm:grid-cols-3 gap-4">
              {tiers.map((t) => (
                <div key={t.label} className={`rounded-2xl border p-5 ${t.bg}`}>
                  <div className="flex items-baseline gap-3 mb-2">
                    <span className={`font-mono text-2xl font-semibold tabular-nums ${t.color}`}>{t.range}</span>
                  </div>
                  <p className={`font-mono text-[10px] tracking-[0.2em] uppercase mb-2 ${t.color}`}>{t.label}</p>
                  <p className={`text-sm leading-relaxed ${t.descClass}`}>{t.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Signals */}
          <div>
            <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-slate mb-5">The six factors</p>
            <div className="space-y-4">
              {signals.map((s, i) => (
                <div key={s.label} className="rounded-2xl bg-white border border-charcoal/[0.08] p-6 flex gap-5">
                  <div className="shrink-0">
                    <span className="font-mono text-xl text-gold">{s.icon}</span>
                  </div>
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <span className="font-mono text-[10px] tracking-[0.15em] uppercase text-slate/60">0{i + 1}</span>
                      <h3 className="font-serif text-lg text-navy">{s.label}</h3>
                      <span className="font-mono text-[10px] tracking-wide text-gold/80">{Math.round(s.weight * 100)}%</span>
                    </div>
                    <p className="text-sm text-charcoal/75 leading-relaxed">{s.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* What the score is not */}
          <div className="rounded-2xl bg-navy text-white p-6 lg:p-8">
            <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold mb-4">What the score is not</p>
            <div className="grid sm:grid-cols-2 gap-4 text-sm text-white/70 leading-relaxed">
              {[
                ["Not investment advice", "A high score means the listing stands out against its peers today. It doesn't guarantee appreciation, rental income, or a successful flip."],
                ["Not an AVM", "We are not estimating market value. The score measures deal quality relative to the current active inventory, not an absolute price opinion."],
                ["Not static", "Scores refresh with every data sync. A listing that scores 65 today may score 78 tomorrow if a price cut improves its PPSF fit."],
                ["Not the whole picture", "Condition, neighborhood micro-factors, seller motivation, and your specific buy box all matter. Use the score to filter, not to decide."],
              ].map(([title, body]) => (
                <div key={title}>
                  <p className="text-white font-medium mb-1">{title}</p>
                  <p>{body}</p>
                </div>
              ))}
            </div>
          </div>

          <p className="font-mono text-[10px] tracking-wide text-slate/50 text-center">
            Goldilocks composite · Relative to current active listings in each city · TMRE proprietary model
          </p>
        </div>
      </section>
    </>
  );
}
