"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { useSiteUnlocked } from "@/components/SiteUnlockProvider";
import {
  ArrowLeftRightIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  MailIcon,
} from "@/components/icons";
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
  emptyMidpointAggregates,
  ensureMidpointAggregates,
  fmtIfRentMoney,
  fmtIfSaleMoney,
  IF_DEFAULT_MIDPOINT_METHOD,
  IF_MIDPOINT_METHOD_LABELS,
  IF_MIDPOINT_METHODS,
  ifCompWeightExplainLines,
  roundIfRentHigh,
  roundIfRentLow,
  roundIfRentMidpoint,
  scenarioWithMidpointMethod,
  type IfCompRow,
  type IfEstimate,
  type IfMatchParams,
  type IfMidpointMethod,
  type IfScenario,
  type ListingIfPayload,
} from "@/lib/listing-if-estimates";
import {
  fmtAcres,
  fmtSqft,
  type ComparablesCriteria,
} from "@/lib/listing-comparables-shared";
import { renderCompBedBathMeta } from "@/components/listing/CompExactMatchMeta";
import {
  comparableListingMatchesSession,
  sessionMatchOverridesEqual,
  type SessionMatchOverrides,
} from "@/lib/listing-comparables-session";
import CriteriaMatchPreviewList, {
  criteriaPreviewRowFromIfComp,
} from "@/components/listing/CriteriaMatchPreviewList";
import { listingDetailHref } from "@/lib/listing-url";
import {
  loadTabJson,
  loadTabJsonWithRetry,
  peekTabJson,
} from "@/lib/tab-data-prefetch";
import {
  filterPillIndependentButtonClass,
  filterPillIndependentContainerClass,
} from "@/lib/filter-pill-styles";
import {
  classifyInventoryMarketBand,
  DEFAULT_INVENTORY_SEGMENT_BANDS,
  type InventorySegmentBandsConfig,
} from "@/lib/inventory-segment-bands-shared";

const CRITERIA_STEP_FEEDBACK_MS = 10_000;

function sessionFromIfParams(params: IfMatchParams): SessionMatchOverrides {
  const labels = [
    ...(params.vintageLabel ? [params.vintageLabel] : []),
    ...params.vintageEdgeLabels,
  ].filter(Boolean);
  const allowedVintageLabels = [...new Set(labels)];
  return {
    bedTolerance: params.bedTolerance,
    bathTolerance: params.bathTolerance,
    sqftTolerancePct: params.sqftTolerancePct,
    allowedVintageLabels:
      allowedVintageLabels.length > 0
        ? allowedVintageLabels
        : params.vintageLabel
          ? [params.vintageLabel]
          : [],
    allowedZips: params.zip ? [params.zip] : [],
    ...(params.furnished ? { furnishedScope: "exact" as const } : {}),
  };
}

function ifCompMatchesSession(
  comp: IfCompRow,
  criteria: ComparablesCriteria,
  session: SessionMatchOverrides,
): boolean {
  return comparableListingMatchesSession(
    {
      mlsId: comp.mlsId,
      listingKey: comp.listingKey,
      address: comp.address,
      city: comp.city,
      zip: comp.zip,
      price: comp.price,
      closePrice: comp.role === "sold" ? comp.price : null,
      closeDate: comp.closeDate,
      beds: comp.beds,
      baths: comp.baths,
      lotAcres: comp.lotAcres,
      sqft: comp.sqft,
      vintageBucket: "unknown",
      vintageLabel: comp.vintageLabel,
      yearBuilt: null,
      furnished: comp.furnished ?? null,
      pricePerSqft: comp.pricePerSqft,
      dom: null,
      photoCount: null,
      latitude: null,
      longitude: null,
      locationPremiumMultiplier: 1,
    },
    criteria,
    session,
  );
}

function criteriaStepMatchNote(opts: {
  prevSale: number;
  prevRent: number;
  nextSale: number;
  nextRent: number;
}): string {
  const prevTotal = opts.prevSale + opts.prevRent;
  const nextTotal = opts.nextSale + opts.nextRent;
  const delta = nextTotal - prevTotal;
  const counts = `${opts.nextSale} sale · ${opts.nextRent} rent`;
  if (nextTotal === 0) return `Nothing matched · ${counts}`;
  if (delta > 0) return `Found ${delta} more · ${counts}`;
  if (delta < 0) return `${Math.abs(delta)} fewer · ${counts}`;
  return `No change · ${counts}`;
}

type IfCompSortKey = "price" | "closeDate";
type SortDir = "asc" | "desc";

function defaultIfCompSortDir(key: IfCompSortKey): SortDir {
  return key === "price" ? "asc" : "desc";
}

function parseCloseDateMs(closeDate: string | null | undefined): number {
  if (!closeDate) return 0;
  const ms = Date.parse(closeDate);
  return Number.isNaN(ms) ? 0 : ms;
}

function sortIfComps(
  comps: IfCompRow[],
  sortKey: IfCompSortKey,
  dir: SortDir,
): IfCompRow[] {
  const copy = [...comps];
  const sign = dir === "asc" ? 1 : -1;
  if (sortKey === "closeDate") {
    return copy.sort((a, b) => {
      const aMs = parseCloseDateMs(a.closeDate);
      const bMs = parseCloseDateMs(b.closeDate);
      // Undated (active) comps stay after dated ones in either direction.
      if (aMs === 0 && bMs === 0) return 0;
      if (aMs === 0) return 1;
      if (bMs === 0) return -1;
      return sign * (aMs - bMs);
    });
  }
  const nullSentinel =
    dir === "asc" ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
  return copy.sort((a, b) => {
    const pa = a.price != null && a.price > 0 ? a.price : nullSentinel;
    const pb = b.price != null && b.price > 0 ? b.price : nullSentinel;
    return sign * (pa - pb);
  });
}

/**
 * When Math TOP/GREEN or BOTTOM/RED rows are shown: closed price DESC for top,
 * ASC for bottom. In-band stays between them (price ASC).
 */
function sortIfCompsWithBandPrice(
  comps: IfCompRow[],
  amountLow: number | null | undefined,
  amountHigh: number | null | undefined,
  showTopBand: boolean,
  showBottomBand: boolean,
): IfCompRow[] {
  if (!showTopBand && !showBottomBand) {
    return sortIfComps(comps, "price", "asc");
  }
  if (showTopBand && !showBottomBand) {
    return sortIfComps(comps, "price", "desc");
  }
  if (showBottomBand && !showTopBand) {
    return sortIfComps(comps, "price", "asc");
  }
  const top: IfCompRow[] = [];
  const mid: IfCompRow[] = [];
  const bottom: IfCompRow[] = [];
  for (const comp of comps) {
    const band = compQuarterBand(
      comp.impliedSubjectAmount,
      amountLow,
      amountHigh,
    );
    if (band === "top") top.push(comp);
    else if (band === "bottom") bottom.push(comp);
    else mid.push(comp);
  }
  return [
    ...sortIfComps(top, "price", "desc"),
    ...sortIfComps(mid, "price", "asc"),
    ...sortIfComps(bottom, "price", "asc"),
  ];
}

