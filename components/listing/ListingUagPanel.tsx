"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import ListingThumbImage from "@/components/ListingThumbImage";
import { fmtMoney } from "@/lib/listing-history";
import {
  fmtAcres,
  fmtSqft,
  fmtPricePerSqft,
  fmtYearBuilt,
  vintageCriteriaList,
  type ComparableListing,
  type ComparablesCriteria,
} from "@/lib/listing-comparables-shared";
import { listingDetailHref, listingPhotoProxyUrl } from "@/lib/listing-url";
import { listingHoverHandlers } from "@/lib/warm-listing-cache";
import { loadTabJson, peekTabJson } from "@/lib/tab-data-prefetch";

type UagResponse = {
  sale: ComparableListing[];
  rental: ComparableListing[];
  criteria: ComparablesCriteria | null;
  missingCriteria: string[];
};

const UAG_INITIAL_VISIBLE = 4;
const UAG_SHOW_MORE_STEP = 4;
const UAG_MAX_VISIBLE = 8;

function bedBathLabel(beds: number | null, baths: number | null): string {
  const parts: string[] = [];
  if (beds != null) parts.push(`${beds} bd`);
  if (baths != null) parts.push(`${baths} ba`);
  return parts.length ? parts.join(" · ") : "—";
}

// Identical thresholds to the Comparables / Comparable Rentals tabs — UAG shares
// the same subjectComparablesCriteria + matchesComparableCriteria under the hood,
// so the summary here mirrors those tabs (beds/baths ±1, living area ±30%,
// lot ±40%, same vintage era plus the bordering era near an edge).
function criteriaSummary(criteria: ComparablesCriteria): string {
  const parts = [
    `Zip ${criteria.zip}`,
    `${criteria.beds} bed ±1 / ${criteria.baths} bath ±1`,
    vintageCriteriaList(criteria),
  ];
  if (criteria.sqft != null) {
    parts.push(`${fmtSqft(criteria.sqft)} ±30%`);
  }
  if (criteria.lotAcres != null) {
    parts.push(`${fmtAcres(criteria.lotAcres)} ±40%`);
  }
  return parts.join(" · ");
}

function UagRow({
  comp,
  town,
  isRental,
}: {
  comp: ComparableListing;
  town: string | null;
  isRental: boolean;
}) {
  const id = comp.listingKey?.trim() || comp.mlsId;
  const href = listingDetailHref(id, comp.address, town || comp.city);
  // Prefer listingKey (R2 + RETS SystemID). UAG rows often aren't in Postgres
  // under MLS # — mlsId-only proxy URLs miss the cache and fail RETS.
  const thumbUrl =
    id && comp.photoCount !== 0 ? listingPhotoProxyUrl(id, 0) : null;

  const priceLabel = `${fmtMoney(comp.price)}${isRental ? "/mo" : ""}`;
  const metaParts = [
    bedBathLabel(comp.beds, comp.baths),
    fmtSqft(comp.sqft),
    fmtAcres(comp.lotAcres),
    fmtYearBuilt(comp.yearBuilt),
    isRental ? null : fmtPricePerSqft(comp.pricePerSqft),
  ].filter(Boolean);

  return (
    <li
      {...listingHoverHandlers(comp.mlsId)}
      className="text-sm border-t border-white/[0.06] pt-3 first:border-0 first:pt-0"
    >
      <div className="flex items-baseline justify-between gap-3 min-w-0">
        <Link
          href={href}
          className="min-w-0 truncate text-white/90 hover:text-gold transition-colors font-medium"
        >
          {comp.address}
        </Link>
        <span className="shrink-0 tabular-nums text-right text-gold font-mono text-xs">
          {priceLabel}
        </span>
      </div>
      <div className="mt-1.5 flex gap-3 items-start">
        <div className="shrink-0 w-20">
          {thumbUrl ? (
            <Link
              href={href}
              className="relative block w-20 h-14 rounded-lg overflow-hidden border border-white/10 bg-white/5"
              aria-hidden
              tabIndex={-1}
            >
              <ListingThumbImage
                src={thumbUrl}
                alt=""
                priority={false}
                imgClassName="absolute inset-0 w-full h-full object-cover"
              />
            </Link>
          ) : (
            <div
              className="w-20 h-14 rounded-lg border border-white/10 bg-white/5"
              aria-hidden
            />
          )}
        </div>
        <div className="min-w-0 flex-1 text-right">
          {comp.dom != null ? (
            <p className="tabular-nums text-white/50 font-mono text-xs">
              {comp.dom} DOM
            </p>
          ) : null}
          <p
            className={`text-white/50 text-xs${comp.dom != null ? " mt-1" : ""}`}
          >
            {metaParts.join(" · ")}
          </p>
        </div>
      </div>
    </li>
  );
}

