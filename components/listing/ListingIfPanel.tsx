"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { ArrowLeftRightIcon } from "@/components/icons";
import {
  fmtIfRentMoney,
  fmtIfSaleMoney,
  ifCompBasisText,
  roundIfRentHigh,
  roundIfRentLow,
  roundIfRentMidpoint,
  type IfEstimate,
  type ListingIfPayload,
} from "@/lib/listing-if-estimates";
import {
  listingComparablesHref,
  listingComparableRentalsHref,
} from "@/lib/listing-url";
import { spotlightSectionHref } from "@/lib/spotlight-url";

function IfEstimateRangeDisplay({
  low,
  high,
  midpoint = null,
  formatAmount,
  suffix = "",
}: {
  low: number | null;
  high: number | null;
  midpoint?: number | null;
  formatAmount: (value: number) => string;
  suffix?: string;
}) {
  const resolvedLow = low ?? (high == null ? midpoint : null);
  const resolvedHigh = high ?? (low == null ? midpoint : null);

  if (
    resolvedLow != null &&
    resolvedHigh != null &&
    resolvedLow !== resolvedHigh
  ) {
    const lowLabel = `${formatAmount(resolvedLow)}${suffix}`;
    const highLabel = `${formatAmount(resolvedHigh)}${suffix}`;
    return (
      <div
        className="flex flex-col gap-1.5"
        aria-label={`Between ${lowLabel} and ${highLabel}`}
      >
        <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-white/50">
          Between
        </span>
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 sm:gap-x-3">
          <span className="font-serif text-2xl sm:text-3xl text-white tabular-nums leading-snug">
            {lowLabel}
          </span>
          <ArrowLeftRightIcon className="h-5 w-5 shrink-0 text-gold/90" />
          <span className="font-serif text-2xl sm:text-3xl text-white tabular-nums leading-snug">
            {highLabel}
          </span>
        </div>
      </div>
    );
  }

  const single =
    resolvedLow != null && resolvedHigh != null
      ? `${formatAmount(resolvedLow)}${suffix}`
      : resolvedLow != null
        ? `${formatAmount(resolvedLow)}${suffix}`
        : resolvedHigh != null
          ? `${formatAmount(resolvedHigh)}${suffix}`
          : "—";

  return (
    <p className="font-serif text-2xl sm:text-3xl text-white tabular-nums leading-snug">
      {single}
    </p>
  );
}

/** Whole-dollar $/sqft, e.g. `$465/sqft` (sale). */
function fmtPpsfWhole(value: number): string {
  return `$${Math.round(value).toLocaleString("en-US")}/sqft`;
}

/** Two-decimal $/sqft, e.g. `$2.10/sqft` (monthly rent). */
function fmtPpsfCents(value: number): string {
  return `$${value.toFixed(2)}/sqft`;
}

function compCountPhrase(
  soldCount: number,
  activeCount: number,
  soldWord: string,
): string {
  const parts: string[] = [];
  if (soldCount > 0) parts.push(`${soldCount} ${soldWord}`);
  if (activeCount > 0) parts.push(`${activeCount} active`);
  if (parts.length === 0) return "the matched comps";
  return `${parts.join(" + ")} comps`;
}

/**
 * Reconstruct the sale range math from cached figures. `amount = $/sqft × sqft`,
 * and low/high are the weighted 25th–75th percentiles of the comp values, so we
 * can show the actual per-sqft numbers without recomputing anything.
 */
function saleMathNote(est: IfEstimate, sqft: number | null): string | null {
  if (est.amount == null || est.amountLow == null || est.amountHigh == null) {
    return null;
  }
  const comps = compCountPhrase(est.soldCount, est.activeCount, "sold");
  const mid = fmtIfSaleMoney(est.amount);
  const low = fmtIfSaleMoney(est.amountLow);
  const high = fmtIfSaleMoney(est.amountHigh);
  if (sqft && sqft > 0) {
    return (
      `Math: weighted ${fmtPpsfWhole(est.amount / sqft)} × ` +
      `${sqft.toLocaleString("en-US")} sqft = ${mid} midpoint. ` +
      `Low ${low} / high ${high} are the 25th–75th percentile of ${comps} ` +
      `(${fmtPpsfWhole(est.amountLow / sqft)}–${fmtPpsfWhole(est.amountHigh / sqft)}).`
    );
  }
  return (
    `Math: weighted median of ${comps} = ${mid} midpoint. ` +
    `Low ${low} / high ${high} are the 25th–75th percentile of those comp prices.`
  );
}