type IfMarketBandDisplay = {
  /** Admin Market Band category, e.g. Mid-market */
  name: string;
  /** Fine step / price range within the band, e.g. $1.75M–$2.249M */
  range: string | null;
};

function IfMarketBandBadge({ band }: { band: IfMarketBandDisplay }) {
  return (
    <span className="flex shrink-0 flex-col items-end leading-tight text-right">
      <span className="font-mono text-[8px] sm:text-[9px] tracking-[0.12em] uppercase text-white/55">
        {band.name}
      </span>
      {band.range ? (
        <span className="font-mono text-[8px] sm:text-[9px] tracking-[0.08em] uppercase text-white/40 tabular-nums">
          {band.range}
        </span>
      ) : null}
    </span>
  );
}

/** Outer starts large / mid small; swap sizes 3×; end with mid larger than outer. */
const IF_RANGE_SIZE_SWAPS = 3;
const IF_RANGE_SIZE_SWAP_MS = 520;

function IfEstimateRangeDisplay({
  low,
  high,
  midpoint = null,
  formatAmount,
  suffix = "",
  underHigh = null,
}: {
  low: number | null;
  high: number | null;
  midpoint?: number | null;
  formatAmount: (value: number) => string;
  suffix?: string;
  /** Centered under the high (upper) amount — e.g. Math link. */
  underHigh?: ReactNode;
}) {
  const resolvedLow = low ?? (high == null ? midpoint : null);
  const resolvedHigh = high ?? (low == null ? midpoint : null);
  const resolvedMid =
    midpoint != null && Number.isFinite(midpoint) ? midpoint : null;

  // false = outer large / mid small; true = mid large / outer small (final after 3 swaps).
  const [midIsLarge, setMidIsLarge] = useState(false);

  useEffect(() => {
    if (
      resolvedLow == null ||
      resolvedHigh == null ||
      resolvedLow === resolvedHigh ||
      resolvedMid == null
    ) {
      return;
    }
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setMidIsLarge(true);
      return;
    }

    setMidIsLarge(false);
    let swaps = 0;
    const id = window.setInterval(() => {
      swaps += 1;
      setMidIsLarge((v) => !v);
      if (swaps >= IF_RANGE_SIZE_SWAPS) {
        window.clearInterval(id);
      }
    }, IF_RANGE_SIZE_SWAP_MS);
    return () => window.clearInterval(id);
  }, [resolvedLow, resolvedHigh, resolvedMid]);

  if (
    resolvedLow != null &&
    resolvedHigh != null &&
    resolvedLow !== resolvedHigh
  ) {
    const lowLabel = `${formatAmount(resolvedLow)}${suffix}`;
    const highLabel = `${formatAmount(resolvedHigh)}${suffix}`;
    const midLabel =
      resolvedMid != null ? `${formatAmount(resolvedMid)}${suffix}` : null;
    const aria =
      midLabel != null
        ? `Between ${lowLabel}, midpoint ${midLabel}, and ${highLabel}`
        : `Between ${lowLabel} and ${highLabel}`;

    const outerSize = midIsLarge
      ? "text-[0.75rem] sm:text-[0.9375rem]"
      : "text-2xl sm:text-3xl";
    const midSize = midIsLarge
      ? "text-2xl sm:text-3xl"
      : "text-[0.75rem] sm:text-[0.9375rem]";
    const sizeTransition =
      "transition-[font-size,line-height,margin] duration-500 ease-in-out";

    return (
      <div
        className="flex w-full flex-wrap items-start justify-end gap-x-2 gap-y-1 sm:gap-x-2.5"
        aria-label={aria}
      >
        <span
          className={`font-serif text-white tabular-nums leading-snug ${outerSize} ${sizeTransition}`}
        >
          {lowLabel}
        </span>
        <ArrowLeftRightIcon className="mt-1.5 h-5 w-5 shrink-0 text-gold/90 sm:mt-2" />
        {midLabel != null ? (
          <>
            <span
              className={`mt-1.5 font-serif text-gold tabular-nums leading-snug sm:mt-2 ${midSize} ${sizeTransition}`}
            >
              {midLabel}
            </span>
            <ArrowLeftRightIcon className="mt-1.5 h-5 w-5 shrink-0 text-gold/90 sm:mt-2" />
          </>
        ) : null}
        <div className="inline-flex flex-col items-center gap-1">
          <span
            className={`font-serif text-white tabular-nums leading-snug ${outerSize} ${sizeTransition}`}
          >
            {highLabel}
          </span>
          {underHigh}
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
    <div className="flex w-full flex-wrap items-start justify-end gap-x-3 gap-y-1">
      <div className="inline-flex flex-col items-center gap-1">
        <p className="font-serif text-2xl sm:text-3xl text-white tabular-nums leading-snug">
          {single}
        </p>
        {underHigh}
      </div>
    </div>
  );
}

function emptyScenario(): IfScenario {
  return {
    amount: null,
    amountLow: null,
    amountHigh: null,
    soldCount: 0,
    activeCount: 0,
    params: {
      kind: "sale",
      zip: null,
      beds: null,
      baths: null,
      lotAcres: null,
      sqft: null,
      bedTolerance: 1,
      bathTolerance: 1,
      sqftTolerancePct: 30,
      vintageLabel: null,
      vintageEdgeLabels: [],
      vintageEdgeFraction: 0.3,
      lookbackMonths: 12,
      lookbackLabel: "1 yr",
    },
    math: {
      method: "none",
      soldPpsfWeight: 0.55,
      activePpsfWeight: 0.45,
      blendedPpsf: null,
      midpointMethod: IF_DEFAULT_MIDPOINT_METHOD,
      subjectSqft: null,
      rangeLowPercentile: 0.25,
      rangeHighPercentile: 0.75,
      matchedSoldCount: 0,
      matchedActiveCount: 0,
    },
    comps: [],
    midpointAggregates: emptyMidpointAggregates(),
  };
}

/** Build the Sales/Rentals-style criteria object from What if match params. */
function criteriaFromIfParams(
  params: IfMatchParams,
): ComparablesCriteria | null {
  if (params.zip == null || params.beds == null || params.baths == null) {
    return null;
  }
  return {
    zip: params.zip,
    beds: params.beds,
    baths: params.baths,
    lotAcres: null,
    sqft: params.sqft,
    vintageBucket: "unknown",
    vintageLabel: params.vintageLabel ?? "",
    ...(params.vintageEdgeLabels.length > 0
      ? { vintageEdgeLabels: params.vintageEdgeLabels }
      : {}),
    ...(params.furnished ? { furnished: params.furnished } : {}),
  };
}