function UagColumn({
  label,
  emptyLabel,
  comps,
  town,
  isRental,
}: {
  label: string;
  emptyLabel: string;
  comps: ComparableListing[];
  town: string | null;
  isRental: boolean;
}) {
  const [visibleCount, setVisibleCount] = useState(UAG_INITIAL_VISIBLE);

  useEffect(() => {
    setVisibleCount(UAG_INITIAL_VISIBLE);
  }, [comps]);

  const cap = Math.min(comps.length, UAG_MAX_VISIBLE);
  const visible = comps.slice(0, Math.min(visibleCount, cap));
  const canShowMore = visibleCount < cap && comps.length > visibleCount;

  return (
    <div className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.04] p-6">
      <p className="font-mono text-[10px] tracking-[0.15em] uppercase text-white/45 mb-3">
        {label}
      </p>
      {visible.length > 0 ? (
        <>
          <ul className="space-y-3">
            {visible.map((comp) => (
              <UagRow
                key={comp.mlsId}
                comp={comp}
                town={town}
                isRental={isRental}
              />
            ))}
          </ul>
          {canShowMore ? (
            <button
              type="button"
              onClick={() =>
                setVisibleCount((n) =>
                  Math.min(n + UAG_SHOW_MORE_STEP, UAG_MAX_VISIBLE),
                )
              }
              className="mt-3 font-mono text-[10px] tracking-[0.12em] uppercase transition-colors underline underline-offset-2 text-white/35 decoration-white/20 hover:text-gold hover:decoration-gold/50"
            >
              Show {UAG_SHOW_MORE_STEP} more
            </button>
          ) : null}
        </>
      ) : (
        <p className="text-white/50 text-sm">{emptyLabel}</p>
      )}
    </div>
  );
}

export function ListingUagPageContent({
  mlsId,
  townHint,
  fetchUrl,
}: {
  mlsId: string;
  townHint?: string | null;
  fetchUrl?: string;
}) {
  const [data, setData] = useState<UagResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const uagUrl = fetchUrl ?? `/api/listings/${encodeURIComponent(mlsId)}/uag`;
  const town = townHint ?? null;

  useEffect(() => {
    let cancelled = false;
    const cached = peekTabJson<UagResponse>(uagUrl);
    if (cached) {
      setData(cached);
      setLoadError(null);
      setLoading(false);
    } else {
      setLoading(true);
      setLoadError(null);
    }

    loadTabJson<UagResponse>(uagUrl)
      .then((d) => {
        if (cancelled) return;
        if (!d) {
          setData(null);
          setLoadError("Couldn't load under-agreement comps.");
          return;
        }
        setData(d);
        setLoadError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setData(null);
        setLoadError(
          err instanceof Error
            ? err.message
            : "Couldn't load under-agreement comps.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [uagUrl]);

  const sale = data?.sale ?? [];
  const rental = data?.rental ?? [];
  const criteria = data?.criteria ?? null;
  const missing = data?.missingCriteria ?? [];

  return (
    <div className="w-full min-w-0 space-y-6">
      <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-gold mb-1">
        Under Agreement
      </p>
      <p className="text-white/50 text-sm">
        Homes currently under contract (Under Contract and Under Contract –
        Continue to Show), matched with the same thresholds as Comparables:
        same zip, beds within ±1, baths within ±1, living area within ±30%,
        similar vintage (same era, plus the bordering era near a vintage edge),
        and lot size when available — pulled live from the MLS.
      </p>

      {criteria && (
        <p className="font-mono text-[10px] tracking-[0.12em] uppercase text-white/40">
          Matching {criteriaSummary(criteria)}
        </p>
      )}

      {loading && (
        <p className="font-mono text-[10px] tracking-[0.15em] uppercase text-white/40">
          Loading…
        </p>
      )}

      {loadError && !loading && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-8 text-center">
          <p className="text-white/60 text-sm">{loadError}</p>
        </div>
      )}

      {!loading && !loadError && missing.length > 0 && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6">
          <p className="text-white/60 text-sm">
            Not enough detail on this listing to match under-agreement comps
            (missing {missing.join(", ")}).
          </p>
        </div>
      )}

      {!loading && !loadError && missing.length === 0 && (
        <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 items-start">
          <UagColumn
            label="For sale · Under agreement"
            emptyLabel="No under-agreement sales found yet."
            comps={sale}
            town={town}
            isRental={false}
          />
          <UagColumn
            label="Rentals · Under agreement"
            emptyLabel="No under-agreement rentals found yet."
            comps={rental}
            town={town}
            isRental
          />
        </div>
      )}
    </div>
  );
}