/** Same reconstruction for the monthly-rent range (values rounded to $100). */
function rentMathNote(est: IfEstimate, sqft: number | null): string | null {
  if (est.amount == null || est.amountLow == null || est.amountHigh == null) {
    return null;
  }
  const comps = compCountPhrase(est.soldCount, est.activeCount, "leased");
  const mid = `${fmtIfRentMoney(roundIfRentMidpoint(est.amount))}/mo`;
  const low = `${fmtIfRentMoney(roundIfRentLow(est.amountLow))}/mo`;
  const high = `${fmtIfRentMoney(roundIfRentHigh(est.amountHigh))}/mo`;
  if (sqft && sqft > 0) {
    return (
      `Math: ${fmtPpsfCents(est.amount / sqft)} × ` +
      `${sqft.toLocaleString("en-US")} sqft = ${mid} midpoint. ` +
      `Low ${low} / high ${high} are the 25th–75th percentile of ${comps}.`
    );
  }
  return (
    `Math: weighted median of ${comps} = ${mid} midpoint. ` +
    `Low ${low} / high ${high} are the 25th–75th percentile of those lease prices.`
  );
}

function ScenarioCard({
  title,
  headline,
  range,
  midpoint,
  amountLabel,
  midpointLabel,
  basis,
  mathNote,
  exploreHref,
  exploreLabel,
  hasEstimate,
}: {
  title: string;
  headline: string;
  range: ReactNode;
  midpoint: string | null;
  amountLabel: string;
  midpointLabel: string;
  basis: string | null;
  mathNote: string | null;
  exploreHref: string;
  exploreLabel: string;
  hasEstimate: boolean;
}) {
  return (
    <article className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 sm:p-8 flex flex-col gap-4">
      <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-gold">
        {title}
      </p>
      <p className="text-white/70 text-sm leading-relaxed">{headline}</p>
      <div>
        {range}
        <p className="mt-1 font-mono text-[10px] tracking-[0.12em] uppercase text-white/35">
          {amountLabel}
        </p>
        {hasEstimate && midpoint ? (
          <p className="mt-2 font-mono text-[10px] tracking-[0.1em] text-white/45 tabular-nums">
            {midpointLabel}: {midpoint}
          </p>
        ) : null}
      </div>
      {hasEstimate && basis ? (
        <p className="text-white/45 text-xs leading-relaxed">{basis}</p>
      ) : (
        <p className="text-white/45 text-xs leading-relaxed">
          We don&apos;t have enough comparable {title.toLowerCase()} data yet
          to estimate a likely price for this property.
        </p>
      )}
      {hasEstimate && mathNote ? (
        <p className="font-mono text-[10px] leading-relaxed tracking-[0.03em] text-white/35 tabular-nums">
          {mathNote}
        </p>
      ) : null}
      <Link
        href={exploreHref}
        className="mt-auto font-mono text-[10px] tracking-[0.12em] uppercase text-white/40 underline underline-offset-2 decoration-white/20 hover:text-gold hover:decoration-gold/50 transition-colors w-fit"
      >
        {exploreLabel}
      </Link>
    </article>
  );
}

export function ListingIfPageContent({
  mlsId,
  addressHint,
  townHint,
  routeBase = "listing",
}: {
  mlsId: string;
  addressHint?: string | null;
  townHint?: string | null;
  routeBase?: "listing" | "spotlight";
}) {
  return (
    <ListingIfPanel
      mlsId={mlsId}
      addressHint={addressHint}
      townHint={townHint}
      routeBase={routeBase}
      variant="page"
    />
  );
}

