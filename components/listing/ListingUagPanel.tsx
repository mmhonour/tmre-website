"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import ListingThumbImage from "@/components/ListingThumbImage";
import {
  CompFoundLegendRow,
  renderCompBedBathMeta,
} from "@/components/listing/CompExactMatchMeta";
import ListingCriteriaSideLayout, {
  listingCriteriaLinkSlotId,
} from "@/components/listing/ListingCriteriaSideLayout";
import { LISTING_SECTION_IDS } from "@/components/listing/listing-section-ids";
import MatchingCriteriaSummary, {
  type CriteriaStepFeedback,
  type CriteriaStepKey,
} from "@/components/listing/MatchingCriteriaSummary";
import { fmtDate, fmtMoney } from "@/lib/listing-history";
import {
  fmtAcres,
  fmtSqft,
  fmtPricePerSqft,
  fmtYearBuilt,
  type ComparableListing,
  type ComparablesCriteria,
  type CompactListingHistoryEvent,
} from "@/lib/listing-comparables-shared";
import {
  comparableListingMatchesSession,
  defaultSessionOverrides,
  sessionOverridesFromPricingConfig,
  sessionOverridesNeedWidePool,
  type SessionMatchOverrides,
} from "@/lib/listing-comparables-session";
import type { PricingMatchingConfig } from "@/lib/pricing-matching-config-shared";
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
  matchConfig?: PricingMatchingConfig;
};

const CRITERIA_STEP_FEEDBACK_MS = 10_000;

function criteriaStepMatchNote(opts: {
  prevSale: number;
  prevRental: number;
  nextSale: number;
  nextRental: number;
  waitingWide: boolean;
}): string {
  const prevTotal = opts.prevSale + opts.prevRental;
  const nextTotal = opts.nextSale + opts.nextRental;
  const delta = nextTotal - prevTotal;
  const counts = `${opts.nextSale} sale · ${opts.nextRental} rental`;

  if (opts.waitingWide && delta <= 0) {
    return "No new matches yet — loading wider pool…";
  }
  if (nextTotal === 0) return `Nothing matched · ${counts}`;
  if (delta > 0) return `Found ${delta} more · ${counts}`;
  if (delta < 0) return `${Math.abs(delta)} fewer · ${counts}`;
  return `No change · ${counts}`;
}

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