/** Whole-dollar $/sqft, e.g. `$465/sqft` (sale). */
function fmtPpsfWhole(value: number): string {
  return `$${Math.round(value).toLocaleString("en-US")}/sqft`;
}

/** Cents $/sqft for rent, e.g. `$2.10/sqft`. */
function fmtPpsfCents(value: number): string {
  return `$${value.toFixed(2)}/sqft`;
}

function compCountPhrase(
  soldCount: number,
  activeCount: number,
  soldWord: string,
): string {
  return `${soldCount} ${soldWord} + ${activeCount} active comps`;
}

/**
 * Preferred multi-line worksheet:
 *   MATH: MEDIAN | AVERAGE | WEIGHTED AVG
 *   $599/sqft          ← click to expand derivation
 *   × 3,069 sqft
 *   ─────────
 *   $1.8M
 */
function IfMathBandKeyword({
  label,
  band,
  active,
  onToggle,
}: {
  label: string;
  band: "top" | "bottom";
  active: boolean;
  onToggle: () => void;
}) {
  const color =
    band === "top"
      ? active
        ? "text-sage underline decoration-sage/70"
        : "text-sage/80 underline decoration-sage/40 hover:text-sage"
      : active
        ? "text-coral underline decoration-coral/70"
        : "text-coral/80 underline decoration-coral/40 hover:text-coral";
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      title={
        band === "top"
          ? active
            ? "Hide top-quarter (green) comps"
            : "Show top-quarter (green) comps"
          : active
            ? "Hide bottom-quarter (red) comps"
            : "Show bottom-quarter (red) comps"
      }
      className={`${color} underline-offset-2 transition-colors cursor-pointer ${
        active ? "font-semibold" : ""
      }`}
    >
      {label}
    </button>
  );
}

