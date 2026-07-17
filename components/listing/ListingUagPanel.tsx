"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import ListingThumbImage from "@/components/ListingThumbImage";
import { fmtDate, fmtMoney } from "@/lib/listing-history";
import {
  fmtAcres,
  fmtSqft,
  fmtPricePerSqft,
  fmtYearBuilt,
  vintageCriteriaList,
  type ComparableListing,
  type ComparablesCriteria,
  type CompactListingHistoryEvent,
} from "@/lib/listing-comparables-shared";
import { listingDetailHref, listingPhotoProxyUrl } from "@/lib/listing-url";
import { listingHoverHandlers } from "@/lib/warm-listing-cache";
import {
  loadTabJson,
  peekTabJson,
  prefetchTabJson,
} from "@/lib/tab-data-prefetch";

type UagResponse = {
  sale: ComparableListing[];
  rental: ComparableListing[];
  criteria: ComparablesCriteria | null;
  missingCriteria: string[];
};

type HistoryResponse = {
  events: CompactListingHistoryEvent[];
  priorListings: Array<{
    mlsId: string;
    status: string;
    listDate: string | null;
    closeDate: string | null;
    closePrice: number | null;
    price: number | null;
  }>;
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

function historyUrl(mlsId: string, town: string | null): string {
  const params = new URLSearchParams();
  if (town?.trim()) params.set("town", town.trim());
  const qs = params.toString();
  return `/api/listings/${encodeURIComponent(mlsId)}/history${
    qs ? `?${qs}` : ""
  }`;
}

/** Shorten full history labels for the one-line UAG timeline. */
function compactEventText(event: CompactListingHistoryEvent): string {
  const date = fmtDate(event.date);
  let label = event.label;
  if (label === "Listed on MLS") label = "Listed";
  else if (label === "Price reduced") label = "Reduced";
  else if (label === "Price changed") label = "Changed";
  else if (label === "Status updated") label = "Status";

  const parts = [date, label, event.detail].filter(Boolean);
  return parts.join(" · ");
}

function UagRowHistory({
  mlsId,
  town,
  embedded,
}: {
  mlsId: string;
  town: string | null;
  embedded?: CompactListingHistoryEvent[];
}) {
  const url = historyUrl(mlsId, town);
  const [remote, setRemote] = useState<HistoryResponse | null>(
    () => peekTabJson<HistoryResponse>(url) ?? null,
  );
  const [loading, setLoading] = useState(() => !peekTabJson(url));

  useEffect(() => {
    let cancelled = false;
    const cached = peekTabJson<HistoryResponse>(url);
    if (cached) {
      setRemote(cached);
      setLoading(false);
    }

    loadTabJson<HistoryResponse>(url)
      .then((d) => {
        if (cancelled) return;
        if (d) setRemote(d);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [url]);

  const events =
    remote?.events?.length ? remote.events : (embedded ?? []);
  const prior = remote?.priorListings?.[0] ?? null;

  // Soft placeholder while we wait and nothing was embedded from the UAG payload.
  if (!events.length && !prior) {
    if (!loading) return null;
    return (
      <p className="mt-2 font-mono text-[10px] tracking-[0.08em] text-white/25 truncate">
        History…
      </p>
    );
  }

  const lines = events.slice(0, 3).map(compactEventText);
  if (prior) {
    const priorBits = [
      prior.closeDate
        ? `Prior closed ${fmtDate(prior.closeDate)}`
        : prior.listDate
          ? `Prior listed ${fmtDate(prior.listDate)}`
          : "Prior listing",
      prior.closePrice != null
        ? fmtMoney(prior.closePrice)
        : prior.price != null
          ? fmtMoney(prior.price)
          : null,
      prior.status !== "Closed" ? prior.status : null,
    ].filter(Boolean);
    lines.push(priorBits.join(" · "));
  }

  return (
    <div className="mt-2 space-y-0.5 min-w-0">
      {lines.map((line) => (
        <p
          key={line}
          className="font-mono text-[10px] leading-snug tracking-[0.02em] text-white/40 truncate"
          title={line}
        >
          {line}
        </p>
      ))}
      {loading && !remote ? (
        <p className="font-mono text-[10px] text-white/20">Updating…</p>
      ) : null}
    </div>
  );
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
      <UagRowHistory
        mlsId={id}
        town={town || comp.city}
        embedded={comp.historyEvents}
      />
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

  // Soft-prefetch history for visible rows into the session tab cache.
  useEffect(() => {
    const visible = comps.slice(0, Math.min(visibleCount, UAG_MAX_VISIBLE));
    for (const comp of visible) {
      const historyId = comp.listingKey?.trim() || comp.mlsId;
      prefetchTabJson(historyUrl(historyId, town || comp.city));
    }
  }, [comps, visibleCount, town]);

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
