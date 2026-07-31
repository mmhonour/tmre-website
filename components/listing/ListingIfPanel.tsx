"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { ArrowLeftRightIcon } from "@/components/icons";
import ListingCriteriaSideLayout, {
  listingCriteriaLinkSlotId,
  useListingDesktopLayout,
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
      closePrice: null,
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
  const parts: string[] = [];
  if (soldCount > 0) parts.push(`${soldCount} ${soldWord}`);
  if (activeCount > 0) parts.push(`${activeCount} active`);
  if (parts.length === 0) return "matched comps";
  if (parts.length === 1 && soldCount > 0) return `${parts[0]} comps`;
  return `${parts.join(" + ")} comps`;
}

/**
 * Preferred multi-line worksheet:
 *   MATH: MEDIAN | AVERAGE | WEIGHTED AVG
 *   $599/sqft          ← click to expand derivation
 *   × 3,069 sqft
 *   ─────────
 *   $1.8M
 */
function IfMathWorksheet({
  est,
  sqft,
  kind,
  midpointMethod,
  onMidpointMethodChange,
}: {
  est: IfEstimate;
  sqft: number | null;
  kind: "sale" | "rent";
  midpointMethod: IfMidpointMethod;
  onMidpointMethodChange: (method: IfMidpointMethod) => void;
}) {
  const [showPpsf, setShowPpsf] = useState(false);

  if (est.amount == null || est.amountLow == null || est.amountHigh == null) {
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
    <div className="font-mono text-[10px] text-white/40 tabular-nums leading-relaxed">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="uppercase tracking-[0.12em] text-white/50">Math</span>
        <div
          role="group"
          aria-label="Midpoint $/sqft method"
          className="inline-flex flex-wrap gap-1"
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
                    ? "rounded px-1.5 py-0.5 uppercase tracking-[0.1em] text-navy bg-gold"
                    : "rounded px-1.5 py-0.5 uppercase tracking-[0.1em] text-white/45 hover:text-gold border border-white/15"
                }
                aria-pressed={active}
              >
                {IF_MIDPOINT_METHOD_LABELS[method]}
              </button>
            );
          })}
        </div>
      </div>

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
          <span className="text-white/30">
            ({methodLabel} of {comps})
          </span>
        </div>
      )}

      <p className="mt-2 normal-case tracking-normal">
        These are the 25th–75th percentile — in other words we exclude the{" "}
        <span className="text-sage">top quarter</span> and{" "}
        <span className="text-coral">bottom quarter</span> of the market, based
        on {comps}
        {lowPpsf && highPpsf ? ` that range from ${lowPpsf}–${highPpsf}` : ""}
        .
      </p>

      {showPpsf && ppsfLabel ? (
        <p className="mt-1 normal-case tracking-normal text-white/45">
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
}: {
  comps: IfCompRow[];
  kind: "sale" | "rent";
  townHint?: string | null;
  amountLow?: number | null;
  amountHigh?: number | null;
  subjectBeds?: number | null;
  subjectBaths?: number | null;
  foundCountEmphasized?: boolean;
}) {
  const [sort, setSort] = useState<{ key: IfCompSortKey; dir: SortDir }>({
    key: "price",
    dir: "asc",
  });
  const [showWtExplain, setShowWtExplain] = useState(false);
  const sorted = useMemo(
    () => sortIfComps(comps, sort.key, sort.dir),
    [comps, sort.key, sort.dir],
  );

  if (comps.length === 0) return null;
  const isRent = kind === "rent";
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
      <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p
          className={`inline-block origin-left font-mono text-[10px] tracking-[0.14em] uppercase text-white/50 transition-transform duration-300 ease-out ${
            foundCountEmphasized ? "scale-150" : "scale-100"
          }`}
        >
          Properties used ({comps.length})
        </p>
        <div
          className="flex flex-wrap items-center gap-x-3 gap-y-1"
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

          return (
            <li
              key={`${comp.role}-${id}`}
              className="py-2.5 flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3"
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
                    : "Active"}
                  {comp.closeDate ? ` · ${fmtDate(comp.closeDate)}` : ""}
                  {" · "}
                  <span className={quarterPriceClass ?? undefined}>
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

function IfEmailScenarioForm({
  mlsId,
  defaultMethod = IF_DEFAULT_MIDPOINT_METHOD,
}: {
  mlsId: string;
  defaultMethod?: IfMidpointMethod;
}) {
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState("");
  const [includeSale, setIncludeSale] = useState(true);
  const [includeRent, setIncludeRent] = useState(true);
  const [method, setMethod] = useState<IfMidpointMethod>(defaultMethod);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setError(null);
    const kinds: Array<"sale" | "rent"> = [];
    if (includeSale) kinds.push("sale");
    if (includeRent) kinds.push("rent");
    if (kinds.length === 0) {
      setError("Select sale, rent, or both.");
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
            to: to.trim(),
            kinds,
            midpointMethod: method,
          }),
        },
      );
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        bcc?: string | null;
      };
      if (!res.ok) {
        setError(body.error || "Failed to send email");
        return;
      }
      setMessage(
        body.bcc
          ? "Sent — a copy went to your notify inbox."
          : "Sent.",
      );
      setTo("");
    } catch {
      setError("Failed to send email");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] tracking-[0.16em] uppercase text-gold">
            Email scenario
          </p>
          <p className="mt-1 text-xs text-white/45 leading-relaxed">
            Branded summary with ranges, midpoint method, and comps. BCC goes to
            your Admin contact email.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setOpen((v) => !v);
            setMessage(null);
            setError(null);
          }}
          className={`${filterPillIndependentButtonClass(open, "compact", "dark")} font-mono text-[10px] tracking-[0.12em] uppercase shrink-0`}
        >
          {open ? "Close" : "Email"}
        </button>
      </div>

      {open ? (
        <form onSubmit={onSubmit} className="space-y-3">
          <label className="block space-y-1">
            <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-white/40">
              To
            </span>
            <input
              type="email"
              required
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="recipient@example.com"
              className="w-full rounded-md border border-white/15 bg-navy/40 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-gold/50 focus:outline-none"
            />
          </label>

          <div className="flex flex-wrap gap-4 font-mono text-[10px] tracking-[0.12em] uppercase text-white/50">
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={includeSale}
                onChange={(e) => setIncludeSale(e.target.checked)}
                className="accent-gold"
              />
              If you sell
            </label>
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={includeRent}
                onChange={(e) => setIncludeRent(e.target.checked)}
                className="accent-gold"
              />
              If you rent
            </label>
          </div>

          <div
            role="group"
            aria-label="Email midpoint method"
            className="flex flex-wrap gap-1"
          >
            {IF_MIDPOINT_METHODS.map((m) => {
              const active = method === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMethod(m)}
                  className={
                    active
                      ? "rounded px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-navy bg-gold"
                      : "rounded px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-white/45 hover:text-gold border border-white/15"
                  }
                  aria-pressed={active}
                >
                  {IF_MIDPOINT_METHOD_LABELS[m]}
                </button>
              );
            })}
          </div>

          <button
            type="submit"
            disabled={sending}
            className="rounded-md bg-gold px-3 py-2 font-mono text-[10px] tracking-[0.14em] uppercase text-navy disabled:opacity-50"
          >
            {sending ? "Sending…" : "Send email"}
          </button>

          {message ? (
            <p className="text-xs text-sage">{message}</p>
          ) : null}
          {error ? <p className="text-xs text-coral">{error}</p> : null}
        </form>
      ) : null}
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
  amountLabel,
  midpointLabel,
  foundCountEmphasized = false,
  className,
}: {
  title: string;
  headline: string;
  scenario: IfScenario;
  comps: IfCompRow[];
  kind: "sale" | "rent";
  townHint?: string | null;
  amountLabel: string;
  midpointLabel: string;
  foundCountEmphasized?: boolean;
  className?: string;
}) {
  const [midpointMethod, setMidpointMethod] = useState<IfMidpointMethod>(
    scenario.math.midpointMethod ?? IF_DEFAULT_MIDPOINT_METHOD,
  );

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
  const midpoint =
    displayScenario.amount != null
      ? isRent
        ? `${fmtIfRentMoney(roundIfRentMidpoint(displayScenario.amount))}/mo`
        : fmtIfSaleMoney(displayScenario.amount)
      : null;

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
    />
  ) : (
    <IfEstimateRangeDisplay
      low={displayScenario.amountLow}
      high={displayScenario.amountHigh}
      midpoint={displayScenario.amount}
      formatAmount={fmtIfSaleMoney}
    />
  );

  return (
    <article
      id={panelId}
      className={`scroll-mt-24 rounded-2xl border border-white/10 bg-white/[0.04] max-lg:p-4 max-lg:pt-3 max-lg:gap-4 p-6 sm:p-8 flex flex-col gap-6${
        className ? ` ${className}` : ""
      }`}
    >
      <div>
        <p className="hidden lg:block font-mono text-[10px] tracking-[0.2em] uppercase text-gold">
          {title}
        </p>
        <p className="lg:mt-2 text-white/70 text-sm leading-relaxed">{headline}</p>
      </div>

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

      {!hasEstimate ? (
        <p className="text-white/45 text-xs leading-relaxed">
          Not enough comparable {kind === "sale" ? "sales" : "rentals"} matched
          these parameters to estimate a range yet.
        </p>
      ) : (
        <>
          <IfMathWorksheet
            est={displayScenario}
            sqft={displayScenario.math.subjectSqft ?? displayScenario.params.sqft}
            kind={kind}
            midpointMethod={midpointMethod}
            onMidpointMethodChange={setMidpointMethod}
          />
          <CompList
            comps={comps}
            kind={kind}
            townHint={townHint}
            amountLow={displayScenario.amountLow}
            amountHigh={displayScenario.amountHigh}
            subjectBeds={displayScenario.params.beds}
            subjectBaths={displayScenario.params.baths}
            foundCountEmphasized={foundCountEmphasized}
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
  const mobileIfCriteriaSlotId = listingCriteriaLinkSlotId(
    LISTING_SECTION_IDS.if,
  );
  const criteriaFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const isPage = variant === "page";
  const isDesktop = useListingDesktopLayout() === true;

  useEffect(() => {
    setSessionMatch(null);
    setBaselineMatch(null);
    setSessionSeeded(false);
    setCriteriaStepFeedback(null);
    setMobileScenarioLead("sale");
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
          tag: comp.role === "sold" ? "Sold" : "Active",
          townHint,
        }),
      ),
      ...rentComps.map((comp) =>
        criteriaPreviewRowFromIfComp(comp, {
          isRental: true,
          tag: comp.role === "sold" ? "Rented" : "For rent",
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

  const mainColumn = (
    <>
      {!criteriaInSidePanel && criteriaBlock ? (
        <div className="text-center space-y-1">{criteriaBlock}</div>
      ) : null}

      {/* Mobile: sell/rent as pill tabs + Criteria; desktop: side-by-side panels. */}
      <div className="lg:hidden mb-1 flex items-end justify-between gap-3 max-lg:px-3">
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
            className="flex shrink-0 items-end justify-end min-h-[1em]"
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
          className={
            mobileScenarioLead === "sale"
              ? "max-lg:block lg:block"
              : "max-lg:hidden lg:block"
          }
          amountLabel="Estimated Value Range"
          midpointLabel="Midpoint"
        />
        <ScenarioPanel
          title="If you rent"
          headline="Likely monthly rent range if this home were leased today."
          scenario={rentEstimate}
          comps={rentComps}
          kind="rent"
          townHint={townHint}
          foundCountEmphasized={foundCountEmphasized}
          className={
            mobileScenarioLead === "rent"
              ? "max-lg:block lg:block"
              : "max-lg:hidden lg:block"
          }
          amountLabel="Estimated monthly rent range"
          midpointLabel="Midpoint"
        />
      </div>

      {addressHint ? (
        <p className="font-mono text-[10px] text-white/30 tracking-[0.04em]">
          {addressHint}
          {townHint ? `, ${townHint}` : ""}
        </p>
      ) : null}

      <IfEmailScenarioForm mlsId={mlsId} />
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
      {isPage && !suppressPageChrome ? (
        <div className="max-lg:px-3 lg:px-0">
          <div className="min-w-0 text-left">
            <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-gold mb-1">
              What if
            </p>
            <p className="text-white/50 text-sm leading-relaxed">
              Based on matching criteria, we estimate a sale and rent range for
              this home — and show the comps that fed each number.
            </p>
          </div>
        </div>
      ) : null}

      {criteriaInSidePanel ? (
        <ListingCriteriaSideLayout
          criteria={criteriaBlock}
          heading="What if criteria"
          linkSlotId={
            isDesktop
              ? listingCriteriaLinkSlotId(LISTING_SECTION_IDS.if)
              : null
          }
          linkSlotIds={isDesktop ? null : [mobileIfCriteriaSlotId]}
        >
          {mainColumn}
        </ListingCriteriaSideLayout>
      ) : (
        mainColumn
      )}
    </div>
  );
}
