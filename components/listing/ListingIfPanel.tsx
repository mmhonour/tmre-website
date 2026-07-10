"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  fmtIfRentEstimateRange,
  fmtIfRentMoney,
  fmtIfSaleMoney,
  fmtIfEstimateRange,
  ifCompBasisText,
  roundIfRentMidpoint,
  type ListingIfPayload,
} from "@/lib/listing-if-estimates";
import {
  listingComparablesHref,
  listingComparableRentalsHref,
} from "@/lib/listing-url";
import { spotlightSectionHref } from "@/lib/spotlight-url";

function ScenarioCard({
  title,
  headline,
  range,
  midpoint,
  amountLabel,
  midpointLabel,
  basis,
  exploreHref,
  exploreLabel,
  hasEstimate,
}: {
  title: string;
  headline: string;
  range: string;
  midpoint: string | null;
  amountLabel: string;
  midpointLabel: string;
  basis: string | null;
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
        <p className="font-serif text-2xl sm:text-3xl text-white tabular-nums leading-snug">
          {range}
        </p>
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
          range={fmtIfEstimateRange(
            saleEstimate.amountLow,
            saleEstimate.amountHigh,
            fmtIfSaleMoney,
            saleEstimate.amount,
          )}
          midpoint={
            saleEstimate.amount != null
              ? fmtIfSaleMoney(saleEstimate.amount)
              : null
          }
          amountLabel="Estimated Value Range"
          midpointLabel="Midpoint"
          basis={saleBasis}
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
          range={fmtIfRentEstimateRange(
            rentEstimate.amountLow,
            rentEstimate.amountHigh,
            rentEstimate.amount,
          )}
          midpoint={
            rentEstimate.amount != null
              ? `${fmtIfRentMoney(roundIfRentMidpoint(rentEstimate.amount))}/mo`
              : null
          }
          amountLabel="Estimated monthly rent range"
          midpointLabel="Midpoint"
          basis={rentBasis}
          exploreHref={rentalsHref}
          exploreLabel="View comparable rentals"
          hasEstimate={
            rentEstimate.amount != null ||
            rentEstimate.soldCount + rentEstimate.activeCount > 0
          }
        />
      </div>
    </div>
  );
}
