import type { Metadata } from "next";
import Link from "next/link";
import MarketsPageTabs from "@/components/markets/MarketsPageTabs";
import MortgageSpreadChart from "@/components/mortgage/MortgageSpreadChart";
import { getMortgagePageContentFresh } from "@/lib/mortgage-page-config";
import {
  hasPreferredLenders,
  hasSpotQuote,
  noteParagraphs,
} from "@/lib/mortgage-page-shared";
import {
  ensureMortgageRatesFresh,
  isFredConfigured,
  readMortgageRateSeries,
  readMortgageRatesSyncMeta,
} from "@/lib/mortgage-rates-sync";
import {
  CONFORMING_UNIT_KEYS,
  CONFORMING_UNIT_LABELS,
  describeJumboSpread,
  FHFA_LOAN_LIMITS_URL,
  formatRatePct,
  formatUsd,
  fredSeriesUrl,
  jumboConformingSpread,
  MORTGAGE_CHART_CMT_SERIES,
  MORTGAGE_HEADLINE_SERIES,
  MORTGAGE_HIGH_COST_AREA_ID,
  MORTGAGE_HIGH_COST_CEILING_ID,
  MORTGAGE_HIGH_COST_DESCRIPTOR_ID,
  MORTGAGE_SERIES_BY_ID,
  MORTGAGE_TREASURY_SERIES,
  OPTIMAL_BLUE_MMI_NOTE,
  OPTIMAL_BLUE_MMI_URL,
} from "@/lib/mortgage-rates-shared";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mortgage Rates — TMRE",
  description:
    "Prevailing 30- and 15-year mortgage rates, jumbo vs conforming pricing, how mortgage rates are actually set, Fannie Mae and Freddie Mac explained, conforming loan limits, and financing strategies for Fairfield County buyers, sellers, and downsizers.",
  alternates: { canonical: "/mortgage-rates" },
};

const FREDDIE_PMMS_URL = "https://www.freddiemac.com/pmms";
const FRED_URL = "https://fred.stlouisfed.org/series/MORTGAGE30US";

function formatRatesUpdatedAt(iso: string | null): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const eyebrow = "font-mono text-[11px] tracking-[0.2em] uppercase text-gold";
const sectionLabel =
  "font-mono text-[11px] tracking-[0.2em] uppercase text-slate mb-5";
const card =
  "rounded-2xl bg-white border border-charcoal/[0.08] p-6 lg:p-8 space-y-4";
const body = "text-charcoal/75 leading-relaxed";

function Commentary({
  note,
  heading = "Tim's take",
}: {
  note: string;
  heading?: string;
}) {
  const paragraphs = noteParagraphs(note);
  if (paragraphs.length === 0) return null;
  return (
    <div className="rounded-2xl border border-gold/25 bg-gold/[0.06] p-6 space-y-3">
      <p className={eyebrow}>{heading}</p>
      {paragraphs.map((text, i) => (
        <p key={i} className="text-charcoal/80 leading-relaxed">
          {text}
        </p>
      ))}
    </div>
  );
}

