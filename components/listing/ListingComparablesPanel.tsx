"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import ListingThumbImage from "@/components/ListingThumbImage";
import { fmtDate, fmtMoney } from "@/lib/listing-history";
import {
  fmtAcres,
  fmtSqft,
  fmtPricePerSqft,
  fmtYearBuilt,
  vintageCriteriaList,
  soldWithinLookback,
  lookbackLabel,
  COMPARABLES_LOOKBACK_OPTIONS,
  COMPARABLES_DEFAULT_LOOKBACK_MONTHS,
  type ComparableListing,
  type ComparablesCriteria,
  type ComparablesLookbackMonths,
} from "@/lib/listing-comparables-shared";
import { listingDetailHref, listingPhotoProxyUrl } from "@/lib/listing-url";
import { listingHoverHandlers } from "@/lib/warm-listing-cache";
import { loadTabJson, peekTabJson } from "@/lib/tab-data-prefetch";
import { VINTAGE_BUCKETS } from "@/lib/vintage-buckets";

type ComparablesResponse = {
  sold: ComparableListing[];
  active: ComparableListing[];
  criteria: ComparablesCriteria | null;
  missingCriteria: string[];
};

function fmtCompPricePerSqft(pricePerSqft: number | null | undefined): string | null {
  return fmtPricePerSqft(pricePerSqft);
}

function bedBathLabel(beds: number | null, baths: number | null): string {
  const parts: string[] = [];
  if (beds != null) parts.push(`${beds} bd`);
  if (baths != null) parts.push(`${baths} ba`);
  return parts.length ? parts.join(" · ") : "—";
}

type SortDir = "asc" | "desc";
type SoldSortKey = "closeDate" | "score" | "price";
type ActiveSortKey = "default" | "score" | "price";
type CompSortTheme = "light" | "dark";

const COMP_INITIAL_VISIBLE = 4;
const COMP_SHOW_MORE_STEP = 4;
const COMP_MAX_VISIBLE = 12;
/** Extra sold comps revealed per look-back step (4 → 6 → 8 → 10 → 12). */
const LOOKBACK_VISIBLE_STEP = 2;
/** Auto-widen the look-back until at least this many sold/rented comps show. */
const COMP_MIN_LOOKBACK_COMPS = 4;

type SoldYearGroup = { year: number | null; comps: ComparableListing[] };

/**
 * Group sold/rented comps by close year, newest year first, preserving the
 * incoming (already-sorted) order within each year. Undated comps sort last.
 */
function groupSoldByYear(comps: ComparableListing[]): SoldYearGroup[] {
  const map = new Map<number | null, ComparableListing[]>();
  for (const comp of comps) {
    const ms = parseCloseDateMs(comp.closeDate);
    const year = ms > 0 ? new Date(ms).getFullYear() : null;
    const arr = map.get(year);
    if (arr) arr.push(comp);
    else map.set(year, [comp]);
  }
  return [...map.entries()]
    .sort((a, b) => (b[0] ?? -Infinity) - (a[0] ?? -Infinity))
    .map(([year, groupComps]) => ({ year, comps: groupComps }));
}

/** Smallest look-back window (months) that surfaces at least `minCount` comps. */
function minLookbackForComps(
  sold: ComparableListing[],
  minCount: number,
): number {
  for (const months of COMPARABLES_LOOKBACK_OPTIONS) {
    if (soldWithinLookback(sold, months, sold.length).length >= minCount) {
      return months;
    }
  }
  return COMPARABLES_LOOKBACK_OPTIONS[COMPARABLES_LOOKBACK_OPTIONS.length - 1]!;
}

function defaultSortDir(key: SoldSortKey | ActiveSortKey): SortDir {
  if (key === "default" || key === "price") return "asc";
  return "desc";
}

function compDisplayScore(comp: ComparableListing): number {
  return comp.edgeScore ?? comp.goldilocksScore ?? -1;
}

function parseCloseDateMs(closeDate: string | null | undefined): number {
  if (!closeDate) return 0;
  const ms = Date.parse(closeDate);
  return Number.isNaN(ms) ? 0 : ms;
}

/** Same price fields as CompRow: close/lease price when closed, else list/rent. */
function compSortPrice(
  comp: ComparableListing,
  useClosePrice: boolean,
): number | null {
  if (useClosePrice) {
    if (comp.closePrice != null && comp.closePrice > 0) return comp.closePrice;
    if (comp.price != null && comp.price > 0) return comp.price;
    return null;
  }
  if (comp.price != null && comp.price > 0) return comp.price;
  return null;
}

function compareCompPrice(
  a: ComparableListing,
  b: ComparableListing,
  useClosePrice: boolean,
  dir: SortDir,
): number {
  const sign = dir === "asc" ? 1 : -1;
  const nullSentinel =
    dir === "asc" ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
  const pa = compSortPrice(a, useClosePrice) ?? nullSentinel;
  const pb = compSortPrice(b, useClosePrice) ?? nullSentinel;
  return sign * (pa - pb);
}