function UagMetaLine({
  beds,
  baths,
  subjectBeds,
  subjectBaths,
  restParts,
}: {
  beds: number | null;
  baths: number | null;
  subjectBeds?: number | null;
  subjectBaths?: number | null;
  restParts: (string | null | undefined)[];
}): ReactNode {
  const rest = restParts.filter(Boolean) as string[];
  return (
    <p className="text-white/50 text-xs">
      {renderCompBedBathMeta({ beds, baths, subjectBeds, subjectBaths })}
      {rest.length > 0 ? ` · ${rest.join(" · ")}` : null}
    </p>
  );
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
  subjectBeds = null,
  subjectBaths = null,
}: {
  comp: ComparableListing;
  town: string | null;
  isRental: boolean;
  subjectBeds?: number | null;
  subjectBaths?: number | null;
}) {
  const id = comp.listingKey?.trim() || comp.mlsId;
  const href = listingDetailHref(id, comp.address, town || comp.city);
  // Prefer listingKey (R2 + RETS SystemID). UAG rows often aren't in Postgres
  // under MLS # — mlsId-only proxy URLs miss the cache and fail RETS.
  const thumbUrl =
    id && comp.photoCount !== 0 ? listingPhotoProxyUrl(id, 0) : null;

  const priceLabel = `${fmtMoney(comp.price)}${isRental ? "/mo" : ""}`;
  const restMetaParts = [
    fmtSqft(comp.sqft),
    fmtAcres(comp.lotAcres),
    fmtYearBuilt(comp.yearBuilt),
    isRental ? null : fmtPricePerSqft(comp.pricePerSqft),
  ];

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
          <div className={comp.dom != null ? "mt-1" : undefined}>
            <UagMetaLine
              beds={comp.beds}
              baths={comp.baths}
              subjectBeds={subjectBeds}
              subjectBaths={subjectBaths}
              restParts={restMetaParts}
            />
          </div>
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
  subjectBeds = null,
  subjectBaths = null,
  foundCountEmphasized = false,
  criteriaLinkSlotId = null,
}: {
  label: string;
  emptyLabel: string;
  comps: ComparableListing[];
  town: string | null;
  isRental: boolean;
  subjectBeds?: number | null;
  subjectBaths?: number | null;
  /** Scale "N found" up 50% while Criteria ± feedback is active. */
  foundCountEmphasized?: boolean;
  /** Optional Criteria toggle mount (first column only). */
  criteriaLinkSlotId?: string | null;
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
    <div className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.04] p-6 max-lg:rounded-none max-lg:border-x-0 max-lg:px-3 max-lg:py-4">
      <div className="mb-2">
        <p className="font-mono text-[10px] tracking-[0.15em] uppercase text-white/45">
          {label}
        </p>
        {criteriaLinkSlotId ? (
          <div
            id={criteriaLinkSlotId}
            className="mt-2 flex justify-end"
          />
        ) : null}
      </div>
      <CompFoundLegendRow
        theme="dark"
        foundCount={comps.length}
        foundCountClass={`inline-block origin-top-right font-mono text-[10px] tracking-[0.16em] uppercase tabular-nums whitespace-nowrap text-white/40 transition-transform duration-300 ease-out ${
          foundCountEmphasized ? "scale-150" : "scale-100"
        }`}
      />
      <div className="mt-0">
      {visible.length > 0 ? (
        <>
          <ul className="space-y-3">
            {visible.map((comp) => (
              <UagRow
                key={comp.mlsId}
                comp={comp}
                town={town}
                isRental={isRental}
                subjectBeds={subjectBeds}
                subjectBaths={subjectBaths}
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
    </div>
  );
}

export function ListingUagPageContent({
  mlsId,
  townHint,
  fetchUrl,
  suppressPageChrome = false,
}: {
  mlsId: string;
  townHint?: string | null;
  fetchUrl?: string;
  suppressPageChrome?: boolean;
}) {
  const [data, setData] = useState<UagResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sessionMatch, setSessionMatch] = useState<SessionMatchOverrides | null>(
    null,
  );
  const [baselineMatch, setBaselineMatch] = useState<SessionMatchOverrides | null>(
    null,
  );
  const [sessionSeeded, setSessionSeeded] = useState(false);
  const [wideData, setWideData] = useState<UagResponse | null>(null);
  const [widePoolLoading, setWidePoolLoading] = useState(false);
  const [criteriaStepFeedback, setCriteriaStepFeedback] =
    useState<CriteriaStepFeedback | null>(null);
  const criteriaFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const pendingWideFeedbackKeyRef = useRef<CriteriaStepKey | null>(null);

  const uagUrl = fetchUrl ?? `/api/listings/${encodeURIComponent(mlsId)}/uag`;
  const wideUagUrl = `${uagUrl}${uagUrl.includes("?") ? "&" : "?"}pool=wide`;
  const town = townHint ?? null;

  useEffect(() => {
    setSessionMatch(null);
    setBaselineMatch(null);
    setSessionSeeded(false);
    setWideData(null);
    setWidePoolLoading(false);
    setCriteriaStepFeedback(null);
    pendingWideFeedbackKeyRef.current = null;
    if (criteriaFeedbackTimerRef.current != null) {
      clearTimeout(criteriaFeedbackTimerRef.current);
      criteriaFeedbackTimerRef.current = null;
    }
  }, [uagUrl]);

  useEffect(() => {
    return () => {
      if (criteriaFeedbackTimerRef.current != null) {
        clearTimeout(criteriaFeedbackTimerRef.current);
      }
    };
  }, []);

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

  useEffect(() => {
    const criteria = data?.criteria;
    if (!criteria || sessionSeeded) return;
    const seeded = data.matchConfig
      ? sessionOverridesFromPricingConfig(data.matchConfig, criteria)
      : defaultSessionOverrides(criteria);
    setBaselineMatch(seeded);
    setSessionMatch(seeded);
    setSessionSeeded(true);
  }, [data, sessionSeeded]);

  const sessionReady = Boolean(data?.criteria && sessionMatch && baselineMatch);
  useEffect(() => {
    if (!sessionReady) return;
    let cancelled = false;
    setWidePoolLoading(true);
    void loadTabJson<UagResponse>(wideUagUrl)
      .then((d) => {
        if (cancelled || !d) return;
        setWideData(d);
      })
      .finally(() => {
        if (!cancelled) setWidePoolLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionReady, wideUagUrl]);

  const ensureWidePool = () => {
    if (wideData || widePoolLoading) return;
    setWidePoolLoading(true);
    void loadTabJson<UagResponse>(wideUagUrl)
      .then((d) => {
        if (!d) return;
        setWideData(d);
      })
      .finally(() => setWidePoolLoading(false));
  };

  const showCriteriaStepFeedback = (
    key: CriteriaStepKey,
    text: string,
  ) => {
    setCriteriaStepFeedback({ key, text });
    if (criteriaFeedbackTimerRef.current != null) {
      clearTimeout(criteriaFeedbackTimerRef.current);
    }
    criteriaFeedbackTimerRef.current = setTimeout(() => {
      criteriaFeedbackTimerRef.current = null;
      setCriteriaStepFeedback(null);
    }, CRITERIA_STEP_FEEDBACK_MS);
  };

  const pool = wideData ?? data;
  const criteria = data?.criteria ?? wideData?.criteria ?? null;
  const missing = pool?.missingCriteria ?? data?.missingCriteria ?? [];

  const handleSessionMatchChange = (
    next: SessionMatchOverrides,
    source?: { key: CriteriaStepKey },
  ) => {
    const needsWide =
      Boolean(baselineMatch) &&
      sessionOverridesNeedWidePool(next, baselineMatch!);
    const waitingWide = needsWide && !wideData;
    if (needsWide) ensureWidePool();

    if (source && criteria) {
      const salePool = pool?.sale ?? [];
      const rentalPool = pool?.rental ?? [];
      const prevSale = sessionMatch
        ? salePool.filter((row) =>
            comparableListingMatchesSession(row, criteria, sessionMatch),
          ).length
        : salePool.length;
      const prevRental = sessionMatch
        ? rentalPool.filter((row) =>
            comparableListingMatchesSession(row, criteria, sessionMatch),
          ).length
        : rentalPool.length;
      const nextSale = salePool.filter((row) =>
        comparableListingMatchesSession(row, criteria, next),
      ).length;
      const nextRental = rentalPool.filter((row) =>
        comparableListingMatchesSession(row, criteria, next),
      ).length;
      showCriteriaStepFeedback(
        source.key,
        criteriaStepMatchNote({
          prevSale,
          prevRental,
          nextSale,
          nextRental,
          waitingWide,
        }),
      );
      pendingWideFeedbackKeyRef.current = waitingWide ? source.key : null;
    }

    setSessionMatch(next);
  };

  useEffect(() => {
    const key = pendingWideFeedbackKeyRef.current;
    if (!key || !wideData || !criteria || !sessionMatch) return;
    pendingWideFeedbackKeyRef.current = null;
    const nextSale = (wideData.sale ?? []).filter((row) =>
      comparableListingMatchesSession(row, criteria, sessionMatch),
    ).length;
    const nextRental = (wideData.rental ?? []).filter((row) =>
      comparableListingMatchesSession(row, criteria, sessionMatch),
    ).length;
    const total = nextSale + nextRental;
    showCriteriaStepFeedback(
      key,
      total === 0
        ? `Nothing matched · ${nextSale} sale · ${nextRental} rental`
        : `Found ${total} · ${nextSale} sale · ${nextRental} rental`,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when wide pool lands
  }, [wideData]);

  const sale = useMemo(() => {
    const rows = pool?.sale ?? [];
    if (!criteria || !sessionMatch) return rows;
    return rows.filter((row) =>
      comparableListingMatchesSession(row, criteria, sessionMatch),
    );
  }, [pool?.sale, criteria, sessionMatch]);

  const rental = useMemo(() => {
    const rows = pool?.rental ?? [];
    if (!criteria || !sessionMatch) return rows;
    return rows.filter((row) =>
      comparableListingMatchesSession(row, criteria, sessionMatch),
    );
  }, [pool?.rental, criteria, sessionMatch]);

  const showCriteria = Boolean(criteria && sessionMatch) && !loading;

  const criteriaBlock =
    showCriteria && criteria && sessionMatch ? (
      <div className="font-mono text-[10px] tracking-[0.12em] uppercase text-white/40">
        <MatchingCriteriaSummary
          criteria={criteria}
          session={sessionMatch}
          onSessionChange={handleSessionMatchChange}
          stepFeedback={criteriaStepFeedback}
          defaultControlsOpen
        />
        {widePoolLoading && !wideData ? (
          <span className="mt-1 block font-mono text-[9px] tracking-[0.12em] uppercase text-white/35">
            loading wider match pool…
          </span>
        ) : null}
      </div>
    ) : null;

  const mainColumn = (
    <>
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
            subjectBeds={criteria?.beds ?? null}
            subjectBaths={criteria?.baths ?? null}
            foundCountEmphasized={Boolean(criteriaStepFeedback)}
            criteriaLinkSlotId={
              showCriteria
                ? listingCriteriaLinkSlotId(LISTING_SECTION_IDS.uag)
                : null
            }
          />
          <UagColumn
            label="Rentals · Under agreement"
            emptyLabel="No under-agreement rentals found yet."
            comps={rental}
            town={town}
            isRental
            subjectBeds={criteria?.beds ?? null}
            subjectBaths={criteria?.baths ?? null}
            foundCountEmphasized={Boolean(criteriaStepFeedback)}
          />
        </div>
      )}
    </>
  );

  return (
    <div className="w-full min-w-0 space-y-6">
      {!suppressPageChrome ? (
        <>
          <div className="mb-1 flex items-center justify-between gap-3 max-lg:px-3 lg:px-0">
            <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-gold">
              Under Agreement
            </p>
          </div>
          <p className="text-white/50 text-sm max-lg:px-3 lg:px-0">
            Homes currently under contract (Under Contract and Under Contract –
            Continue to Show), matched with the same thresholds as Comparables:
            same zip, beds within ±1, baths within ±1, living area within ±30%,
            similar vintage (same era, plus the bordering era near a vintage edge),
            and lot size when available — pulled live from the MLS.
          </p>
        </>
      ) : null}

      {showCriteria ? (
        <ListingCriteriaSideLayout
          criteria={criteriaBlock}
          heading="Under agreement criteria"
          linkSlotId={listingCriteriaLinkSlotId(LISTING_SECTION_IDS.uag)}
        >
          {mainColumn}
        </ListingCriteriaSideLayout>
      ) : (
        mainColumn
      )}
    </div>
  );
}