/** Math link (+ midpoint methods when open) — centered under the range high. */
function IfMathLinkBar({
  kind,
  mathOpen,
  onToggle,
  midpointMethod,
  onMidpointMethodChange,
}: {
  kind: "sale" | "rent";
  mathOpen: boolean;
  onToggle: () => void;
  midpointMethod: IfMidpointMethod;
  onMidpointMethodChange: (method: IfMidpointMethod) => void;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        onClick={onToggle}
        className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.12em] text-white/50 transition-colors hover:text-gold"
        aria-expanded={mathOpen}
        aria-controls={`what-if-math-detail-${kind}`}
        title={mathOpen ? "Minimize math" : "Expand math"}
      >
        <span className="underline decoration-white/25 underline-offset-2">
          Math
        </span>
        {mathOpen ? (
          <ChevronLeftIcon className="h-3 w-3 text-gold" />
        ) : (
          <ChevronRightIcon className="h-3 w-3 text-gold" />
        )}
      </button>
      {mathOpen ? (
        <div
          role="group"
          aria-label="Midpoint $/sqft method"
          className="inline-flex flex-wrap justify-center gap-1"
        >
          {IF_MIDPOINT_METHODS.map((method) => {
            const active = midpointMethod === method;
            return (
              <button
                key={method}
                type="button"
                onClick={() => onMidpointMethodChange(method)}
                className={
                  active
                    ? "rounded px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-navy bg-gold"
                    : "rounded px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-white/45 hover:text-gold border border-white/15"
                }
                aria-pressed={active}
              >
                {IF_MIDPOINT_METHOD_LABELS[method]}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function IfMathWorksheet({
  est,
  sqft,
  kind,
  midpointMethod,
  onMidpointMethodChange,
  showTopBand,
  showBottomBand,
  onToggleTopBand,
  onToggleBottomBand,
  mathOpen,
}: {
  est: IfEstimate;
  sqft: number | null;
  kind: "sale" | "rent";
  midpointMethod: IfMidpointMethod;
  onMidpointMethodChange: (method: IfMidpointMethod) => void;
  showTopBand: boolean;
  showBottomBand: boolean;
  onToggleTopBand: () => void;
  onToggleBottomBand: () => void;
  mathOpen: boolean;
}) {
  const [showPpsf, setShowPpsf] = useState(false);

  if (
    !mathOpen ||
    est.amount == null ||
    est.amountLow == null ||
    est.amountHigh == null
  ) {
    return null;
  }

  const isRent = kind === "rent";
  const soldWord = isRent ? "rented" : "sold";
  const comps = compCountPhrase(est.soldCount, est.activeCount, soldWord);
  const methodLabel = IF_MIDPOINT_METHOD_LABELS[midpointMethod].toLowerCase();

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

  const methodExplain =
    midpointMethod === "weightedAverage"
      ? `${ppsfLabel ?? "This midpoint"} is the weight-adjusted average $/sqft of the matched comps — closed ${isRent ? "leases" : "sales"} count more than active ${isRent ? "rentals" : "listings"}, and same-vintage, same location-tier comps pull harder (see wt).`
      : midpointMethod === "average"
        ? `${ppsfLabel ?? "This midpoint"} is the simple average $/sqft of the matched comps — each comp counts equally; closed ${isRent ? "leases" : "sales"} still blend heavier than actives in the market mix.`
        : `${ppsfLabel ?? "This midpoint"} is the median $/sqft of the matched comps — the middle value after sorting, so outliers move it less than an average would.`;

  return (
    <div
      id={`what-if-math-detail-${kind}`}
      className="font-mono text-[10px] text-white/40 tabular-nums leading-relaxed"
    >
      {/*
        Shared mobile + desktop: two invisible columns
        (description | equation) — same grid, no breakpoint swap.
      */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4">
        <div className="min-w-0 normal-case tracking-normal text-left space-y-3">
          <p className="m-0">
            25th–75th percentile excluded i.e.{" "}
            <IfMathBandKeyword
              label="TOP"
              band="top"
              active={showTopBand}
              onToggle={onToggleTopBand}
            />{" "}
            and{" "}
            <IfMathBandKeyword
              label="BOTTOM"
              band="bottom"
              active={showBottomBand}
              onToggle={onToggleBottomBand}
            />{" "}
            quarter of the market with a{" "}
            <IfMathBandKeyword
              label="GREEN"
              band="top"
              active={showTopBand}
              onToggle={onToggleTopBand}
            />{" "}
            or{" "}
            <IfMathBandKeyword
              label="RED"
              band="bottom"
              active={showBottomBand}
              onToggle={onToggleBottomBand}
            />{" "}
            row tint
          </p>
          <div className="whitespace-pre-wrap">
            <p className="m-0">
              Based on the following comps
              {"\n"}
              {"\t"}
              {est.soldCount} {soldWord}
              {"\n"}
              {"\t"}
              {est.activeCount} active
            </p>
          </div>
          {lowPpsf && highPpsf ? (
            <p className="m-0">
              Range {lowPpsf}–{highPpsf}
            </p>
          ) : null}
        </div>

        <div className="justify-self-end">
          {hasSqft && ppsfLabel ? (
            <div className="w-fit text-right">
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
            <div className="w-fit text-right text-white/60">
              {midLabel}{" "}
              <span className="text-white/30">
                ({methodLabel} of {comps})
              </span>
            </div>
          )}
        </div>
      </div>

      {showPpsf && ppsfLabel ? (
        <p className="mt-3 normal-case tracking-normal text-white/45 text-left">
          {methodExplain}
          {lowPpsf && highPpsf
            ? ` Those ${soldWord} comps range ${lowPpsf}–${highPpsf}.`
            : ""}
        </p>
      ) : null}
    </div>
  );
}

/** Quarter band from the If range (25th–75th): top = above high, bottom = below low. */
function compQuarterBand(
  implied: number | null | undefined,
  amountLow: number | null | undefined,
  amountHigh: number | null | undefined,
): "top" | "bottom" | null {
  if (
    implied == null ||
    amountLow == null ||
    amountHigh == null ||
    !Number.isFinite(implied)
  ) {
    return null;
  }
  if (implied > amountHigh) return "top";
  if (implied < amountLow) return "bottom";
  return null;
}

function CompList({
  comps,
  kind,
  townHint,
  amountLow,
  amountHigh,
  subjectBeds = null,
  subjectBaths = null,
  foundCountEmphasized = false,
  showTopBand = false,
  showBottomBand = false,
}: {
  comps: IfCompRow[];
  kind: "sale" | "rent";
  townHint?: string | null;
  amountLow?: number | null;
  amountHigh?: number | null;
  subjectBeds?: number | null;
  subjectBaths?: number | null;
  foundCountEmphasized?: boolean;
  /** When false (default), hide green / above-high comps. */
  showTopBand?: boolean;
  /** When false (default), hide red / below-low comps. */
  showBottomBand?: boolean;
}) {
  const [sort, setSort] = useState<{ key: IfCompSortKey; dir: SortDir }>({
    key: "price",
    dir: "asc",
  });
  const [showWtExplain, setShowWtExplain] = useState(false);
  const bandSortActive = showTopBand || showBottomBand;

  // TOP/GREEN → closed price DESC; BOTTOM/RED → closed price ASC.
  useEffect(() => {
    if (showTopBand && !showBottomBand) {
      setSort({ key: "price", dir: "desc" });
    } else if (showBottomBand && !showTopBand) {
      setSort({ key: "price", dir: "asc" });
    } else if (showTopBand && showBottomBand) {
      setSort({ key: "price", dir: "desc" });
    }
  }, [showTopBand, showBottomBand]);

  const visibleComps = useMemo(
    () =>
      comps.filter((comp) => {
        const quarter = compQuarterBand(
          comp.impliedSubjectAmount,
          amountLow,
          amountHigh,
        );
        if (quarter === "top") return showTopBand;
        if (quarter === "bottom") return showBottomBand;
        return true;
      }),
    [comps, amountLow, amountHigh, showTopBand, showBottomBand],
  );
  const sorted = useMemo(
    () =>
      bandSortActive
        ? sortIfCompsWithBandPrice(
            visibleComps,
            amountLow,
            amountHigh,
            showTopBand,
            showBottomBand,
          )
        : sortIfComps(visibleComps, sort.key, sort.dir),
    [
      visibleComps,
      sort.key,
      sort.dir,
      bandSortActive,
      amountLow,
      amountHigh,
      showTopBand,
      showBottomBand,
    ],
  );

  if (comps.length === 0) return null;
  const isRent = kind === "rent";
  const totalCount = comps.length;
  const visibleCount = visibleComps.length;
  const propertiesUsedLabel =
    visibleCount < totalCount
      ? `Properties used (${visibleCount}/${totalCount})`
      : `Properties used (${totalCount})`;
  const wtLinkClass =
    "text-gold underline decoration-gold/50 underline-offset-2 hover:text-gold-light transition-colors cursor-pointer";

  const handleSort = (key: IfCompSortKey) => {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: defaultIfCompSortDir(key) },
    );
  };

  return (
    <div>
      <div className="mb-2 flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p
          className={`inline-block origin-left font-mono text-[10px] tracking-[0.14em] uppercase text-white/50 transition-transform duration-300 ease-out ${
            foundCountEmphasized ? "scale-150" : "scale-100"
          }`}
        >
          {propertiesUsedLabel}
        </p>
        <div
          className="ml-auto flex flex-wrap items-center justify-end gap-x-3 gap-y-1"
          role="group"
          aria-label="Sort properties"
        >
          {(
            [
              { key: "price" as const, label: "Price" },
              { key: "closeDate" as const, label: "Closed" },
            ] as const
          ).map((option) => {
            const active = sort.key === option.key;
            return (
              <button
                key={option.key}
                type="button"
                onClick={() => handleSort(option.key)}
                className={`inline-flex items-center gap-0.5 font-mono text-[10px] tracking-[0.12em] uppercase transition-colors underline underline-offset-2 ${
                  active
                    ? "text-white/80 decoration-gold/50 hover:text-gold"
                    : "text-white/35 decoration-white/20 hover:text-gold hover:decoration-gold/50"
                }`}
                aria-sort={
                  active
                    ? sort.dir === "asc"
                      ? "ascending"
                      : "descending"
                    : "none"
                }
              >
                {option.label}
                {active ? (
                  <span className="text-gold" aria-hidden>
                    {sort.dir === "asc" ? "↑" : "↓"}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {showWtExplain ? (
        <div className="mb-3 space-y-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5">
          <div className="flex items-start justify-between gap-3">
            <p className="font-mono text-[10px] tracking-[0.14em] uppercase text-gold">
              How wt is calculated
            </p>
            <button
              type="button"
              onClick={() => setShowWtExplain(false)}
              className="shrink-0 font-mono text-lg leading-none text-white/45 transition-colors hover:text-white"
              aria-label="Close weight explanation"
            >
              ×
            </button>
          </div>
          {ifCompWeightExplainLines().map((line) => (
            <p
              key={line.slice(0, 48)}
              className="text-[11px] leading-relaxed text-white/55 normal-case tracking-normal"
            >
              {line}
            </p>
          ))}
        </div>
      ) : null}

      <ul className="divide-y divide-white/[0.06] border-t border-white/10">
        {sorted.map((comp) => {
          const id = comp.listingKey || comp.mlsId;
          const href = listingDetailHref(
            id,
            comp.address,
            townHint || comp.city,
          );
          const quarter = compQuarterBand(
            comp.impliedSubjectAmount,
            amountLow,
            amountHigh,
          );
          const quarterPriceClass =
            quarter === "top"
              ? "text-sage"
              : quarter === "bottom"
                ? "text-coral"
                : null;
          const priceLabel =
            comp.price != null
              ? `${fmtMoney(comp.price)}${isRent ? "/mo" : ""}`
              : "—";
          const implied =
            comp.impliedSubjectAmount != null
              ? isRent
                ? `${fmtIfRentMoney(comp.impliedSubjectAmount)}/mo`
                : fmtIfSaleMoney(comp.impliedSubjectAmount)
              : null;
          const bedBath = renderCompBedBathMeta({
            beds: comp.beds,
            baths: comp.baths,
            subjectBeds,
            subjectBaths,
          });
          const sizeParts = [fmtSqft(comp.sqft), fmtAcres(comp.lotAcres)].filter(
            (part) => part !== "—",
          );

          const rowTintClass =
            quarter === "top"
              ? "bg-sage/15 border-l-2 border-sage/70"
              : quarter === "bottom"
                ? "bg-coral/15 border-l-2 border-coral/70"
                : "";

          return (
            <li
              key={`${comp.role}-${id}`}
              className={`-mx-2 px-2 py-2.5 flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3 rounded-sm ${rowTintClass}`}
            >
              <div className="min-w-0">
                <Link
                  href={href}
                  className="text-sm text-white/90 hover:text-gold transition-colors font-medium truncate block"
                >
                  {comp.address}
                </Link>
                <p className="font-mono text-[10px] text-white/40 tabular-nums mt-0.5">
                  {comp.role === "sold"
                    ? isRent
                      ? "Rented"
                      : "Sold"
                    : "Listed"}
                  {comp.closeDate ? ` · ${fmtDate(comp.closeDate)}` : ""}
                  {" · "}
                  <span
                    className={quarterPriceClass ?? undefined}
                    title={
                      comp.role === "sold"
                        ? "Final closing price (History)"
                        : "Current list / ask price"
                    }
                  >
                    {priceLabel}
                  </span>
                  {comp.adjustedPricePerSqft != null
                    ? ` · $${
                        isRent
                          ? comp.adjustedPricePerSqft.toFixed(2)
                          : Math.round(comp.adjustedPricePerSqft).toLocaleString(
                              "en-US",
                            )
                      }/sqft`
                    : ""}
                  {bedBath !== "—" ? (
                    <>
                      {" · "}
                      {bedBath}
                    </>
                  ) : null}
                  {sizeParts.length > 0 ? ` · ${sizeParts.join(" · ")}` : null}
                  {" · "}
                  <button
                    type="button"
                    className={wtLinkClass}
                    onClick={() => setShowWtExplain((v) => !v)}
                    aria-expanded={showWtExplain}
                    title="How wt is calculated"
                  >
                    wt {comp.weight.toFixed(2)}
                  </button>
                </p>
              </div>
              {implied ? (
                <p
                  className={`shrink-0 font-mono text-[10px] tabular-nums ${
                    quarterPriceClass ?? "text-white/50"
                  }`}
                >
                  → {implied}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const IF_SCENARIO_PANEL_IDS = {
  sale: "if-you-sell",
  rent: "if-you-rent",
} as const;

/** Compact admin-only send dialog — always emails sell + rent scenarios. */
function IfEmailScenarioDialog({
  mlsId,
  open,
  onClose,
  midpointMethod,
}: {
  mlsId: string;
  open: boolean;
  onClose: () => void;
  /** Same midpoint method currently selected on the What if panels. */
  midpointMethod: IfMidpointMethod;
}) {
  const [to, setTo] = useState("");
  const [signedInEmail, setSignedInEmail] = useState<string | null>(null);
  const [useDifferentAddress, setUseDifferentAddress] = useState(false);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setMessage(null);
    setError(null);
    setUseDifferentAddress(false);
    setSessionChecked(false);
    let cancelled = false;
    void fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => r.json())
      .then(
        (body: {
          authenticated?: boolean;
          user?: { email?: string };
        }) => {
          if (cancelled) return;
          const email = body.authenticated
            ? body.user?.email?.trim() || null
            : null;
          setSignedInEmail(email);
          if (email) setTo(email);
          setSessionChecked(true);
        },
      )
      .catch(() => {
        if (!cancelled) {
          setSignedInEmail(null);
          setSessionChecked(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open) return null;

  const confirmSignedIn =
    Boolean(signedInEmail) && !useDifferentAddress && sessionChecked;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setError(null);
    const recipient = confirmSignedIn
      ? (signedInEmail ?? "").trim()
      : to.trim();
    if (!recipient) {
      setError("Recipient email required.");
      return;
    }
    setSending(true);
    try {
      const res = await fetch(
        `/api/listings/${encodeURIComponent(mlsId)}/if/email`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: recipient,
            kinds: ["sale", "rent"],
            midpointMethod,
          }),
        },
      );
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        bcc?: string | null;
      };
      if (!res.ok) {
        setError(body.error || `Failed to send email (${res.status})`);
        return;
      }
      setMessage(
        body.bcc ? "Sent — a copy went to your notify inbox." : "Sent.",
      );
      if (!confirmSignedIn) setTo("");
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : "Failed to send email",
      );
    } finally {
      setSending(false);
    }
  };

  const toLabelClass =
    "shrink-0 font-mono text-[9px] tracking-[0.12em] uppercase text-white/40";

  return (
    <div className="relative w-full border border-transparent bg-transparent p-1.5 pt-7 lg:p-1 lg:pt-1">
      <button
        type="button"
        onClick={onClose}
        className="absolute right-0 top-0 z-10 flex h-6 w-6 items-center justify-center font-mono text-base leading-none text-white/45 transition-colors hover:text-gold"
        aria-label="Close email scenario"
        title="Close"
      >
        ×
      </button>
      <form
        onSubmit={onSubmit}
        className="flex w-full flex-col gap-1.5 lg:flex-row lg:items-end lg:gap-3 lg:pr-7"
      >
        <div className="min-w-0 flex-1 space-y-1">
          <span
            className="hidden text-gold lg:inline-flex"
            title="Email scenario"
          >
            <MailIcon className="h-3.5 w-3.5" />
            <span className="sr-only">Email scenario</span>
          </span>

          {confirmSignedIn ? (
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className={toLabelClass}>To</span>
              <p className="min-w-0 flex-1 text-sm text-white/85 break-all">
                {signedInEmail}
                <span className="text-white/45"> — confirm?</span>
              </p>
              <button
                type="button"
                onClick={() => {
                  setUseDifferentAddress(true);
                  setTo("");
                }}
                className="font-mono text-[9px] tracking-[0.1em] uppercase text-white/40 underline decoration-white/20 underline-offset-2 hover:text-gold"
              >
                Different address
              </button>
            </div>
          ) : (
            <div className="space-y-1">
              <label className="flex min-w-0 items-center gap-2">
                <span className={toLabelClass}>To</span>
                <input
                  type="email"
                  required
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  placeholder="recipient@example.com"
                  className="min-w-0 flex-1 rounded-md border border-white/15 bg-navy/40 px-2 py-1 text-sm text-white placeholder:text-white/30 focus:border-gold/50 focus:outline-none"
                />
              </label>
              {signedInEmail && useDifferentAddress ? (
                <button
                  type="button"
                  onClick={() => {
                    setUseDifferentAddress(false);
                    setTo(signedInEmail);
                  }}
                  className="font-mono text-[9px] tracking-[0.1em] uppercase text-white/40 underline decoration-white/20 underline-offset-2 hover:text-gold"
                >
                  Use {signedInEmail}
                </button>
              ) : null}
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={sending || !sessionChecked}
          className="shrink-0 rounded-md bg-gold px-2.5 py-1 font-mono text-[9px] tracking-[0.14em] uppercase text-navy disabled:opacity-50"
        >
          {sending
            ? "Sending…"
            : confirmSignedIn
              ? "Confirm send"
              : "Send"}
        </button>
      </form>
      {message ? (
        <p className="mt-1 text-[11px] text-sage">{message}</p>
      ) : null}
      {error ? <p className="mt-1 text-[11px] text-coral">{error}</p> : null}
    </div>
  );
}

function ScenarioPanel({
  title,
  headline,
  scenario,
  comps,
  kind,
  townHint,
  inventorySegmentBands = null,
  foundCountEmphasized = false,
  onEmailClick = null,
  emailOpen = false,
  midpointMethod,
  onMidpointMethodChange,
  className,
}: {
  title: string;
  headline: string;
  scenario: IfScenario;
  comps: IfCompRow[];
  kind: "sale" | "rent";
  townHint?: string | null;
  /** Admin Market Bands config — used for sale midpoint band label only. */
  inventorySegmentBands?: InventorySegmentBandsConfig | null;
  foundCountEmphasized?: boolean;
  /** Mobile: tiny mail icon on this panel. Desktop uses a single page-level link. */
  onEmailClick?: (() => void) | null;
  /** When true, the mail icon toggles the scenario panel closed. */
  emailOpen?: boolean;
  midpointMethod: IfMidpointMethod;
  onMidpointMethodChange: (method: IfMidpointMethod) => void;
  className?: string;
}) {
  const [showTopBand, setShowTopBand] = useState(false);
  const [showBottomBand, setShowBottomBand] = useState(false);
  const [mathOpen, setMathOpen] = useState(false);

  const displayScenario = useMemo(
    () =>
      scenarioWithMidpointMethod(
        ensureMidpointAggregates(scenario),
        midpointMethod,
      ),
    [scenario, midpointMethod],
  );

  const hasEstimate =
    displayScenario.amount != null ||
    displayScenario.soldCount + displayScenario.activeCount > 0 ||
    displayScenario.math.matchedSoldCount +
      displayScenario.math.matchedActiveCount >
      0;

  const panelId = IF_SCENARIO_PANEL_IDS[kind];
  const isRent = kind === "rent";
  const saleMarketBand: IfMarketBandDisplay | null = (() => {
    if (isRent || displayScenario.amount == null) return null;
    const match = classifyInventoryMarketBand(
      displayScenario.amount,
      inventorySegmentBands ?? DEFAULT_INVENTORY_SEGMENT_BANDS,
    );
    if (!match) return null;
    return {
      name: match.segmentLabel,
      range: match.stepLabel,
    };
  })();

  const mathUnderHigh =
    hasEstimate &&
    displayScenario.amount != null &&
    displayScenario.amountLow != null &&
    displayScenario.amountHigh != null ? (
      <IfMathLinkBar
        kind={kind}
        mathOpen={mathOpen}
        onToggle={() => setMathOpen((open) => !open)}
        midpointMethod={midpointMethod}
        onMidpointMethodChange={onMidpointMethodChange}
      />
    ) : null;

  const range = isRent ? (
    <IfEstimateRangeDisplay
      low={
        displayScenario.amountLow != null
          ? roundIfRentLow(displayScenario.amountLow)
          : null
      }
      high={
        displayScenario.amountHigh != null
          ? roundIfRentHigh(displayScenario.amountHigh)
          : null
      }
      midpoint={
        displayScenario.amount != null
          ? roundIfRentMidpoint(displayScenario.amount)
          : null
      }
      formatAmount={fmtIfRentMoney}
      underHigh={mathUnderHigh}
    />
  ) : (
    <IfEstimateRangeDisplay
      low={displayScenario.amountLow}
      high={displayScenario.amountHigh}
      midpoint={displayScenario.amount}
      formatAmount={fmtIfSaleMoney}
      underHigh={mathUnderHigh}
    />
  );

  return (
    <article
      id={panelId}
      className={`scroll-mt-24 rounded-2xl border border-white/10 bg-white/[0.04] max-lg:p-4 max-lg:pt-3 max-lg:gap-4 p-6 sm:p-8 flex flex-col gap-6${
        className ? ` ${className}` : ""
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="hidden lg:block font-mono text-[10px] tracking-[0.2em] uppercase text-gold">
            {title}
          </p>
          <p className="lg:mt-2 text-white/70 text-sm leading-relaxed">
            {headline}
          </p>
        </div>
        <div className="flex shrink-0 items-start gap-2">
          {saleMarketBand ? <IfMarketBandBadge band={saleMarketBand} /> : null}
          {onEmailClick ? (
            <button
              type="button"
              onClick={onEmailClick}
              className={`lg:hidden -mt-0.5 p-0.5 transition-colors ${
                emailOpen
                  ? "text-gold"
                  : "text-white/35 hover:text-gold"
              }`}
              aria-label={
                emailOpen
                  ? "Close email scenario"
                  : `Email ${title} scenario`
              }
              title={emailOpen ? "Close email scenario" : "Email this scenario"}
              aria-expanded={emailOpen}
            >
              <MailIcon className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      </div>

      {!hasEstimate ? (
        <>
          <div>{range}</div>
          <p className="text-white/45 text-xs leading-relaxed">
            Not enough comparable {kind === "sale" ? "sales" : "rentals"} matched
            these parameters to estimate a range yet.
          </p>
        </>
      ) : (
        <>
          <div className="space-y-2">
            {range}
            <IfMathWorksheet
              est={displayScenario}
              sqft={
                displayScenario.math.subjectSqft ?? displayScenario.params.sqft
              }
              kind={kind}
              midpointMethod={midpointMethod}
              onMidpointMethodChange={onMidpointMethodChange}
              showTopBand={showTopBand}
              showBottomBand={showBottomBand}
              onToggleTopBand={() => setShowTopBand((v) => !v)}
              onToggleBottomBand={() => setShowBottomBand((v) => !v)}
              mathOpen={mathOpen}
            />
          </div>
          <CompList
            comps={comps}
            kind={kind}
            townHint={townHint}
            amountLow={displayScenario.amountLow}
            amountHigh={displayScenario.amountHigh}
            subjectBeds={displayScenario.params.beds}
            subjectBaths={displayScenario.params.baths}
            foundCountEmphasized={foundCountEmphasized}
            showTopBand={showTopBand}
            showBottomBand={showBottomBand}
          />
        </>
      )}
    </article>
  );
}

export function ListingIfPageContent({
  mlsId,
  addressHint,
  townHint,
  routeBase = "listing",
  suppressPageChrome = false,
}: {
  mlsId: string;
  addressHint?: string | null;
  townHint?: string | null;
  routeBase?: "listing" | "spotlight";
  suppressPageChrome?: boolean;
}) {
  return (
    <ListingIfPanel
      mlsId={mlsId}
      addressHint={addressHint}
      townHint={townHint}
      routeBase={routeBase}
      variant="page"
      suppressPageChrome={suppressPageChrome}
    />
  );
}

export default function ListingIfPanel({
  mlsId,
  addressHint,
  townHint,
  routeBase: _routeBase = "listing",
  variant = "panel",
  suppressPageChrome = false,
}: {
  mlsId: string;
  addressHint?: string | null;
  townHint?: string | null;
  routeBase?: "listing" | "spotlight";
  variant?: "panel" | "page";
  suppressPageChrome?: boolean;
}) {
  void _routeBase;
  void suppressPageChrome;
  const [data, setData] = useState<ListingIfPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionMatch, setSessionMatch] = useState<SessionMatchOverrides | null>(
    null,
  );
  const [baselineMatch, setBaselineMatch] = useState<SessionMatchOverrides | null>(
    null,
  );
  const [sessionSeeded, setSessionSeeded] = useState(false);
  const [criteriaStepFeedback, setCriteriaStepFeedback] =
    useState<CriteriaStepFeedback | null>(null);
  /** Mobile: which sell/rent scenario tab is active. */
  const [mobileScenarioLead, setMobileScenarioLead] = useState<"sale" | "rent">(
    "sale",
  );
  const siteUnlocked = useSiteUnlocked();
  const [emailOpen, setEmailOpen] = useState(false);
  /** Shared across sell/rent panels and the email dialog (no re-pick in email). */
  const [midpointMethod, setMidpointMethod] = useState<IfMidpointMethod>(
    IF_DEFAULT_MIDPOINT_METHOD,
  );

  const toggleEmailScenario = () => {
    setEmailOpen((open) => !open);
  };
  /** Distinct from desktop — both mounts stay in the DOM; getElementById must not hit the lg-only slot. */
  const mobileIfCriteriaSlotId = `${listingCriteriaLinkSlotId(
    LISTING_SECTION_IDS.if,
  )}-mobile`;
  const criteriaFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const isPage = variant === "page";

  useEffect(() => {
    setSessionMatch(null);
    setBaselineMatch(null);
    setSessionSeeded(false);
    setCriteriaStepFeedback(null);
    setMobileScenarioLead("sale");
    setEmailOpen(false);
    setMidpointMethod(IF_DEFAULT_MIDPOINT_METHOD);
    if (criteriaFeedbackTimerRef.current != null) {
      clearTimeout(criteriaFeedbackTimerRef.current);
      criteriaFeedbackTimerRef.current = null;
    }
  }, [mlsId]);

  useEffect(() => {
    return () => {
      if (criteriaFeedbackTimerRef.current != null) {
        clearTimeout(criteriaFeedbackTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const url = `/api/listings/${encodeURIComponent(mlsId)}/if`;
    const cached = peekTabJson<ListingIfPayload>(url);
    if (cached?.sale?.params) {
      setData(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }

    void loadTabJsonWithRetry<ListingIfPayload>(url, {
      attempts: 3,
      shouldContinue: () => !cancelled,
    })
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

  const saleEstimate = data?.sale?.params ? data.sale : emptyScenario();
  const rentEstimate = data?.rent?.params
    ? data.rent
    : { ...emptyScenario(), params: { ...emptyScenario().params, kind: "rent" as const } };
  const matchCriteria = criteriaFromIfParams(saleEstimate.params);

  useEffect(() => {
    if (!matchCriteria || !saleEstimate.params.zip || sessionSeeded) return;
    const seeded = sessionFromIfParams(saleEstimate.params);
    setBaselineMatch(seeded);
    setSessionMatch(seeded);
    setSessionSeeded(true);
  }, [matchCriteria, saleEstimate.params, sessionSeeded]);

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

  const handleSessionMatchChange = (
    next: SessionMatchOverrides,
    source?: { key: CriteriaStepKey },
  ) => {
    if (source && matchCriteria) {
      const prevSale = sessionMatch
        ? saleEstimate.comps.filter((row) =>
            ifCompMatchesSession(row, matchCriteria, sessionMatch),
          ).length
        : saleEstimate.comps.length;
      const prevRent = sessionMatch
        ? rentEstimate.comps.filter((row) =>
            ifCompMatchesSession(row, matchCriteria, sessionMatch),
          ).length
        : rentEstimate.comps.length;
      const nextSale = saleEstimate.comps.filter((row) =>
        ifCompMatchesSession(row, matchCriteria, next),
      ).length;
      const nextRent = rentEstimate.comps.filter((row) =>
        ifCompMatchesSession(row, matchCriteria, next),
      ).length;
      showCriteriaStepFeedback(
        source.key,
        criteriaStepMatchNote({
          prevSale,
          prevRent,
          nextSale,
          nextRent,
        }),
      );
    }
    setSessionMatch(next);
  };

  const saleComps = useMemo(() => {
    if (!matchCriteria || !sessionMatch) return saleEstimate.comps;
    return saleEstimate.comps.filter((row) =>
      ifCompMatchesSession(row, matchCriteria, sessionMatch),
    );
  }, [saleEstimate.comps, matchCriteria, sessionMatch]);

  const rentComps = useMemo(() => {
    if (!matchCriteria || !sessionMatch) return rentEstimate.comps;
    return rentEstimate.comps.filter((row) =>
      ifCompMatchesSession(row, matchCriteria, sessionMatch),
    );
  }, [rentEstimate.comps, matchCriteria, sessionMatch]);

  const criteriaExpanded = Boolean(
    sessionMatch &&
      baselineMatch &&
      !sessionMatchOverridesEqual(sessionMatch, baselineMatch),
  );

  const criteriaPreviewRows = useMemo(() => {
    if (!criteriaExpanded) return [];
    return [
      ...saleComps.map((comp) =>
        criteriaPreviewRowFromIfComp(comp, {
          isRental: false,
          tag: comp.role === "sold" ? "Sold" : "Listed",
          townHint,
        }),
      ),
      ...rentComps.map((comp) =>
        criteriaPreviewRowFromIfComp(comp, {
          isRental: true,
          tag: comp.role === "sold" ? "Rented" : "Listed",
          townHint,
        }),
      ),
    ];
  }, [criteriaExpanded, saleComps, rentComps, townHint]);

  const foundCountEmphasized = Boolean(criteriaStepFeedback);

  if (loading) {
    return (
      <div
        className={
          isPage
            ? "w-full min-w-0"
            : "rounded-2xl border border-white/10 bg-white/[0.04] p-6"
        }
      >
        {!isPage && (
          <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-gold mb-3">
            If...
          </p>
        )}
        <div className="flex flex-col items-start gap-2">
          <p className="inline-flex items-center gap-2 font-mono text-[11px] tracking-[0.14em] uppercase text-white/55">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-gold animate-pulse-dot" />
            Loading What If estimates…
          </p>
          <p className="max-w-md text-xs leading-relaxed text-white/40">
            First open can take a few seconds while comps resolve.
          </p>
        </div>
      </div>
    );
  }

  const criteriaInSidePanel = isPage && Boolean(matchCriteria && sessionMatch);

  const criteriaBlock =
    matchCriteria && sessionMatch ? (
      <div className="font-mono text-[10px] tracking-[0.12em] uppercase text-white/40">
        <MatchingCriteriaSummary
          criteria={matchCriteria}
          session={sessionMatch}
          onSessionChange={handleSessionMatchChange}
          baseline={baselineMatch}
          onReset={() => {
            if (baselineMatch) setSessionMatch(baselineMatch);
            setCriteriaStepFeedback(null);
          }}
          stepFeedback={criteriaStepFeedback}
          defaultControlsOpen={criteriaInSidePanel}
        />
        <CriteriaMatchPreviewList
          pageLabel="What If"
          rows={criteriaPreviewRows}
          visible={criteriaExpanded}
        />
      </div>
    ) : matchCriteria ? (
      <div className="font-mono text-[10px] tracking-[0.12em] uppercase text-white/40">
        <MatchingCriteriaSummary
          criteria={matchCriteria}
          tolerances={{
            bedTolerance: saleEstimate.params.bedTolerance,
            bathTolerance: saleEstimate.params.bathTolerance,
            sqftTolerancePct: saleEstimate.params.sqftTolerancePct,
          }}
        />
      </div>
    ) : null;

  const desktopIfCriteriaSlotId = listingCriteriaLinkSlotId(
    LISTING_SECTION_IDS.if,
  );

  const mainColumn = (
    <>
      {!criteriaInSidePanel && criteriaBlock ? (
        <div className="text-center space-y-1">{criteriaBlock}</div>
      ) : null}

      {/* Desktop: mail icon left (panel edge) · Criteria right — same row, no "What if" label. */}
      {criteriaInSidePanel || siteUnlocked ? (
        <div className="mb-1 hidden items-start justify-between gap-3 lg:flex lg:px-0">
          {siteUnlocked ? (
            <button
              type="button"
              onClick={() => toggleEmailScenario()}
              className="p-0.5 text-white/35 transition-colors hover:text-gold"
              aria-label={emailOpen ? "Close email scenario" : "Email scenario"}
              title={emailOpen ? "Close email scenario" : "Email scenario"}
              aria-expanded={emailOpen}
            >
              <MailIcon className="h-4 w-4" />
            </button>
          ) : (
            <span aria-hidden className="h-4 w-4" />
          )}
          {criteriaInSidePanel ? (
            <div
              id={desktopIfCriteriaSlotId}
              className="flex min-h-[1em] shrink-0 items-start justify-end"
            />
          ) : null}
        </div>
      ) : null}

      {siteUnlocked && emailOpen ? (
        <div className="w-full max-lg:px-3 lg:px-0">
          <IfEmailScenarioDialog
            mlsId={mlsId}
            open={emailOpen}
            onClose={() => setEmailOpen(false)}
            midpointMethod={midpointMethod}
          />
        </div>
      ) : null}

      {/* Mobile: sell/rent pills left · Criteria right (top-aligned with tabs). */}
      <div className="lg:hidden mb-1 flex items-start justify-between gap-3 max-lg:px-3">
        <div
          role="tablist"
          aria-label="What if scenarios"
          className={`${filterPillIndependentContainerClass("compact")} min-w-0 flex-1`}
        >
          <button
            type="button"
            role="tab"
            aria-selected={mobileScenarioLead === "sale"}
            className={`${filterPillIndependentButtonClass(
              mobileScenarioLead === "sale",
              "compact",
              "dark",
            )} font-mono text-[10px] tracking-[0.12em] uppercase`}
            onClick={() => setMobileScenarioLead("sale")}
          >
            If you sell
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mobileScenarioLead === "rent"}
            className={`${filterPillIndependentButtonClass(
              mobileScenarioLead === "rent",
              "compact",
              "dark",
            )} font-mono text-[10px] tracking-[0.12em] uppercase`}
            onClick={() => setMobileScenarioLead("rent")}
          >
            If you rent
          </button>
        </div>
        {criteriaInSidePanel ? (
          <div
            id={mobileIfCriteriaSlotId}
            className="ml-auto flex shrink-0 items-start justify-end min-h-[1em] pt-0.5"
          />
        ) : null}
      </div>

      <div className="grid gap-1 lg:grid-cols-2 items-start">
        <ScenarioPanel
          title="If you sell"
          headline="Likely sale range if this home went to market today."
          scenario={saleEstimate}
          comps={saleComps}
          kind="sale"
          townHint={townHint}
          foundCountEmphasized={foundCountEmphasized}
          inventorySegmentBands={data?.inventorySegmentBands ?? null}
          midpointMethod={midpointMethod}
          onMidpointMethodChange={setMidpointMethod}
          emailOpen={emailOpen}
          onEmailClick={
            siteUnlocked ? () => toggleEmailScenario() : null
          }
          className={
            mobileScenarioLead === "sale"
              ? "max-lg:block lg:block"
              : "max-lg:hidden lg:block"
          }
        />
        <ScenarioPanel
          title="If you rent"
          headline="Likely monthly rent range if this home were leased today."
          scenario={rentEstimate}
          comps={rentComps}
          kind="rent"
          townHint={townHint}
          foundCountEmphasized={foundCountEmphasized}
          midpointMethod={midpointMethod}
          onMidpointMethodChange={setMidpointMethod}
          emailOpen={emailOpen}
          onEmailClick={
            siteUnlocked ? () => toggleEmailScenario() : null
          }
          className={
            mobileScenarioLead === "rent"
              ? "max-lg:block lg:block"
              : "max-lg:hidden lg:block"
          }
        />
      </div>

      {addressHint ? (
        <p className="font-mono text-[10px] text-white/30 tracking-[0.04em]">
          {addressHint}
          {townHint ? `, ${townHint}` : ""}
        </p>
      ) : null}
    </>
  );

  return (
    <div
      className={
        isPage
          ? "w-full min-w-0 space-y-2"
          : "rounded-2xl border border-white/10 bg-white/[0.04] p-6 space-y-5"
      }
    >
      {criteriaInSidePanel ? (
        <ListingCriteriaSideLayout
          criteria={criteriaBlock}
          heading="What if criteria"
          linkSlotId={desktopIfCriteriaSlotId}
          linkSlotIds={[mobileIfCriteriaSlotId]}
        >
          {mainColumn}
        </ListingCriteriaSideLayout>
      ) : (
        mainColumn
      )}
    </div>
  );
}