export default function ListingIfPanel({
  mlsId,
  addressHint,
  townHint,
  routeBase = "listing",
  variant = "panel",
}: {
  mlsId: string;
  addressHint?: string | null;
  townHint?: string | null;
  routeBase?: "listing" | "spotlight";
  variant?: "panel" | "page";
}) {
  const [data, setData] = useState<ListingIfPayload | null>(null);
  const [loading, setLoading] = useState(true);

  const isPage = variant === "page";

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetch(`/api/listings/${encodeURIComponent(mlsId)}/if`, {
      cache: "default",
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((payload: ListingIfPayload | null) => {
        if (!cancelled) {
          setData(payload);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [mlsId]);

  const saleEstimate = data?.sale ?? {
    amount: null,
    amountLow: null,
    amountHigh: null,
    soldCount: 0,
    activeCount: 0,
  };
  const rentEstimate = data?.rent ?? {
    amount: null,
    amountLow: null,
    amountHigh: null,
    soldCount: 0,
    activeCount: 0,
  };

  const saleBasis = ifCompBasisText(
    saleEstimate.soldCount,
    saleEstimate.activeCount,
    "sale",
    data?.locationLabel,
    data?.locationPremiumLabels,
    data?.subjectVintageLabel,
  );
  const rentBasis = ifCompBasisText(
    rentEstimate.soldCount,
    rentEstimate.activeCount,
    "rental",
    data?.locationLabel,
    data?.locationPremiumLabels,
    data?.subjectVintageLabel,
  );

  const comparablesHref =
    routeBase === "spotlight"
      ? spotlightSectionHref("comparables")
      : listingComparablesHref(mlsId, addressHint, townHint);
  const rentalsHref =
    routeBase === "spotlight"
      ? spotlightSectionHref("comparable-rentals")
      : listingComparableRentalsHref(mlsId, addressHint, townHint);

  if (loading) {
    return (
      <div className={isPage ? "w-full min-w-0" : "rounded-2xl border border-white/10 bg-white/[0.04] p-6"}>
        {!isPage && (
          <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-gold mb-3">
            If...
          </p>
        )}
        <p className="font-mono text-[10px] tracking-[0.15em] uppercase text-white/40">
          Loading…
        </p>
      </div>
    );
  }

  return (
    <div className={isPage ? "w-full min-w-0 space-y-6" : "rounded-2xl border border-white/10 bg-white/[0.04] p-6 space-y-5"}>
      {isPage && (
        <>
          <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-gold mb-1">
            If...
          </p>
          <p className="text-white/50 text-sm leading-relaxed">
            What this property might command on the market today — shown as a
            likely range from comparable sales and listings matched by vintage,
            size, and location profile.
          </p>
        </>
      )}

      <div className="grid gap-6 sm:grid-cols-2 items-stretch">
        <ScenarioCard
          title="If you sell"
          headline="If you were to sell this home, this is the range you would likely sell it for."
          range={
            <IfEstimateRangeDisplay
              low={saleEstimate.amountLow}
              high={saleEstimate.amountHigh}
              midpoint={saleEstimate.amount}
              formatAmount={fmtIfSaleMoney}
            />
          }
          midpoint={
            saleEstimate.amount != null
              ? fmtIfSaleMoney(saleEstimate.amount)
              : null
          }
          amountLabel="Estimated Value Range"
          midpointLabel="Midpoint"
          basis={saleBasis}
          mathNote={saleMathNote(saleEstimate, data?.subjectSqft ?? null)}
          exploreHref={comparablesHref}
          exploreLabel="View comparables"
          hasEstimate={
            saleEstimate.amount != null ||
            saleEstimate.soldCount + saleEstimate.activeCount > 0
          }
        />
        <ScenarioCard
          title="If you rent"
          headline="If you were to rent this home, this is the range you would likely be able to rent it for."
          range={
            <IfEstimateRangeDisplay
              low={
                rentEstimate.amountLow != null
                  ? roundIfRentLow(rentEstimate.amountLow)
                  : null
              }
              high={
                rentEstimate.amountHigh != null
                  ? roundIfRentHigh(rentEstimate.amountHigh)
                  : null
              }
              midpoint={
                rentEstimate.amount != null
                  ? roundIfRentMidpoint(rentEstimate.amount)
                  : null
              }
              formatAmount={fmtIfRentMoney}
              suffix="/mo"
            />
          }
          midpoint={
            rentEstimate.amount != null
              ? `${fmtIfRentMoney(roundIfRentMidpoint(rentEstimate.amount))}/mo`
              : null
          }
          amountLabel="Estimated monthly rent range"
          midpointLabel="Midpoint"
          basis={rentBasis}
          mathNote={rentMathNote(rentEstimate, data?.subjectSqft ?? null)}
          exploreHref={rentalsHref}
          exploreLabel="View comparable rentals"
          hasEstimate={
            rentEstimate.amount != null ||
            rentEstimate.soldCount + rentEstimate.activeCount > 0
          }
        />
      </div>

      {data?.rangeBlurb ? (
        <p className="font-mono text-[10px] leading-relaxed tracking-[0.04em] text-white/35">
          {addressHint
            ? `${addressHint}${townHint ? `, ${townHint}` : ""} — ${
                data.rangeBlurb
              }`
            : data.rangeBlurb}
        </p>
      ) : null}
    </div>
  );
}
