"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import ListingThumbImage from "@/components/ListingThumbImage";
import { fmtDate, fmtMoney } from "@/lib/listing-history";
import {
  fmtAcres,
  fmtPricePerSqft,
  fmtYearBuilt,
  type ComparableListing,
  type ComparablesCriteria,
} from "@/lib/listing-comparables-shared";
import { listingDetailHref, listingPhotoProxyUrl } from "@/lib/listing-url";
import { listingHoverHandlers } from "@/lib/warm-listing-cache";

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

function defaultSortDir(key: SoldSortKey | ActiveSortKey): SortDir {
  if (key === "default" || key === "price") return "asc";
  return "desc";
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
      const sa = a.goldilocksScore ?? -1;
      const sb = b.goldilocksScore ?? -1;
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
    const sa = a.goldilocksScore ?? -1;
    const sb = b.goldilocksScore ?? -1;
    return sign * (sa - sb);
  });
}

/** Green = best (highest), red = worst within the visible comp set. */
function buildRelativeScoreColorMap(
  comps: ComparableListing[],
): Map<string, string> {
  const scored = comps
    .filter((c) => c.goldilocksScore != null && c.goldilocksScore > 0)
    .sort((a, b) => b.goldilocksScore! - a.goldilocksScore!);

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
      aria-label={`Goldilocks score ${score.toFixed(1)}`}
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
            score={comp.goldilocksScore}
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

function criteriaSummary(criteria: ComparablesCriteria): string {
  const parts = [
    `Zip ${criteria.zip}`,
    `${criteria.beds} bed ±1 / ${criteria.baths} bath ±1`,
    criteria.vintageLabel,
    "±1 bucket",
  ];
  if (criteria.lotAcres != null) {
    parts.push(`${fmtAcres(criteria.lotAcres)} ±40%`);
  }
  return parts.join(" · ");
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
    setLoading(true);
    setLoadError(null);

    fetch(comparablesUrl, {
      cache: "default",
    })
      .then(async (r) => {
        if (!r.ok) {
          throw new Error(
            r.status === 404 ? "Listing not found." : "Couldn't load comparables.",
          );
        }
        return r.json() as Promise<ComparablesResponse>;
      })
      .then((d) => {
        if (cancelled) return;
        setData(d);
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

  const sortedSold = useMemo(
    () => sortSoldComparables(sold, soldSort.key, soldSort.dir),
    [sold, soldSort],
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

  const soldCap = Math.min(sortedSold.length, COMP_MAX_VISIBLE);
  const activeCap = Math.min(sortedActive.length, COMP_MAX_VISIBLE);
  const visibleSold = sortedSold.slice(0, Math.min(soldVisibleCount, soldCap));
  const visibleActive = sortedActive.slice(
    0,
    Math.min(activeVisibleCount, activeCap),
  );
  const canShowMoreSold =
    soldVisibleCount < soldCap && sortedSold.length > soldVisibleCount;
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
          Matching {criteriaSummary(criteria)}
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
            We match same zip, beds within ±1, baths within ±1, similar vintage (±1 bucket), and lot size when available.
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
            Matches require the same zip, beds within ±1, baths within ±1, vintage within ±1 bucket
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
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 mb-3">
            <p className={sectionTitleClass}>{recentlyClosedLabel}</p>
            {sold.length > 0 ? (
              <CompSortLinks
                options={[
                  { key: "score", label: "Score" },
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
          {sold.length > 0 ? (
            <>
              <ul className="space-y-3">
                {visibleSold.map((comp) => (
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
              {canShowMoreSold ? (
                <CompShowMoreButton
                  theme={sortTheme}
                  onClick={() =>
                    setSoldVisibleCount((n) =>
                      Math.min(n + COMP_SHOW_MORE_STEP, COMP_MAX_VISIBLE),
                    )
                  }
                />
              ) : null}
            </>
          ) : (
            <p className={isModal ? "text-slate text-sm" : "text-white/50 text-sm"}>
              {recentlyClosedEmptyLabel}
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
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 mb-3">
            <p className={sectionTitleClass}>
              {isPage ? "ON MARKET" : "On market"}
            </p>
            {active.length > 0 ? (
              <CompSortLinks
                options={[
                  { key: "default", label: "Match" },
                  { key: "score", label: "Score" },
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