function sortSoldComparables(
  comps: ComparableListing[],
  sortKey: SoldSortKey,
  dir: SortDir,
): ComparableListing[] {
  const copy = [...comps];
  const sign = dir === "asc" ? 1 : -1;
  if (sortKey === "score") {
    return copy.sort((a, b) => {
      const sa = compDisplayScore(a);
      const sb = compDisplayScore(b);
      return sign * (sa - sb);
    });
  }
  if (sortKey === "price") {
    return copy.sort((a, b) => compareCompPrice(a, b, true, dir));
  }
  return copy.sort(
    (a, b) =>
      sign * (parseCloseDateMs(a.closeDate) - parseCloseDateMs(b.closeDate)),
  );
}

function sortActiveComparables(
  comps: ComparableListing[],
  sortKey: ActiveSortKey,
  dir: SortDir,
): ComparableListing[] {
  if (sortKey === "default") {
    return dir === "asc" ? comps : [...comps].reverse();
  }
  const copy = [...comps];
  if (sortKey === "price") {
    return copy.sort((a, b) => compareCompPrice(a, b, false, dir));
  }
  const sign = dir === "asc" ? 1 : -1;
  return copy.sort((a, b) => {
    const sa = compDisplayScore(a);
    const sb = compDisplayScore(b);
    return sign * (sa - sb);
  });
}

/** Green = best (highest), red = worst within the visible comp set. */
function buildRelativeScoreColorMap(
  comps: ComparableListing[],
): Map<string, string> {
  const scored = comps
    .filter((c) => compDisplayScore(c) > 0)
    .sort((a, b) => compDisplayScore(b) - compDisplayScore(a));

  const map = new Map<string, string>();
  const n = scored.length;
  if (n === 0) return map;

  scored.forEach((comp, index) => {
    const rank =
      n === 1 ? 0 : index / (n - 1); /* 0 = best, 1 = worst */
    const tierClass =
      rank <= 1 / 3
        ? "bg-sage/15 text-sage"
        : rank <= 2 / 3
          ? "bg-gold/15 text-gold"
          : "bg-coral/15 text-coral";
    map.set(comp.mlsId, tierClass);
  });
  return map;
}

