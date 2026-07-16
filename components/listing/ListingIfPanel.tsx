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
import { loadTabJson, peekTabJson } from "@/lib/tab-data-prefetch";

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
 * Reconstruct the range math from cached figures as a compact worksheet:
 * `weighted $/sqft × sqft = midpoint`, then the low/high band. Everything is
 * derived from the cached `IfEstimate` (`amount = $/sqft × sqft`; low/high are
 * the weighted 25th–75th percentiles) so nothing is recomputed. The weighted
 * $/sqft is a toggle that reveals how it was derived plus the comp $/sqft span.
 */
function IfMathWorksheet({
  est,
  sqft,
  kind,
}: {
  est: IfEstimate;
  sqft: number | null;
  kind: "sale" | "rent";
}) {
  const [showPpsf, setShowPpsf] = useState(false);

  if (est.amount == null || est.amountLow == null || est.amountHigh == null) {
    return null;
  }

  const isRent = kind === "rent";
  const soldWord = isRent ? "rented" : "sold";
  const comps = compCountPhrase(est.soldCount, est.activeCount, soldWord);

  const midLabel = isRent
    ? `${fmtIfRentMoney(roundIfRentMidpoint(est.amount))}/mo`
    : fmtIfSaleMoney(est.amount);

  const hasSqft = sqft != null && sqft > 0;
  const fmtPpsf = isRent ? fmtPpsfCents : fmtPpsfWhole;
  const ppsfLabel = hasSqft ? fmtPpsf(est.amount / sqft) : null;
  const lowPpsf = hasSqft ? fmtPpsf(est.amountLow / sqft) : null;
  const highPpsf = hasSqft ? fmtPpsf(est.amountHigh / sqft) : null;

  const linkClass =
    "text-gold underline decoration-gold/50 underline-offset-2 hover:text-gold-light transition-colors cursor-pointer";

  return (
    <div className="font-mono text-[10px] text-white/40 tabular-nums leading-relaxed">
      <span className="uppercase tracking-[0.12em] text-white/50">Math: weighted</span>

      {hasSqft && ppsfLabel ? (
        <div className="mt-1 w-fit text-right">
          <button
            type="button"
            onClick={() => setShowPpsf((v) => !v)}
            className={linkClass}
            title="How this $/sqft was derived"
            aria-expanded={showPpsf}
          >
            {ppsfLabel}
          </button>
          <div>
            <span className="text-white/30">× </span>
            {sqft.toLocaleString("en-US")} sqft
          </div>
          <div className="my-0.5 border-t border-white/20" />
          <div className="text-white/70">{midLabel}</div>
        </div>
      ) : (
        <div className="mt-1 text-white/60">
          {midLabel}{" "}
          <span className="text-white/30">(weighted median of {comps})</span>
        </div>
      )}

      <p className="mt-2 normal-case tracking-normal">
        These are the 25th–75th percentile — in other words we exclude the top
        quarter and bottom quarter of the market, based on {comps}
        {lowPpsf && highPpsf ? ` that range from ${lowPpsf}–${highPpsf}` : ""}.
      </p>

      {showPpsf && ppsfLabel ? (
        <p className="mt-1 normal-case tracking-normal text-white/45">
          {ppsfLabel} is the weighted median $/sqft of the matched comps — closed{" "}
          {isRent ? "leases" : "sales"} count more than active{" "}
          {isRent ? "rentals" : "listings"}, and same-vintage, same
          location-tier comps are weighted higher.
          {lowPpsf && highPpsf
            ? ` Those ${soldWord} comps range ${lowPpsf}–${highPpsf}.`
            : ""}
        </p>
      ) : null}
    </div>
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
  mathNote: ReactNode;
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
      {hasEstimate && mathNote ? <div>{mathNote}</div> : null}
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
    const url = `/api/listings/${encodeURIComponent(mlsId)}/if`;
    const cached = peekTabJson<ListingIfPayload>(url);
    if (cached) {
      setData(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }

    loadTabJson<ListingIfPayload>(url)
      .then((payload) => {
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
          mathNote={
            <IfMathWorksheet
              est={saleEstimate}
              sqft={data?.subjectSqft ?? null}
              kind="sale"
            />
          }
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
          mathNote={
            <IfMathWorksheet
              est={rentEstimate}
              sqft={data?.subjectSqft ?? null}
              kind="rent"
            />
          }
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