export default async function MortgageRatesPage() {
  // Pull from FRED only when the stored series are stale (never blocks on error).
  await ensureMortgageRatesFresh();

  const [series, content, ratesMeta] = await Promise.all([
    readMortgageRateSeries(),
    getMortgagePageContentFresh(),
    readMortgageRatesSyncMeta(),
  ]);

  const conforming = series.OBMMIC30YF;
  const jumbo = series.OBMMIJUMBO30YF;
  const thirty = series.MORTGAGE30US;
  const tenYear = series.DGS10;

  const spread = jumboConformingSpread(
    conforming.latest?.value ?? null,
    jumbo.latest?.value ?? null,
  );
  const mortgageOverTreasury =
    thirty.latest && tenYear.latest
      ? thirty.latest.value - tenYear.latest.value
      : null;

  const { loanLimits, spotQuote, preferredLenders } = content;
  const showSpot = hasSpotQuote(spotQuote);
  const showLenders = hasPreferredLenders(preferredLenders);
  const noRateData = !thirty.latest && !conforming.latest;
  const highCostTowns = loanLimits.counties.flatMap((c) =>
    (c.towns ?? []).map((town) => ({ town, countyId: c.id, countyLabel: c.label })),
  );

  const chartLines = [
    {
      id: "conforming",
      label: MORTGAGE_SERIES_BY_ID.OBMMIC30YF.label,
      color: "#1f3a5f",
      observations: conforming.observations,
    },
    {
      id: "jumbo",
      label: MORTGAGE_SERIES_BY_ID.OBMMIJUMBO30YF.label,
      color: "#b8954a",
      observations: jumbo.observations,
    },
  ];

  // Overlay CMTs only where OBMMI exists — keeps the client payload small and
  // matches the jumbo/conforming window (OBMMI starts ~2015 on FRED).
  const obmmiStart =
    conforming.observations[0]?.date ?? jumbo.observations[0]?.date ?? null;
  const cmtChartLines = MORTGAGE_CHART_CMT_SERIES.map((id, i) => ({
    id,
    label: MORTGAGE_SERIES_BY_ID[id].label,
    color: i === 0 ? "#5b7a99" : "#8a9aab",
    observations: obmmiStart
      ? series[id].observations.filter((obs) => obs.date >= obmmiStart)
      : series[id].observations,
  }));

  const ratesUpdatedLabel = formatRatesUpdatedAt(ratesMeta.lastSyncedAt);

  /** Compact sidebar: mortgage rates first, then Treasury — each high→low. */
  const rateSidebarShortLabel: Partial<Record<keyof typeof series, string>> = {
    MORTGAGE30US: "30-yr",
    MORTGAGE15US: "15-yr",
    OBMMIC30YF: "Conf.",
    OBMMIJUMBO30YF: "Jumbo",
    DGS30: "30-yr T",
    DGS15: "15-yr T",
    DGS10: "10-yr T",
    DGS5: "5-yr T",
  };
  const rateSidebarRows = (
    [
      ...MORTGAGE_HEADLINE_SERIES.map((id) => ({
        id,
        group: "mortgage" as const,
        value: series[id].latest?.value ?? null,
        shortLabel: rateSidebarShortLabel[id] ?? MORTGAGE_SERIES_BY_ID[id].label,
        description: MORTGAGE_SERIES_BY_ID[id].description,
        obmmi: id === "OBMMIC30YF" || id === "OBMMIJUMBO30YF",
      })),
      ...MORTGAGE_TREASURY_SERIES.map((id) => ({
        id,
        group: "treasury" as const,
        value: series[id].latest?.value ?? null,
        shortLabel: rateSidebarShortLabel[id] ?? MORTGAGE_SERIES_BY_ID[id].label,
        description: MORTGAGE_SERIES_BY_ID[id].description,
        obmmi: false,
      })),
    ] as const
  )
    .filter((row) => row.value != null)
    .sort((a, b) => {
      if (a.group !== b.group) return a.group === "mortgage" ? -1 : 1;
      return (b.value ?? 0) - (a.value ?? 0);
    });

  return (
    <>
      <section className="navy-gradient relative overflow-hidden pt-20 pb-0 text-white lg:pt-28">
        <div className="absolute inset-0 hero-grid opacity-40" aria-hidden />
        <div className="relative mx-auto max-w-7xl px-6 lg:px-10">
          <p className={`${eyebrow} mb-3 animate-fade-up`}>Markets</p>
          <h1 className="max-w-3xl font-serif text-4xl leading-[1.05] text-white sm:text-5xl lg:text-6xl animate-fade-up">
            Mortgage <span className="italic gold-shimmer">rates.</span>
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/70 lg:text-base animate-fade-up-delay-1">
            What rates are doing, how they are actually set, and what it means
            for buying, selling, or downsizing in Fairfield County. Averages are
            published survey and lock data — not a quote from me.
          </p>
          <div className="mt-4 space-y-1.5 animate-fade-up-delay-2">
            <p className="flex flex-wrap gap-x-4 gap-y-2">
              <a
                href={FREDDIE_PMMS_URL}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-[11px] tracking-[0.12em] uppercase text-gold underline decoration-gold/40 underline-offset-2 hover:decoration-gold"
              >
                Freddie Mac PMMS
              </a>
              <a
                href={OPTIMAL_BLUE_MMI_URL}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-[11px] tracking-[0.12em] uppercase text-gold underline decoration-gold/40 underline-offset-2 hover:decoration-gold"
              >
                Optimal Blue MMI
              </a>
              <a
                href={FHFA_LOAN_LIMITS_URL}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-[11px] tracking-[0.12em] uppercase text-gold underline decoration-gold/40 underline-offset-2 hover:decoration-gold"
              >
                FHFA loan limits
              </a>
              <Link
                href="/trends"
                className="font-mono text-[11px] tracking-[0.12em] uppercase text-gold underline decoration-gold/40 underline-offset-2 hover:decoration-gold"
              >
                Trends
              </Link>
              <Link
                href="/fed-analysis"
                className="font-mono text-[11px] tracking-[0.12em] uppercase text-gold underline decoration-gold/40 underline-offset-2 hover:decoration-gold"
              >
                Fed analysis
              </Link>
            </p>
            <p className="font-mono text-[10px] tracking-[0.1em] uppercase text-white/45">
              {ratesUpdatedLabel
                ? `Rates last updated ${ratesUpdatedLabel} ET`
                : "Rates not synced yet"}
            </p>
          </div>
          <MarketsPageTabs active="mortgage-rates" />
        </div>
      </section>

      <section className="bg-cream py-10 lg:py-16">
        <div className="mx-auto max-w-6xl space-y-12 px-6 lg:px-10">
          {/* Chart + compact rate sidebar (mortgage first, then Treasury; high→low) */}
          <div className="space-y-6">
            <div className={card}>
              {noRateData ? (
                <p className={body}>
                  Rate history has not synced yet
                  {isFredConfigured()
                    ? "."
                    : " — a FRED API key is needed on this environment."}{" "}
                  The market background, loan limits, and strategy sections
                  below do not depend on it.
                </p>
              ) : (
                <>
                  <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_9.5rem] lg:items-start">
                    <MortgageSpreadChart
                      lines={chartLines}
                      cmtLines={cmtChartLines}
                      caption="Optimal Blue 30-year fixed rate locks. Conforming = at or under the FHFA limit; jumbo = above it. Use 1Y / 5Y / Max for lookback. Tap CMT in the title to show or hide 30-yr and 10-yr Treasury yields."
                    />
                    <aside
                      className="border-t border-charcoal/[0.08] pt-4 lg:border-t-0 lg:border-l lg:pl-4 lg:pt-1"
                      aria-label="Prevailing mortgage rates and Treasury benchmarks"
                    >
                      <ol className="space-y-0">
                        {rateSidebarRows.map((row, i) => (
                          <li
                            key={row.id}
                            className={`flex items-baseline justify-between gap-2 py-1.5 ${
                              i > 0 && row.group !== rateSidebarRows[i - 1]?.group
                                ? "mt-2 border-t border-charcoal/[0.08] pt-3"
                                : ""
                            }`}
                            title={row.description}
                          >
                            <span className="min-w-0 truncate font-mono text-[9px] tracking-[0.1em] uppercase text-slate">
                              {row.shortLabel}
                              {row.obmmi ? (
                                <a
                                  href="#optimal-blue-note"
                                  className="ml-0.5 text-gold no-underline hover:underline"
                                  aria-label="What is Optimal Blue MMI?"
                                >
                                  *
                                </a>
                              ) : null}
                            </span>
                            <span className="shrink-0 font-mono text-base tabular-nums leading-none text-navy">
                              {formatRatePct(row.value)}
                            </span>
                          </li>
                        ))}
                      </ol>
                    </aside>
                  </div>
                  <p
                    id="optimal-blue-note"
                    className="text-[11px] leading-relaxed text-charcoal/55"
                  >
                    <span className="font-mono text-gold">*</span>{" "}
                    {OPTIMAL_BLUE_MMI_NOTE}{" "}
                    <a
                      href={OPTIMAL_BLUE_MMI_URL}
                      target="_blank"
                      rel="noreferrer"
                      className="text-navy underline decoration-charcoal/25 underline-offset-2 hover:decoration-navy"
                    >
                      Optimal Blue MMI
                    </a>
                    {" · "}
                    <a
                      href={fredSeriesUrl("OBMMIC30YF")}
                      target="_blank"
                      rel="noreferrer"
                      className="text-navy underline decoration-charcoal/25 underline-offset-2 hover:decoration-navy"
                    >
                      FRED OBMMIC30YF
                    </a>
                  </p>
                  {showSpot ? (
                    <div className="rounded-2xl border border-navy/20 bg-navy p-5 text-white">
                      <p className="font-mono text-[10px] tracking-[0.15em] uppercase text-gold">
                        {spotQuote.label}
                      </p>
                      <p className="mt-1 font-mono text-3xl tabular-nums text-white">
                        {spotQuote.rate}
                      </p>
                      {spotQuote.terms ? (
                        <p className="mt-2 text-sm leading-relaxed text-white/70">
                          {spotQuote.terms}
                        </p>
                      ) : null}
                      <p className="mt-2 font-mono text-[10px] text-white/45">
                        {spotQuote.asOf
                          ? `As of ${spotQuote.asOf} · illustrative, not a commitment to lend`
                          : "Illustrative, not a commitment to lend"}
                      </p>
                    </div>
                  ) : null}
                </>
              )}
            </div>

            <div className={`${card} max-w-4xl`}>
              <p className="font-serif text-2xl leading-snug text-navy">
                {describeJumboSpread(spread)}
              </p>
              <p className={body}>
                In much of Fairfield County the purchase price pushes a normal
                20% down loan past the conforming limit, so the jumbo line is
                often the one that matters. Jumbo does not automatically mean
                more expensive: banks keep many jumbo loans on their own books
                and will price aggressively for strong borrowers, which is why
                the two lines cross from time to time.
              </p>
              <Commentary note={content.marketNote} heading="Market note" />
            </div>
          </div>

          <div className="mx-auto max-w-4xl space-y-12">
          {/* How rates are set */}
          <div>
            <p className={sectionLabel}>How rates are determined</p>
            <div className={card}>
              <p className="font-serif text-2xl leading-snug text-navy">
                The Fed sets an overnight rate. Your mortgage is priced off
                long-term bonds.
              </p>
              <p className={body}>
                A 30-year mortgage is a long-dated bond, so its price follows
                long-term yields — above all the 10-year Treasury and
                mortgage-backed securities (MBS) that trade against it. When
                investors demand more yield to hold that paper, quoted mortgage
                rates rise, whether or not the Fed met that month.
              </p>
              <p className={body}>
                The gap between the 30-year mortgage average and the 10-year
                Treasury is the spread investors and lenders charge for
                prepayment risk, servicing, and profit.
                {mortgageOverTreasury != null ? (
                  <>
                    {" "}
                    Right now that gap is about{" "}
                    <strong className="text-navy">
                      {mortgageOverTreasury.toFixed(2)} points
                    </strong>{" "}
                    ({formatRatePct(thirty.latest?.value ?? null)} mortgage vs{" "}
                    {formatRatePct(tenYear.latest?.value ?? null)} Treasury).
                  </>
                ) : null}
              </p>
              <p className={body}>
                The Fed still matters — it moves short-term rates, shapes
                expectations for inflation and growth, and its balance sheet
                affects who is buying MBS. It just does not set your note rate.
                That is why rates sometimes fall on a Fed hike, or rise after a
                cut: the bond market had already priced in the decision and
                reacted to the language instead. Meeting dates and the prevailing
                target range live on{" "}
                <Link
                  href="/fed-analysis"
                  className="text-navy underline decoration-charcoal/25 underline-offset-2 hover:decoration-navy"
                >
                  Fed analysis
                </Link>
                .                 National existing-home sales and NAR pending live on{" "}
                <Link
                  href="/trends"
                  className="text-navy underline decoration-charcoal/25 underline-offset-2 hover:decoration-navy"
                >
                  Trends
                </Link>
                .
              </p>
              <div className="flex flex-wrap gap-6 border-t border-charcoal/[0.06] pt-2">
                {[
                  ["10-yr Treasury", "Benchmark long-term yield"],
                  ["MBS spread", "Risk + servicing + profit"],
                  ["Your file", "Credit, LTV, occupancy, loan size"],
                ].map(([value, label]) => (
                  <div key={label}>
                    <p className="font-mono text-base font-medium text-navy">
                      {value}
                    </p>
                    <p className="mt-0.5 font-mono text-[9px] tracking-[0.15em] uppercase text-slate">
                      {label}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Secondary market */}
          <div>
            <p className={sectionLabel}>The secondary market</p>
            <div className={card}>
              <p className={body}>
                Most lenders do not keep the loan they just closed. They sell it,
                recycle the cash, and lend again. That resale market is what
                makes a 30-year fixed rate possible at all — few banks would lend
                their own deposits for thirty years at a fixed rate.
              </p>
              <ol className="space-y-3">
                {[
                  [
                    "Origination",
                    "A lender or broker underwrites and funds your loan at closing.",
                  ],
                  [
                    "Sale",
                    "The loan is sold — often within weeks — to an aggregator, bank, or one of the GSEs.",
                  ],
                  [
                    "Securitization",
                    "Similar loans are pooled into mortgage-backed securities and sold to investors worldwide.",
                  ],
                  [
                    "Servicing",
                    "The right to collect your payment is a separate asset, which is why your payment address can change while your terms never do.",
                  ],
                ].map(([title, text], i) => (
                  <li key={title} className="flex gap-4">
                    <span className="font-mono text-[10px] tracking-[0.15em] uppercase text-slate/60">
                      0{i + 1}
                    </span>
                    <span>
                      <span className="font-medium text-navy">{title}</span>
                      <span className="text-charcoal/75"> — {text}</span>
                    </span>
                  </li>
                ))}
              </ol>
              <p className={body}>
                Practical consequence: the rules for the loan you can get are
                written by whoever buys it, not by the person taking your
                application. That is why a file that fits agency guidelines
                prices better than one that does not.
              </p>
            </div>
          </div>

          {/* Fannie and Freddie */}
          <div>
            <p className={sectionLabel}>Fannie Mae &amp; Freddie Mac</p>
            <div className={card}>
              <p className="font-serif text-2xl leading-snug text-navy">
                Same secondary-market job today — different origins, and a
                reason Freddie exists at all.
              </p>
              <p className={body}>
                Neither lends to you directly. Both are government-sponsored
                enterprises that buy closed conforming loans from lenders,
                guarantee timely payment to investors, and package them into
                mortgage-backed securities so cash can flow back into new
                originations. Both have been in federal conservatorship since
                2008. The interesting part is why Congress built a second one.
              </p>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-charcoal/[0.08] bg-cream/40 p-4 space-y-2">
                  <p className="font-mono text-[10px] tracking-[0.15em] uppercase text-slate">
                    Fannie Mae · 1938
                  </p>
                  <p className="font-medium text-navy">
                    Create a national secondary market after the Depression
                  </p>
                  <p className="text-sm leading-relaxed text-charcoal/70">
                    Chartered as the Federal National Mortgage Association to
                    make sure lenders could sell mortgages and keep lending —
                    first mainly government-backed (FHA/VA) loans, later
                    conventional conforming loans as well. For decades it was
                    the dominant buyer, working most naturally with larger
                    commercial banks and mortgage companies.
                  </p>
                </div>
                <div className="rounded-xl border border-charcoal/[0.08] bg-cream/40 p-4 space-y-2">
                  <p className="font-mono text-[10px] tracking-[0.15em] uppercase text-slate">
                    Freddie Mac · 1970
                  </p>
                  <p className="font-medium text-navy">
                    Break Fannie&rsquo;s monopoly and serve the thrift channel
                  </p>
                  <p className="text-sm leading-relaxed text-charcoal/70">
                    Created by the Emergency Home Finance Act as the Federal
                    Home Loan Mortgage Corporation. The point was not a
                    different product for borrowers — it was competition for
                    Fannie, and a secondary-market outlet for savings &amp;
                    loans and smaller thrifts that had been under-served when
                    Fannie was the only large buyer. Same era also let both GSEs
                    buy conventional (non-FHA/VA) mortgages more broadly.
                  </p>
                </div>
              </div>

              <p className={body}>
                So Freddie does not exist to serve a separate class of homebuyer
                (different credit scores, different loan types). It was built to
                serve a separate slice of the <em>lender</em> side — thrifts and
                smaller institutions — and to keep one GSE from setting the
                entire secondary-market price of conforming credit. Over time
                those channels blurred: both buy from banks, credit unions, and
                mortgage companies, both guarantee MBS, and both sit under the
                same FHFA conservatorship and conforming-loan rules.
              </p>

              <div className="space-y-3 border-t border-charcoal/[0.06] pt-4">
                <p className="font-mono text-[10px] tracking-[0.15em] uppercase text-slate">
                  Key distinctions that still matter
                </p>
                <ul className="space-y-2.5 text-sm leading-relaxed text-charcoal/75">
                  <li>
                    <span className="font-medium text-navy">Origin story.</span>{" "}
                    Fannie = Depression-era liquidity for a national mortgage
                    market. Freddie = 1970 competition + thrift access so Fannie
                    was not the only buyer.
                  </li>
                  <li>
                    <span className="font-medium text-navy">
                      Who they historically bought from.
                    </span>{" "}
                    Fannie leaned toward large commercial banks and mortgage
                    companies; Freddie toward savings &amp; loans and smaller
                    thrifts. Today both buy across channels — the old split is
                    history, not a hard wall.
                  </li>
                  <li>
                    <span className="font-medium text-navy">
                      Same borrower product, not a different market segment.
                    </span>{" "}
                    For you, a “Fannie loan” and a “Freddie loan” are both
                    conforming agency loans under shared FHFA limits and similar
                    credit/LTV/occupancy rules. Your rate difference is usually
                    lender execution and pricing, not a different GSE mission.
                  </li>
                  <li>
                    <span className="font-medium text-navy">
                      Where they diverge from Ginnie Mae.
                    </span>{" "}
                    Ginnie Mae (also 1968-era) guarantees securities backed by
                    government loans (FHA, VA, USDA). Fannie and Freddie are the
                    conventional conforming channel — private credit risk with an
                    implicit/explicit federal backstop via conservatorship, not
                    full-faith government insurance on the loan itself.
                  </li>
                  <li>
                    <span className="font-medium text-navy">
                      Why you still feel both.
                    </span>{" "}
                    Their selling guides and automated underwriting set most of
                    the credit, income, appraisal, and property standards behind
                    quoted conforming rates. Jumbo is everything above the FHFA
                    limit — outside this Fannie/Freddie buy box.
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* Loan limits */}
          <div>
            <p className={sectionLabel}>
              Conforming loan limits · {loanLimits.year}
            </p>
            <div className={card}>
              <p className="text-xs text-charcoal/60 -mt-1">
                Agency buy box for 1–4 unit properties. Limits rise with unit
                count; 5+ units are outside this conforming ladder.
              </p>
              {highCostTowns.length > 0 ? (
                <p className="text-sm text-charcoal/70">
                  <span className="font-mono text-[10px] tracking-[0.12em] uppercase text-slate">
                    High-cost CT towns ·{" "}
                  </span>
                  {highCostTowns.map(({ town }, i) => (
                    <span key={`${town}-${i}`}>
                      {i > 0 ? (
                        <span className="text-charcoal/35"> · </span>
                      ) : null}
                      <a
                        href={`#${MORTGAGE_HIGH_COST_DESCRIPTOR_ID}`}
                        className="text-navy underline decoration-charcoal/25 underline-offset-2 hover:decoration-navy"
                      >
                        {town}
                      </a>
                    </span>
                  ))}
                </p>
              ) : null}
              <div className="overflow-x-auto rounded-xl border border-charcoal/[0.08]">
                <table className="w-full min-w-[32rem] border-collapse text-left">
                  <thead>
                    <tr className="bg-cream/50">
                      <th className="px-3 py-2.5 font-mono text-[10px] tracking-[0.14em] uppercase text-slate">
                        Area
                      </th>
                      {CONFORMING_UNIT_KEYS.map((key) => (
                        <th
                          key={key}
                          className="px-3 py-2.5 font-mono text-[10px] tracking-[0.14em] uppercase text-slate text-right"
                        >
                          {CONFORMING_UNIT_LABELS[key]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t border-charcoal/[0.06]">
                      <td className="px-3 py-2.5">
                        <p className="font-medium text-navy">Baseline</p>
                        <p className="text-xs text-charcoal/55">
                          Most of the country
                        </p>
                      </td>
                      {CONFORMING_UNIT_KEYS.map((key) => (
                        <td
                          key={key}
                          className="px-3 py-2.5 font-mono tabular-nums text-navy text-right whitespace-nowrap"
                        >
                          {formatUsd(loanLimits.baseline[key])}
                        </td>
                      ))}
                    </tr>
                    {loanLimits.counties.map((county) => (
                      <tr
                        key={county.id}
                        id={
                          county.id === "fairfield"
                            ? MORTGAGE_HIGH_COST_AREA_ID
                            : `loan-limits-${county.id}`
                        }
                        className="scroll-mt-28 border-t border-charcoal/[0.06]"
                      >
                        <td className="px-3 py-2.5">
                          <p className="font-medium text-navy">
                            {county.label}
                          </p>
                          <p className="text-xs text-charcoal/55">
                            Local high-cost area
                          </p>
                          {county.note ? (
                            <p className="mt-1 text-xs text-charcoal/55">
                              {county.note}
                            </p>
                          ) : null}
                        </td>
                        {CONFORMING_UNIT_KEYS.map((key) => (
                          <td
                            key={key}
                            className="px-3 py-2.5 font-mono tabular-nums text-navy text-right whitespace-nowrap"
                          >
                            {formatUsd(county[key])}
                          </td>
                        ))}
                      </tr>
                    ))}
                    <tr
                      id={MORTGAGE_HIGH_COST_CEILING_ID}
                      className="scroll-mt-28 border-t border-charcoal/[0.06]"
                    >
                      <td className="px-3 py-2.5">
                        <p className="font-medium text-navy">
                          High-cost ceiling
                        </p>
                        <p className="text-xs text-charcoal/55">
                          National cap at 150% of baseline — not CT
                        </p>
                      </td>
                      {CONFORMING_UNIT_KEYS.map((key) => (
                        <td
                          key={key}
                          className="px-3 py-2.5 font-mono tabular-nums text-navy text-right whitespace-nowrap"
                        >
                          {formatUsd(loanLimits.highCostCeiling[key])}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>

              <div
                id={MORTGAGE_HIGH_COST_DESCRIPTOR_ID}
                className="scroll-mt-28 space-y-3 rounded-xl border border-charcoal/[0.08] bg-cream/40 px-4 py-4"
              >
                <p className="font-mono text-[10px] tracking-[0.14em] uppercase text-slate">
                  High-cost vs ceiling
                </p>
                <p className={body}>
                  TMRE towns sit in the{" "}
                  <a
                    href={`#${MORTGAGE_HIGH_COST_AREA_ID}`}
                    className="text-navy underline decoration-charcoal/25 underline-offset-2 hover:decoration-navy"
                  >
                    Western CT / Greater Bridgeport
                  </a>{" "}
                  <strong className="text-navy">high-cost area</strong> — an
                  elevated conforming limit above the national baseline (1-unit{" "}
                  {formatUsd(loanLimits.counties[0]?.oneUnit ?? null)} in{" "}
                  {loanLimits.year}). That is{" "}
                  <strong className="text-navy">not</strong> the{" "}
                  <a
                    href={`#${MORTGAGE_HIGH_COST_CEILING_ID}`}
                    className="text-navy underline decoration-charcoal/25 underline-offset-2 hover:decoration-navy"
                  >
                    high-cost ceiling
                  </a>{" "}
                  ({formatUsd(loanLimits.highCostCeiling.oneUnit)} 1-unit), which
                  is the FHFA national maximum (150% of baseline). No Connecticut
                  planning region is at that ceiling today.
                </p>
              </div>

              <p className={body}>
                FHFA resets these every year based on national home-price
                growth. At or under the limit for that unit count, the loan is{" "}
                <strong className="text-navy">conforming</strong> and can be sold
                to Fannie or Freddie. Above it, the loan is{" "}
                <strong className="text-navy">jumbo</strong> — priced by banks
                and private investors, usually with tighter reserve and down
                payment expectations. Always confirm the current figure on the{" "}
                <a
                  href={FHFA_LOAN_LIMITS_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="text-navy underline decoration-charcoal/25 underline-offset-2 hover:decoration-navy"
                >
                  FHFA table
                </a>{" "}
                before you plan around it.
              </p>
            </div>
          </div>

          {showLenders ? (
            <div>
              <p className={sectionLabel}>Preferred lenders · lowest down</p>
              <div className={card}>
                <p className="text-xs text-charcoal/60 -mt-1">
                  Lenders Tim works with who can structure low-down options
                  while staying inside the local conforming loan limit when
                  possible. Terms change — confirm in writing with the lender.
                </p>
                <ul className="space-y-3">
                  {preferredLenders.map((lender) => (
                    <li
                      key={lender.id}
                      className="rounded-xl border border-charcoal/[0.08] bg-cream/30 px-4 py-3"
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                        {lender.url ? (
                          <a
                            href={lender.url}
                            target="_blank"
                            rel="noreferrer"
                            className="font-medium text-navy underline decoration-charcoal/25 underline-offset-2 hover:decoration-navy"
                          >
                            {lender.name}
                          </a>
                        ) : (
                          <p className="font-medium text-navy">{lender.name}</p>
                        )}
                        {lender.minDownNote ? (
                          <p className="font-mono text-[11px] tracking-[0.06em] text-charcoal/70">
                            {lender.minDownNote}
                          </p>
                        ) : null}
                      </div>
                      {lender.note ? (
                        <p className="mt-1.5 text-sm leading-relaxed text-charcoal/65">
                          {lender.note}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}

          {/* Buyer strategies */}
          <div>
            <p className={sectionLabel}>Strategies · buyers &amp; move-ups</p>
            <div className="space-y-4">
              {[
                [
                  "Negotiate the payment, not just the price",
                  "A seller-paid rate buydown often lowers the monthly payment more than the equivalent price cut — and it is easier for a seller to accept than a headline reduction.",
                ],
                [
                  "Price the loan, then the house",
                  "Get fully underwritten before you shop. In a jumbo market the loan structure — down payment, reserves, loan size relative to the conforming limit — moves your rate as much as the market does.",
                ],
                [
                  "Decide if the rate is temporary",
                  "If you would refinance the moment rates drop, buy the house on today's payment and treat the rate as refinanceable. If you would not, structure for the long haul instead of paying for optionality.",
                ],
                [
                  "Consider the shorter or adjustable term deliberately",
                  "A 15-year or an ARM can price meaningfully below the 30-year fixed. Both are tools, not defaults — the question is how long the money is really staying in this house.",
                ],
                [
                  "Sequence buying and selling on purpose",
                  "Bridge financing, a HELOC on the current home, or a rent-back after closing all exist so you are not forced to make your worst decision under time pressure.",
                ],
              ].map(([title, text], i) => (
                <div
                  key={title}
                  className="flex gap-5 rounded-2xl border border-charcoal/[0.08] bg-white p-6"
                >
                  <span className="font-mono text-[10px] tracking-[0.15em] uppercase text-slate/60">
                    0{i + 1}
                  </span>
                  <div>
                    <h3 className="mb-2 font-serif text-lg text-navy">
                      {title}
                    </h3>
                    <p className="text-sm leading-relaxed text-charcoal/75">
                      {text}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4">
              <Commentary note={content.buyerNote} heading="Buyer note" />
            </div>
          </div>

          {/* Seller / downsizing strategies */}
          <div>
            <p className={sectionLabel}>
              Strategies · sellers &amp; downsizers
            </p>
            <div className="space-y-4">
              {[
                [
                  "Price against today's payment",
                  "Buyers shop monthly cost. When rates are higher than when your neighbor sold, that comp does not translate directly — the same payment now buys less house.",
                ],
                [
                  "Offer financing help instead of a price cut",
                  "A credit toward a buydown or closing costs can widen your buyer pool at a lower real cost than repeated price reductions, and it keeps your closed comp intact.",
                ],
                [
                  "Know what your low rate is actually worth",
                  "A locked-in low rate is only transferable if the loan is assumable, which generally means FHA or VA — not conventional. Otherwise the rate is a reason to time the move well, not a reason to never move.",
                ],
                [
                  "Model the downsizing math fully",
                  "Sale proceeds, the new payment, taxes, and carrying costs during the gap all belong in one picture. Downsizing the square footage does not always downsize the monthly cost.",
                ],
                [
                  "Plan the tax conversation early",
                  "Capital gains treatment on a primary residence has rules and limits worth reviewing with your CPA before you list, not after you have an accepted offer.",
                ],
              ].map(([title, text], i) => (
                <div
                  key={title}
                  className="flex gap-5 rounded-2xl border border-charcoal/[0.08] bg-white p-6"
                >
                  <span className="font-mono text-[10px] tracking-[0.15em] uppercase text-slate/60">
                    0{i + 1}
                  </span>
                  <div>
                    <h3 className="mb-2 font-serif text-lg text-navy">
                      {title}
                    </h3>
                    <p className="text-sm leading-relaxed text-charcoal/75">
                      {text}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4">
              <Commentary note={content.sellerNote} heading="Seller note" />
            </div>
          </div>

          <div className="rounded-2xl bg-navy p-6 text-white lg:p-8">
            <p className={`${eyebrow} mb-4`}>What this page is not</p>
            <div className="grid gap-4 text-sm leading-relaxed text-white/70 sm:grid-cols-2">
              {[
                [
                  "Not a rate quote",
                  "The figures above are published national survey and lock averages. Your rate depends on your file and your lender, and can change during the day.",
                ],
                [
                  "Not a commitment to lend",
                  "TMRE is a real estate brokerage, not a mortgage lender. Financing terms come from your lender in writing.",
                ],
                [
                  "Not tax or legal advice",
                  "Capital gains, ownership structure, and estate questions belong with your CPA and attorney.",
                ],
                [
                  "Not a forecast",
                  "Nothing here predicts where rates go next. It explains what moves them so you can react to the market you actually get.",
                ],
              ].map(([title, text]) => (
                <div key={title}>
                  <p className="mb-1 font-medium text-white">{title}</p>
                  <p>{text}</p>
                </div>
              ))}
            </div>
          </div>

          <p className="text-center font-mono text-[10px] tracking-wide text-slate/50">
            Rate series from{" "}
            <a
              href={FRED_URL}
              target="_blank"
              rel="noreferrer"
              className="text-slate/70 underline decoration-slate/30 underline-offset-2 hover:text-navy"
            >
              FRED
            </a>{" "}
            (Freddie Mac PMMS, Optimal Blue, U.S. Treasury)
            {ratesMeta.lastSyncedAt
              ? ` · last synced ${new Date(ratesMeta.lastSyncedAt).toLocaleString("en-US", { timeZone: "America/New_York" })} ET`
              : " · not synced yet"}
            {content.updatedAt
              ? ` · commentary updated ${new Date(content.updatedAt).toLocaleDateString("en-US", { timeZone: "America/New_York" })}`
              : ""}
          </p>
          </div>
        </div>
      </section>
    </>
  );
}