function CompSortLinks<T extends string>({
  options,
  activeKey,
  activeDir,
  onSort,
  theme,
  ariaLabel,
}: {
  options: { key: T; label: string }[];
  activeKey: T;
  activeDir: SortDir;
  onSort: (key: T) => void;
  theme: CompSortTheme;
  ariaLabel: string;
}) {
  const isLight = theme === "light";

  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-1 shrink-0"
      role="group"
      aria-label={ariaLabel}
    >
      {options.map((option) => {
        const active = activeKey === option.key;
        const stateClass = active
          ? isLight
            ? "text-navy decoration-gold/60"
            : "text-white/80 decoration-gold/50 hover:text-gold"
          : isLight
            ? "text-slate/60 decoration-charcoal/15 hover:text-gold hover:decoration-gold/50"
            : "text-white/35 decoration-white/20 hover:text-gold hover:decoration-gold/50";

        return (
          <button
            key={option.key}
            type="button"
            onClick={() => onSort(option.key)}
            className={`inline-flex items-center gap-0.5 font-mono text-[10px] tracking-[0.12em] uppercase transition-colors underline underline-offset-2 ${stateClass}`}
            aria-sort={
              active
                ? activeDir === "asc"
                  ? "ascending"
                  : "descending"
                : "none"
            }
          >
            {option.label}
            {active ? (
              <span className="text-gold" aria-hidden>
                {activeDir === "asc" ? "↑" : "↓"}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function CompScoreBadge({
  score,
  variant,
  colorClass,
}: {
  score: number | null | undefined;
  variant: "page" | "panel" | "modal";
  colorClass?: string | null;
}) {
  const isModal = variant === "modal";
  const mutedClass = isModal
    ? "bg-charcoal/[0.06] text-slate/70"
    : "bg-white/10 text-white/40";

  if (score == null || score <= 0) {
    return (
      <span
        className={`font-mono text-sm tabular-nums font-semibold px-2.5 py-1 rounded-full ${mutedClass}`}
        aria-label="Score unavailable"
      >
        —
      </span>
    );
  }

  const tierClass =
    colorClass ?? (isModal ? "bg-charcoal/[0.06] text-navy" : "bg-white/10 text-white");

  return (
    <span
      className={`font-mono text-sm tabular-nums font-semibold px-2.5 py-1 rounded-full ${tierClass}`}
      aria-label={`Edge score ${score.toFixed(1)}`}
    >
      {score.toFixed(1)}
    </span>
  );
}

function CompRow({
  comp,
  town,
  variant,
  showCloseDate,
  isRental = false,
  scoreColorClass,
}: {
  comp: ComparableListing;
  town: string | null;
  variant: "page" | "panel" | "modal";
  showCloseDate: boolean;
  isRental?: boolean;
  scoreColorClass?: string | null;
}) {
  const isModal = variant === "modal";
  const id = comp.listingKey?.trim() || comp.mlsId;
  const href = listingDetailHref(id, comp.address, town || comp.city);
  const hasPhoto = comp.photoCount != null && comp.photoCount > 0;
  const thumbUrl = hasPhoto ? listingPhotoProxyUrl(comp.mlsId, 0) : null;

  const priceLabel = showCloseDate
    ? comp.closePrice != null
      ? `${fmtMoney(comp.closePrice)}${isRental ? "/mo" : ""}`
      : `${fmtMoney(comp.price)}${isRental ? "/mo" : ""}`
    : `${fmtMoney(comp.price)}${isRental ? "/mo" : ""}`;

  const metaParts = [
    bedBathLabel(comp.beds, comp.baths),
    fmtSqft(comp.sqft),
    fmtAcres(comp.lotAcres),
    fmtYearBuilt(comp.yearBuilt),
    isRental ? null : fmtCompPricePerSqft(comp.pricePerSqft),
  ].filter(Boolean);

  const thumbBorderClass = isModal
    ? "border-charcoal/10 bg-cream/60"
    : "border-white/10 bg-white/5";

  const addressLinkClass = isModal
    ? "text-navy hover:text-gold transition-colors font-medium"
    : "text-white/90 hover:text-gold transition-colors font-medium";

  const priceClass = isModal
    ? "text-charcoal font-mono text-xs"
    : "text-gold font-mono text-xs";

  const timingClass = isModal
    ? "text-slate font-mono text-xs"
    : "text-white/50 font-mono text-xs";

  const timingLabel =
    showCloseDate && comp.closeDate
      ? `Closed ${fmtDate(comp.closeDate)}`
      : !showCloseDate && comp.dom != null
        ? `${comp.dom} DOM`
        : null;

  return (
    <li
      {...listingHoverHandlers(comp.mlsId)}
      className={`text-sm ${
        isModal
          ? "border-t border-charcoal/[0.06] pt-3 first:border-0 first:pt-0"
          : "border-t border-white/[0.06] pt-3 first:border-0 first:pt-0"
      }`}
    >
      <div className="flex items-baseline justify-between gap-3 min-w-0">
        <Link href={href} className={`min-w-0 truncate ${addressLinkClass}`}>
          {comp.address}
        </Link>
        <span className={`shrink-0 tabular-nums text-right ${priceClass}`}>
          {priceLabel}
        </span>
      </div>
      <div className="mt-1.5 flex gap-3 items-start">
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="shrink-0 w-20">
            {thumbUrl ? (
              <Link
                href={href}
                className={`relative block w-20 h-14 rounded-lg overflow-hidden border ${thumbBorderClass}`}
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
                className={`w-20 h-14 rounded-lg border ${thumbBorderClass}`}
                aria-hidden
              />
            )}
          </div>
          <CompScoreBadge
            score={comp.edgeScore ?? comp.goldilocksScore}
            variant={variant}
            colorClass={scoreColorClass}
          />
        </div>
        <div className="min-w-0 flex-1 text-right">
          {timingLabel ? (
            <p className={`tabular-nums ${timingClass}`}>
              {timingLabel}
            </p>
          ) : null}
          <p
            className={`${
              isModal ? "text-slate text-xs" : "text-white/50 text-xs"
            }${timingLabel ? " mt-1" : ""}`}
          >
            {metaParts.join(" · ")}
          </p>
        </div>
      </div>
    </li>
  );
}

function CompShowMoreButton({
  onClick,
  theme,
}: {
  onClick: () => void;
  theme: CompSortTheme;
}) {
  const isLight = theme === "light";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`mt-3 font-mono text-[10px] tracking-[0.12em] uppercase transition-colors underline underline-offset-2 ${
        isLight
          ? "text-slate/60 decoration-charcoal/15 hover:text-gold hover:decoration-gold/50"
          : "text-white/35 decoration-white/20 hover:text-gold hover:decoration-gold/50"
      }`}
    >
      Show {COMP_SHOW_MORE_STEP} more
    </button>
  );
}

/**
 * Compact up/down spinner for the sold/rented look-back window. ▼ shortens,
 * ▲ lengthens, stepping through COMPARABLES_LOOKBACK_OPTIONS (1yr → 3yr).
 */
function LookbackSpinner({
  months,
  onChange,
  theme,
}: {
  months: number;
  onChange: (next: number) => void;
  theme: CompSortTheme;
}) {
  const options = COMPARABLES_LOOKBACK_OPTIONS;
  const idx = Math.max(
    0,
    options.indexOf(months as ComparablesLookbackMonths),
  );
  const atMin = idx <= 0;
  const atMax = idx >= options.length - 1;
  const dark = theme === "dark";

  // Raised, 3D-ish stepper buttons with an inset highlight + drop shadow that
  // presses down on click. Triangles sit flush against the value readout.
  const btnClass = `flex h-[18px] w-[18px] items-center justify-center rounded-md border text-[8px] leading-none transition-all active:translate-y-px disabled:opacity-25 disabled:cursor-not-allowed disabled:shadow-none disabled:active:translate-y-0 ${
    dark
      ? "border-white/15 bg-gradient-to-b from-white/20 to-white/[0.06] text-white/75 shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_1px_2px_rgba(0,0,0,0.45)] hover:from-white/30 hover:text-gold active:shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)]"
      : "border-charcoal/20 bg-gradient-to-b from-white to-cream/70 text-charcoal/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_1px_2px_rgba(0,0,0,0.18)] hover:text-navy active:shadow-[inset_0_1px_2px_rgba(0,0,0,0.2)]"
  }`;

  return (
    <div className="flex items-center gap-1.5">
      <span
        className={`font-mono text-[9px] tracking-[0.12em] uppercase ${
          dark ? "text-white/40" : "text-slate"
        }`}
      >
        Look-back
      </span>
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          className={btnClass}
          onClick={() => !atMin && onChange(options[idx - 1]!)}
          disabled={atMin}
          aria-label="Shorter look-back"
        >
          &#9660;
        </button>
        <span
          className={`min-w-[2.6rem] rounded-md border px-1.5 py-0.5 text-center font-mono text-[10px] tracking-[0.1em] uppercase tabular-nums ${
            dark
              ? "border-white/10 bg-black/20 text-white/80 shadow-[inset_0_1px_2px_rgba(0,0,0,0.4)]"
              : "border-charcoal/15 bg-white/70 text-charcoal/80 shadow-[inset_0_1px_2px_rgba(0,0,0,0.08)]"
          }`}
        >
          {lookbackLabel(months)}
        </span>
        <button
          type="button"
          className={btnClass}
          onClick={() => !atMax && onChange(options[idx + 1]!)}
          disabled={atMax}
          aria-label="Longer look-back"
        >
          &#9650;
        </button>
      </div>
    </div>
  );
}

/** Acres value without the unit suffix, for building ranges like "0.22–0.52 ac". */
function acresValue(acres: number): string {
  if (acres < 0.01) return "<0.01";
  if (acres < 10) return acres.toFixed(2);
  return acres.toFixed(1);
}

/**
 * Continuous vintage span for the expanded view, derived from the bracketed
 * label list (oldest → newest). Open-ended buckets read as "< 1900" / "present"
 * so e.g. [Pre-1900, 1900–1940] expands to "< 1900–1940".
 */
function vintageExpandedSpan(vintageList: string): string {
  const labels = vintageList.split(" | ").filter(Boolean);
  const entries = labels
    .map((label) => {
      const idx = VINTAGE_BUCKETS.findIndex((b) => b.label === label);
      return { label, idx, id: VINTAGE_BUCKETS[idx]?.id ?? null };
    })
    .filter((e) => e.idx >= 0)
    .sort((a, b) => a.idx - b.idx);
  if (entries.length === 0) return "";

  const lower = entries[0]!;
  const upper = entries[entries.length - 1]!;

  if (entries.length === 1) {
    if (lower.id === "pre-1900") return "< 1900";
    if (lower.id === "2020-present") return "2020+";
    return lower.label;
  }

  const lowerEdge =
    lower.id === "pre-1900" ? "< 1900" : (lower.label.split("–")[0] ?? lower.label);
  const upperEdge =
    upper.id === "2020-present" ? "present" : (upper.label.split("–")[1] ?? upper.label);
  return `${lowerEdge}–${upperEdge}`;
}

type CriteriaBound = {
  key: string;
  /** Text left of the bracket (empty for the vintage token). */
  label: string;
  /** Compact bracket contents, e.g. "±1" or "Pre-1900, 1900–1940". */
  token: string;
  /** Expanded bounds, e.g. "3–5 bed" or "< 1900–1940". */
  expanded: string;
};

function criteriaBounds(criteria: ComparablesCriteria): CriteriaBound[] {
  const bounds: CriteriaBound[] = [
    {
      key: "bed",
      label: `${criteria.beds} bed`,
      token: "±1",
      expanded: `${Math.max(0, criteria.beds - 1)}–${criteria.beds + 1} bed`,
    },
    {
      key: "bath",
      label: `${criteria.baths} bath`,
      token: "±1",
      expanded: `${Math.max(0, criteria.baths - 1)}–${criteria.baths + 1} bath`,
    },
  ];

  const vintages = vintageCriteriaList(criteria);
  if (vintages) {
    bounds.push({
      key: "vintage",
      label: "",
      token: vintages.split(" | ").join(", "),
      expanded: vintageExpandedSpan(vintages),
    });
  }

  if (criteria.sqft != null) {
    bounds.push({
      key: "sqft",
      label: fmtSqft(criteria.sqft),
      token: "±30%",
      expanded: `${Math.round(criteria.sqft * 0.7).toLocaleString("en-US")}–${Math.round(
        criteria.sqft * 1.3,
      ).toLocaleString("en-US")} sqft`,
    });
  }

  if (criteria.lotAcres != null) {
    bounds.push({
      key: "lot",
      label: fmtAcres(criteria.lotAcres),
      token: "±40%",
      expanded: `${acresValue(criteria.lotAcres * 0.6)}–${acresValue(
        criteria.lotAcres * 1.4,
      )} ac`,
    });
  }

  return bounds;
}

/**
 * Renders the "Matching …" criteria line. Every bracketed tolerance/vintage is a
 * toggle: click (or hover for the tooltip) to swap the compact "[±1]" bracket
 * for the actual bounds ("3–5 bed"); click again to collapse back.
 */
function CriteriaSummary({
  criteria,
  isModal,
}: {
  criteria: ComparablesCriteria;
  isModal: boolean;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const toggle = (key: string) =>
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));

  // Swapped palette: the values (zip / bed / bath / sqft / ac) are gold, while
  // the still-clickable bracket toggles take the muted "other" color.
  const valueClass = "text-gold";
  const linkClass = isModal
    ? "text-slate underline decoration-slate/40 underline-offset-2 hover:text-navy transition-colors cursor-pointer"
    : "text-white/60 underline decoration-white/40 underline-offset-2 hover:text-white transition-colors cursor-pointer";

  const bounds = criteriaBounds(criteria);

  return (
    <>
      <span className={valueClass}>{criteria.zip}</span>
      {bounds.map((bound) => {
        const isOpen = expanded[bound.key];
        return (
          <span key={bound.key}>
            {" · "}
            {bound.label && !isOpen ? (
              <span className={valueClass}>{`${bound.label} `}</span>
            ) : null}
            <button
              type="button"
              onClick={() => toggle(bound.key)}
              className={linkClass}
              title={isOpen ? bound.token : bound.expanded}
              aria-expanded={isOpen}
            >
              {isOpen ? bound.expanded : `[${bound.token}]`}
            </button>
          </span>
        );
      })}
    </>
  );
}

type ListingComparablesPanelProps = {
  mlsId: string;
  townHint?: string | null;
  variant?: "panel" | "page" | "modal";
  kind?: "sale" | "rental";
  /** Override API URL (e.g. spotlight `/api/spotlight/comparables`). */
  fetchUrl?: string;
};

/** Shared comparables tab body for listing and spotlight pages. */
export function ListingComparablesPageContent({
  mlsId,
  townHint,
  kind = "sale",
  fetchUrl,
}: Pick<
  ListingComparablesPanelProps,
  "mlsId" | "townHint" | "kind" | "fetchUrl"
>) {
  return (
    <ListingComparablesPanel
      mlsId={mlsId}
      townHint={townHint}
      variant="page"
      kind={kind}
      fetchUrl={fetchUrl}
    />
  );
}

export default function ListingComparablesPanel({
  mlsId,
  townHint,
  variant = "panel",
  kind = "sale",
  fetchUrl,
}: ListingComparablesPanelProps) {
  const [data, setData] = useState<ComparablesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [soldSort, setSoldSort] = useState<{
    key: SoldSortKey;
    dir: SortDir;
  }>({ key: "closeDate", dir: "desc" });
  const [activeSort, setActiveSort] = useState<{
    key: ActiveSortKey;
    dir: SortDir;
  }>({ key: "default", dir: "asc" });
  const [soldVisibleCount, setSoldVisibleCount] = useState(COMP_INITIAL_VISIBLE);
  const [activeVisibleCount, setActiveVisibleCount] = useState(COMP_INITIAL_VISIBLE);
  const [lookbackMonths, setLookbackMonths] = useState<number>(
    COMPARABLES_DEFAULT_LOOKBACK_MONTHS,
  );

  const isRental = kind === "rental";
  const panelTitle = isRental ? "Comparable Rentals" : "Comparables";
  const recentlyClosedLabel = isRental ? "Recently rented" : "Recently sold";
  const listingWord = isRental ? "rentals" : "listings";
  const pageIntro = isRental
    ? "Recently rented and on-market rentals matching this property's zip, beds, baths, vintage, and lot size."
    : "Recently sold and on-market homes matching this property's zip, beds, baths, vintage, and lot size.";
  const modalIntro = isRental
    ? "Recently rented and on-market rentals with matching zip, beds, baths, vintage, and lot size."
    : "Recently sold and on-market homes with matching zip, beds, baths, vintage, and lot size.";
  const panelIntro = isRental
    ? "Similar rentals by zip, beds, baths, vintage, and lot size"
    : "Similar homes by zip, beds, baths, vintage, and lot size";
  const comparablesUrl =
    fetchUrl ??
    `/api/listings/${encodeURIComponent(mlsId)}/comparables${
      isRental ? "?kind=rental" : ""
    }`;

  useEffect(() => {
    setSoldVisibleCount(COMP_INITIAL_VISIBLE);
    setActiveVisibleCount(COMP_INITIAL_VISIBLE);
  }, [mlsId, comparablesUrl]);

  useEffect(() => {
    let cancelled = false;
    const cached = peekTabJson<ComparablesResponse>(comparablesUrl);
    if (cached) {
      setData(cached);
      setLoadError(null);
      setLoading(false);
    } else {
      setLoading(true);
      setLoadError(null);
    }

    loadTabJson<ComparablesResponse>(comparablesUrl)
      .then((d) => {
        if (cancelled) return;
        if (!d) {
          setData(null);
          setLoadError("Couldn't load comparables.");
          return;
        }
        setData(d);
        setLoadError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setData(null);
        setLoadError(
          err instanceof Error ? err.message : "Couldn't load comparables.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [mlsId, comparablesUrl]);

  // When the default 1-year window holds fewer than COMP_MIN_LOOKBACK_COMPS
  // sold/rented comps, auto-widen the look-back to the smallest window that
  // reaches the minimum (capped at 3yr) and move the spinner to match. Runs once
  // per data load (i.e. per listing), so manual spinner changes are preserved.
  useEffect(() => {
    const soldList = data?.sold ?? [];
    if (soldList.length === 0) {
      setLookbackMonths(COMPARABLES_DEFAULT_LOOKBACK_MONTHS);
      return;
    }
    const withinDefault = soldWithinLookback(
      soldList,
      COMPARABLES_DEFAULT_LOOKBACK_MONTHS,
      soldList.length,
    ).length;
    setLookbackMonths(
      withinDefault >= COMP_MIN_LOOKBACK_COMPS
        ? COMPARABLES_DEFAULT_LOOKBACK_MONTHS
        : minLookbackForComps(soldList, COMP_MIN_LOOKBACK_COMPS),
    );
  }, [data]);

  const sold = data?.sold ?? [];
  const active = data?.active ?? [];
  const criteria = data?.criteria ?? null;
  const missing = data?.missingCriteria ?? [];
  const town = townHint ?? null;
  const hasContent = sold.length > 0 || active.length > 0;
  const isPage = variant === "page";
  const isModal = variant === "modal";
  const sortTheme: CompSortTheme = isModal ? "light" : "dark";

  const handleSoldSort = (key: SoldSortKey) => {
    setSoldSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: defaultSortDir(key) },
    );
  };

  const handleActiveSort = (key: ActiveSortKey) => {
    setActiveSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: defaultSortDir(key) },
    );
  };

  // `sold` is the full 36-month fit-ranked superset from the cache; filter it
  // to the selected look-back and keep the top matches by fit before sorting.
  const soldWindowed = useMemo(
    () => soldWithinLookback(sold, lookbackMonths, COMP_MAX_VISIBLE),
    [sold, lookbackMonths],
  );
  const sortedSold = useMemo(
    () => sortSoldComparables(soldWindowed, soldSort.key, soldSort.dir),
    [soldWindowed, soldSort],
  );
  const sortedActive = useMemo(
    () => sortActiveComparables(active, activeSort.key, activeSort.dir),
    [active, activeSort],
  );
  const soldScoreColors = useMemo(
    () => buildRelativeScoreColorMap(sortedSold),
    [sortedSold],
  );
  const activeScoreColors = useMemo(
    () => buildRelativeScoreColorMap(sortedActive),
    [sortedActive],
  );

  // The sold baseline scales with the look-back (1yr→4, 18mo→6, 2yr→8, 30mo→10,
  // 3yr→12), so widening reveals two more comps per step rather than collapsing
  // back to 4. Any manual "show more" beyond the baseline is preserved (we never
  // shrink the view).
  const soldWindowBase =
    COMP_INITIAL_VISIBLE +
    LOOKBACK_VISIBLE_STEP *
      Math.max(
        0,
        COMPARABLES_LOOKBACK_OPTIONS.indexOf(
          lookbackMonths as ComparablesLookbackMonths,
        ),
      );
  const effectiveSoldVisible = Math.max(soldVisibleCount, soldWindowBase);

  const soldCap = Math.min(sortedSold.length, COMP_MAX_VISIBLE);
  const activeCap = Math.min(sortedActive.length, COMP_MAX_VISIBLE);
  const visibleSold = sortedSold.slice(0, Math.min(effectiveSoldVisible, soldCap));
  // Regardless of the chosen sort, group the visible sold/rented comps by close
  // year (newest first) so older years are clearly separated by a divider.
  const soldGroups = useMemo(() => groupSoldByYear(visibleSold), [visibleSold]);
  const visibleActive = sortedActive.slice(
    0,
    Math.min(activeVisibleCount, activeCap),
  );
  const canShowMoreSold =
    effectiveSoldVisible < soldCap && sortedSold.length > effectiveSoldVisible;
  const canShowMoreActive =
    activeVisibleCount < activeCap && sortedActive.length > activeVisibleCount;

  const showCompsGrid = missing.length === 0 && (sold.length > 0 || active.length > 0);
  const showDualColumnsOnPage = isPage && showCompsGrid;

  const compsGridClass = showDualColumnsOnPage
    ? "grid gap-6 grid-cols-1 sm:grid-cols-2 items-start"
    : sold.length > 0 && active.length > 0
      ? "grid gap-6 md:grid-cols-2 md:items-start"
      : "space-y-6";

  const showSoldColumn = sold.length > 0 || showDualColumnsOnPage;
  const showActiveColumn = active.length > 0 || showDualColumnsOnPage;

  const onMarketEmptyLabel = isRental
    ? "No on-market rentals found yet."
    : "No on-market listings found yet.";
  const recentlyClosedEmptyLabel = isRental
    ? "No recently rented matches found yet."
    : "No recently sold matches found yet.";

  if (loading) {
    return (
      <div
        className={
          isPage
            ? "w-full min-w-0"
            : isModal
              ? ""
              : "rounded-2xl border border-white/10 bg-white/[0.04] p-6"
        }
      >
        {!isPage && !isModal && (
          <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-gold mb-3">
            {panelTitle}
          </p>
        )}
        <p
          className={`font-mono text-[10px] tracking-[0.15em] uppercase ${
            isModal ? "text-slate" : "text-white/40"
          }`}
        >
          Loading…
        </p>
      </div>
    );
  }

  if (!hasContent && !isPage && !isModal) return null;

  const wrapperClass = isPage
    ? "w-full min-w-0 space-y-6"
    : isModal
      ? "space-y-5"
      : "rounded-2xl border border-white/10 bg-white/[0.04] p-6 space-y-5";

  const sectionTitleClass = isModal
    ? "font-mono text-[10px] tracking-[0.15em] uppercase text-slate"
    : "font-mono text-[10px] tracking-[0.15em] uppercase text-white/45";

  // "N found" count shown in the top-right corner of each comps panel.
  const foundCountClass = `font-mono text-[10px] tracking-[0.16em] uppercase tabular-nums whitespace-nowrap ${
    isModal ? "text-slate/70" : "text-white/40"
  }`;

  return (
    <div className={wrapperClass}>
      {isPage && (
        <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-gold mb-1">
          {panelTitle}
        </p>
      )}

      {!isPage && !isModal && (
        <div>
          <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-gold mb-1">
            {panelTitle}
          </p>
          <p className="text-white/50 text-xs">
            {panelIntro}
          </p>
        </div>
      )}

      {isPage && (
        <p className="text-white/50 text-sm">{pageIntro}</p>
      )}

      {isModal && (
        <p className="text-sm text-slate leading-relaxed">{modalIntro}</p>
      )}

      {criteria && (isPage || isModal || hasContent) && (
        <p
          className={
            isModal
              ? "font-mono text-[10px] tracking-[0.12em] uppercase text-slate"
              : "font-mono text-[10px] tracking-[0.12em] uppercase text-white/40"
          }
        >
          <CriteriaSummary criteria={criteria} isModal={isModal} />
        </p>
      )}

      {loadError && (isPage || isModal) && (
        <div
          className={
            isModal
              ? "rounded-2xl border border-charcoal/[0.08] bg-cream/60 p-6 text-center"
              : "rounded-2xl border border-white/10 bg-white/[0.04] p-8 text-center"
          }
        >
          <p className={isModal ? "text-charcoal text-sm" : "text-white/60 text-sm"}>
            {loadError}
          </p>
        </div>
      )}

      {missing.length > 0 && (
        <div
          className={
            isModal
              ? "rounded-2xl border border-charcoal/[0.08] bg-cream/60 p-6 text-center"
              : "rounded-2xl border border-white/10 bg-white/[0.04] p-8 text-center"
          }
        >
          <p className={isModal ? "text-charcoal text-sm" : "text-white/60 text-sm"}>
            {panelTitle} need {missing.join(", ")} on this listing.
          </p>
          <p
            className={
              isModal ? "text-slate text-xs mt-2" : "text-white/40 text-xs mt-2"
            }
          >
            We match same zip, beds within ±1, baths within ±1, living area within ±30%, similar vintage (same era, plus the bordering era when the home sits near a vintage edge), and lot size when available.
          </p>
        </div>
      )}

      {missing.length === 0 && !hasContent && !loadError && (isPage || isModal) && (
        <div
          className={
            isModal
              ? "rounded-2xl border border-charcoal/[0.08] bg-cream/60 p-6 text-center"
              : "rounded-2xl border border-white/10 bg-white/[0.04] p-8 text-center"
          }
        >
          <p className={isModal ? "text-charcoal text-sm" : "text-white/60 text-sm"}>
            No comparable {listingWord} found in the local cache yet.
          </p>
          <p
            className={
              isModal ? "text-slate text-xs mt-2" : "text-white/40 text-xs mt-2"
            }
          >
            Matches require the same zip, beds within ±1, baths within ±1, same vintage era (plus the bordering era near an edge)
            {criteria?.sqft != null ? ", living area within ±30%" : ""}
            {criteria?.lotAcres != null ? ", and similar lot size" : ""}.
          </p>
        </div>
      )}

      {showCompsGrid && (
        <div className={compsGridClass}>
      {showSoldColumn && (
        <div
          className={
            isPage
              ? "min-w-0 rounded-2xl border border-white/10 bg-white/[0.04] p-6"
              : isModal
                ? "min-w-0 rounded-2xl border border-charcoal/[0.08] bg-cream/40 p-4"
                : "min-w-0"
          }
        >
          <div className="relative mb-3 pr-[4.5rem]">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <p className={sectionTitleClass}>{recentlyClosedLabel}</p>
                <LookbackSpinner
                  months={lookbackMonths}
                  onChange={setLookbackMonths}
                  theme={sortTheme}
                />
              </div>
              {sortedSold.length > 0 ? (
                <CompSortLinks
                  options={[
                    { key: "score", label: "Edge" },
                    { key: "closeDate", label: "CLOSED" },
                    { key: "price", label: "Price" },
                  ]}
                  activeKey={soldSort.key}
                  activeDir={soldSort.dir}
                  onSort={handleSoldSort}
                  theme={sortTheme}
                  ariaLabel={`${recentlyClosedLabel} sort`}
                />
              ) : null}
            </div>
            <span className={`${foundCountClass} absolute top-0 right-0`}>
              {sortedSold.length} found
            </span>
          </div>
          {sortedSold.length > 0 ? (
            <>
              <div className="space-y-3">
                {soldGroups.map((group) => (
                  <div key={group.year ?? "earlier"}>
                    <p
                      className={`mb-3 border-y py-2 text-center font-mono text-[10px] font-bold tracking-[0.16em] uppercase tabular-nums ${
                        isModal
                          ? "border-charcoal/15 text-charcoal"
                          : "border-white/15 text-white"
                      }`}
                    >
                      {group.year ?? "Earlier"}
                    </p>
                    <ul className="space-y-3">
                      {group.comps.map((comp) => (
                        <CompRow
                          key={comp.mlsId}
                          comp={comp}
                          town={town}
                          variant={variant}
                          showCloseDate
                          isRental={isRental}
                          scoreColorClass={soldScoreColors.get(comp.mlsId) ?? null}
                        />
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
              {canShowMoreSold ? (
                <CompShowMoreButton
                  theme={sortTheme}
                  onClick={() =>
                    setSoldVisibleCount((n) =>
                      Math.min(
                        Math.max(n, soldWindowBase) + COMP_SHOW_MORE_STEP,
                        COMP_MAX_VISIBLE,
                      ),
                    )
                  }
                />
              ) : null}
            </>
          ) : (
            <p className={isModal ? "text-slate text-sm" : "text-white/50 text-sm"}>
              {sold.length > 0
                ? `No ${
                    isRental ? "rentals" : "sales"
                  } closed in the last ${lookbackLabel(
                    lookbackMonths,
                  )}. Widen the look-back above.`
                : recentlyClosedEmptyLabel}
            </p>
          )}
        </div>
      )}

      {showActiveColumn && (
        <div
          className={
            isPage
              ? "min-w-0 rounded-2xl border border-white/10 bg-white/[0.04] p-6"
              : isModal
                ? "min-w-0 rounded-2xl border border-charcoal/[0.08] bg-cream/40 p-4"
                : "min-w-0"
          }
        >
          <div className="relative mb-3 pr-[4.5rem]">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <p className={sectionTitleClass}>
                {isPage ? "ON MARKET" : "On market"}
              </p>
              {sortedActive.length > 0 ? (
                <CompSortLinks
                  options={[
                    { key: "default", label: "Match" },
                    { key: "score", label: "Edge" },
                    { key: "price", label: "Price" },
                  ]}
                  activeKey={activeSort.key}
                  activeDir={activeSort.dir}
                  onSort={handleActiveSort}
                  theme={sortTheme}
                  ariaLabel="On market sort"
                />
              ) : null}
            </div>
            <span className={`${foundCountClass} absolute top-0 right-0`}>
              {sortedActive.length} found
            </span>
          </div>
          {active.length > 0 ? (
            <>
              <ul className="space-y-3">
                {visibleActive.map((comp) => (
                  <CompRow
                    key={comp.mlsId}
                    comp={comp}
                    town={town}
                    variant={variant}
                    showCloseDate={false}
                    isRental={isRental}
                    scoreColorClass={activeScoreColors.get(comp.mlsId) ?? null}
                  />
                ))}
              </ul>
              {canShowMoreActive ? (
                <CompShowMoreButton
                  theme={sortTheme}
                  onClick={() =>
                    setActiveVisibleCount((n) =>
                      Math.min(n + COMP_SHOW_MORE_STEP, COMP_MAX_VISIBLE),
                    )
                  }
                />
              ) : null}
            </>
          ) : (
            <p className={isModal ? "text-slate text-sm" : "text-white/50 text-sm"}>
              {onMarketEmptyLabel}
            </p>
          )}
        </div>
      )}
        </div>
      )}
    </div>
  );
}
