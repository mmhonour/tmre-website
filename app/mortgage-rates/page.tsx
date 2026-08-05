import type { Metadata } from "next";
import Link from "next/link";
import MortgageSpreadChart from "@/components/mortgage/MortgageSpreadChart";
import { getMortgagePageContentFresh } from "@/lib/mortgage-page-config";
import {
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
  describeJumboSpread,
  FHFA_LOAN_LIMITS_URL,
  formatRateDelta,
  formatRatePct,
  formatUsd,
  jumboConformingSpread,
  MORTGAGE_HEADLINE_SERIES,
  MORTGAGE_SERIES_BY_ID,
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

  const { loanLimits, spotQuote } = content;
  const showSpot = hasSpotQuote(spotQuote);
  const noRateData = !thirty.latest && !conforming.latest;

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

  return (
    <>
      <section className="navy-gradient relative overflow-hidden pt-20 pb-8 text-white lg:pt-28 lg:pb-12">
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
          <p className="mt-4 flex flex-wrap gap-x-4 gap-y-2 animate-fade-up-delay-2">
            <Link
              href="/fed-analysis"
              className="font-mono text-[11px] tracking-[0.12em] uppercase text-gold underline decoration-gold/40 underline-offset-2 hover:decoration-gold"
            >
              Fed analysis
            </Link>
            <a
              href={FREDDIE_PMMS_URL}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-[11px] tracking-[0.12em] uppercase text-gold underline decoration-gold/40 underline-offset-2 hover:decoration-gold"
            >
              Freddie Mac PMMS
            </a>
            <a
              href={FHFA_LOAN_LIMITS_URL}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-[11px] tracking-[0.12em] uppercase text-gold underline decoration-gold/40 underline-offset-2 hover:decoration-gold"
            >
              FHFA loan limits
            </a>
          </p>
        </div>
      </section>

      <section className="bg-cream py-10 lg:py-16">
        <div className="mx-auto max-w-4xl space-y-12 px-6 lg:px-10">
          {/* Prevailing rates */}
          <div>
            <p className={sectionLabel}>Prevailing rates</p>
            {noRateData ? (
              <div className="rounded-2xl border border-charcoal/[0.08] bg-white p-6">
                <p className={body}>
                  Rate history has not synced yet
                  {isFredConfigured()
                    ? "."
                    : " — a FRED API key is needed on this environment."}{" "}
                  The market background, loan limits, and strategy sections below
                  do not depend on it.
                </p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {MORTGAGE_HEADLINE_SERIES.map((id) => {
                  const meta = MORTGAGE_SERIES_BY_ID[id];
                  const data = series[id];
                  const delta = formatRateDelta(
                    data.yearAgo?.value ?? null,
                    data.latest?.value ?? null,
                  );
                  return (
                    <div
                      key={id}
                      className="rounded-2xl border border-charcoal/[0.08] bg-white p-5"
                    >
                      <p className="font-mono text-[10px] tracking-[0.15em] uppercase text-slate">
                        {meta.label}
                      </p>
                      <p className="mt-1 font-mono text-3xl tabular-nums text-navy">
                        {formatRatePct(data.latest?.value ?? null)}
                      </p>
                      <p className="mt-1 font-mono text-[10px] text-charcoal/50">
                        {data.latest?.date ?? "—"}
                        {delta ? ` · ${delta} vs a year ago` : ""}
                      </p>
                      <p className="mt-3 text-xs leading-relaxed text-charcoal/60">
                        {meta.description}
                      </p>
                      <p className="mt-2 font-mono text-[9px] tracking-[0.12em] uppercase text-charcoal/35">
                        {meta.source}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}

            {showSpot ? (
              <div className="mt-4 rounded-2xl border border-navy/20 bg-navy p-5 text-white">
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

            <div className="mt-4">
              <Commentary note={content.marketNote} heading="Market note" />
            </div>
          </div>

          {/* Jumbo vs conforming */}
          <div>
            <p className={sectionLabel}>Jumbo vs conforming</p>
            <div className={card}>
              <p className="font-serif text-2xl leading-snug text-navy">
                {describeJumboSpread(spread)}
              </p>
              <MortgageSpreadChart
                lines={chartLines}
                caption="Optimal Blue 30-year fixed rate locks, last five years. Conforming = at or under the FHFA limit; jumbo = above it."
              />
              <p className={body}>
                In much of Fairfield County the purchase price pushes a normal
                20% down loan past the conforming limit, so the jumbo line is
                often the one that matters. Jumbo does not automatically mean
                more expensive: banks keep many jumbo loans on their own books
                and will price aggressively for strong borrowers, which is why
                the two lines cross from time to time.
              </p>
            </div>
          </div>

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
              <p className={body}>
                Both are government-sponsored enterprises that buy closed loans
                from lenders, guarantee timely payment to investors, and package
                them into securities. Fannie Mae dates to 1938, Freddie Mac to
                1970 — Freddie was created to give Fannie competition. Neither
                lends to consumers directly, and both have been in federal
                conservatorship since 2008.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                {[
                  [
                    "What they do",
                    "Buy conforming loans, guarantee the payments, and sell the resulting bonds — keeping cash flowing back to lenders.",
                  ],
                  [
                    "Why you feel them",
                    "Their guidelines set the credit, income, appraisal, and property standards behind most quoted rates.",
                  ],
                ].map(([title, text]) => (
                  <div key={title}>
                    <p className="mb-1 font-medium text-navy">{title}</p>
                    <p className="text-sm leading-relaxed text-charcoal/70">
                      {text}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Loan limits */}
          <div>
            <p className={sectionLabel}>
              Conforming loan limits · {loanLimits.year}
            </p>
            <div className={card}>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-charcoal/[0.08] bg-cream/40 p-4">
                  <p className="font-mono text-[10px] tracking-[0.15em] uppercase text-slate">
                    Baseline · 1-unit
                  </p>
                  <p className="mt-1 font-mono text-2xl tabular-nums text-navy">
                    {formatUsd(loanLimits.baselineOneUnit)}
                  </p>
                  <p className="mt-1 text-xs text-charcoal/60">
                    Applies across most of the country.
                  </p>
                </div>
                <div className="rounded-xl border border-charcoal/[0.08] bg-cream/40 p-4">
                  <p className="font-mono text-[10px] tracking-[0.15em] uppercase text-slate">
                    High-cost ceiling
                  </p>
                  <p className="mt-1 font-mono text-2xl tabular-nums text-navy">
                    {formatUsd(loanLimits.highCostCeiling)}
                  </p>
                  <p className="mt-1 text-xs text-charcoal/60">
                    The most a designated high-cost county can go (150% of
                    baseline).
                  </p>
                </div>
              </div>

              {loanLimits.counties.length > 0 ? (
                <div className="space-y-2">
                  {loanLimits.counties.map((county) => (
                    <div
                      key={county.id}
                      className="flex flex-wrap items-baseline justify-between gap-2 border-b border-charcoal/[0.06] pb-2 last:border-0"
                    >
                      <span className="font-medium text-navy">
                        {county.label}
                      </span>
                      <span className="font-mono tabular-nums text-navy">
                        {formatUsd(county.oneUnit)}
                      </span>
                      {county.note ? (
                        <span className="w-full text-xs text-charcoal/55">
                          {county.note}
                        </span>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}

              <p className={body}>
                FHFA resets these every year based on national home-price
                growth. At or under the limit, the loan is{" "}
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
      </section>
    </>
  );
}
