"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { StatsCalcTooltipShell } from "@/components/StatsCalcTooltip";
import MarketPulseDeltaLabel from "@/components/MarketPulseDeltaLabel";
import MarketPulseTownPulse, {
  marketPulseTownMetrics,
} from "@/components/MarketPulseTownPulse";
import MarketPulseTownPanel from "@/components/MarketPulseTownPanel";
import { marketPulseTownScale } from "@/lib/market-pulse-town-scale";
import {
  BAR_ASIDE_LABEL_CLASS,
  BAR_EXTERIOR_LANE,
  BAR_VALUE_ON_EMPTY,
  barAsidePlacement,
  fmtActive,
  fmtDom,
  fmtMos,
  formatMetricValue,
  type MetricValueKind,
  BarValueOverlay,
  METRIC_COLORS,
} from "@/components/market-pulse-bar";
import ModalPortal, { MODAL_PANEL_CLASS } from "@/components/ModalPortal";
import type { ListingKind } from "@/lib/listing-kind";
import { fmtMoney } from "@/lib/listing-history";
import { type MarketDigestSnapshot } from "@/lib/market-digest-types";
import type { MonthsSupplyPayload } from "@/lib/months-supply-types";
import {
  buildMarketPulseCombinedTownRows,
  type MarketPulseCombinedTownRow,
} from "@/lib/market-pulse-combined-rows";
import {
  DEFAULT_MARKET_PULSE_CHART_LAYOUT,
  DEFAULT_MARKET_PULSE_FAVOR_SORT,
  marketPulseFavorSortLabel,
  type MarketPulseChartLayout,
} from "@/lib/market-pulse-defaults";
import {
  sortRowsByBuyerFriendlyScore,
  unstackedFavorSortDir,
  type MarketPulseFavorSort,
} from "@/lib/market-pulse-favorability";
import {
  formatPriceDeltaK,
  formatPriceDeltaPct,
  meanMinusMedian,
  PRICE_DELTA_EXPLAIN,
} from "@/lib/market-pulse-price-delta";
import {
  formatSaleToAskPct,
  marketPulseDeltaBarSpan,
  marketPulsePriceBarMax,
  marketPulsePricePct,
} from "@/lib/market-pulse-stacked-metrics";
import {
  DEFAULT_MARKET_PULSE_LOOKBACK_ID,
  MARKET_PULSE_LOOKBACK_OPTIONS,
  marketPulseLookbackById,
  marketPulseLookbackChartLabel,
  marketPulseLookbackIdAt,
  marketPulseLookbackIndex,
  formatClosedCountWithLookback,
  monthsSupplyFromLookbackWindow,
  type MarketPulseLookbackId,
} from "@/lib/market-pulse-lookback";
import {
  MARKET_PULSE_SETTLE_IDLE,
  randomBarPercents,
  settleAllTownsLabel,
  settleBarPercent,
  settleIntDisplay,
  settleMosDisplay,
  settleSignedNumber,
  type MarketPulseSettleState,
} from "@/lib/market-pulse-settle";
import type { StatsValueCalc } from "@/lib/stats-compute";
import { splitSentences } from "@/lib/split-sentences";

type ChartLayout = MarketPulseChartLayout;
type FavorSort = MarketPulseFavorSort;
type MetricSortDir = "asc" | "desc";

/** Rentals are leased, not closed, and every label that says so follows. */
function closedNounFor(kind: ListingKind): { title: string; lower: string } {
  return kind === "rental"
    ? { title: "Leased", lower: "leases" }
    : { title: "Closed sales", lower: "closed sales" };
}


function ClosedLookbackSlider({
  lookbackId,
  onChange,
  pending,
  fill = false,
}: {
  lookbackId: MarketPulseLookbackId;
  onChange: (id: MarketPulseLookbackId) => void;
  pending?: boolean;
  /** Take the height of whatever it stands beside instead of a fixed rail. */
  fill?: boolean;
}) {
  const index = marketPulseLookbackIndex(lookbackId);
  const current = marketPulseLookbackChartLabel(lookbackId);
  const lastIndex = MARKET_PULSE_LOOKBACK_OPTIONS.length - 1;
  // The selected label is centred on its tick and so overhangs the rail by half
  // its height at either end; the gap below keeps the top one off the caption.
  const body = (
    <div
      className={`flex flex-col gap-2 ${
        // Filling takes the height of the block alongside. The rail has to be
        // taken out of flow to do that, or the range input's own intrinsic
        // length would set the height and drag the block taller with it.
        fill ? "absolute inset-0" : "h-56 w-[4.75rem] shrink-0 sm:w-20"
      }`}
    >
      <span className="[font-family:var(--mp-mono-font)] text-[8px] font-semibold tracking-[0.16em] uppercase text-[var(--mp-text)]">
        Lookback
      </span>
      <div className="relative flex min-h-0 flex-1 items-stretch">
        <div className="relative flex w-3 shrink-0 items-center justify-center">
          <div
            className="pointer-events-none absolute inset-y-1 left-1/2 z-0 w-px -translate-x-1/2 bg-[var(--mp-hairline,rgba(0,0,0,0.15))]"
            aria-hidden
          />
          <input
            type="range"
            min={0}
            max={lastIndex}
            step={1}
            value={index}
            aria-label="Lookback"
            aria-valuetext={`${current}${pending ? " loading" : ""}`}
            onChange={(e) =>
              onChange(marketPulseLookbackIdAt(Number(e.target.value)))
            }
            className="mp-lookback-slider-vert relative z-[1] cursor-pointer appearance-none bg-transparent"
          />
        </div>
        {/*
         * Each notch is pinned to its own share of the rail rather than laid out
         * in a column, so the enlarged selected label grows around its tick
         * instead of shoving its neighbours off the mark they name. Ticks sit
         * beside the rail, not over it, so they never swallow a thumb drag.
         */}
        <div className="relative min-w-0 flex-1">
          <div className="absolute inset-x-0 inset-y-1">
            {MARKET_PULSE_LOOKBACK_OPTIONS.map((opt, i) => {
              const selected = opt.id === lookbackId;
              return (
                <button
                  key={opt.id}
                  type="button"
                  tabIndex={-1}
                  aria-label={opt.label}
                  onClick={() => onChange(opt.id)}
                  style={{ top: `${100 - (i / lastIndex) * 100}%` }}
                  className="absolute left-0 flex -translate-y-1/2 items-center gap-1 whitespace-nowrap"
                >
                  <span
                    aria-hidden
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                      selected
                        ? "bg-[var(--mp-accent)]"
                        : "bg-[var(--mp-text)]/25"
                    }`}
                  />
                  <span
                    className={`[font-family:var(--mp-mono-font)] tabular-nums leading-none uppercase ${
                      selected
                        ? "text-[16px] text-[var(--mp-accent)]"
                        : "text-[8px] text-[var(--mp-muted-text)] hover:text-[var(--mp-text)]"
                    }`}
                  >
                    {opt.label}
                    {selected && pending ? "…" : ""}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );

  if (!fill) return body;
  return (
    <div className="relative w-[4.75rem] shrink-0 self-stretch sm:w-20">
      {body}
    </div>
  );
}

function marketPulseSortExplain(
  chartLayout: ChartLayout,
  favorSort: FavorSort,
): string {
  if (favorSort === "default") {
    return "Towns stay in default town order. All towns stays on top. Choose Seller Friendly or Buyer Friendly to reorder.";
  }
  if (chartLayout === "stacked") {
    return `Sorted by buyer/seller friendly composite (months supply, avg days on market, closed, median, delta, average — ${
      favorSort === "sellers"
        ? "seller-friendly direction"
        : "buyer-friendly direction"
    }). All towns stays on top.`;
  }
  return `Each unstacked chart sorts on its own metric (${
    favorSort === "sellers"
      ? "Seller: MOS↓, DOM↓, closed↑, median/delta/avg↑"
      : "Buyer: MOS↑, DOM↑, closed↓, median/delta/avg↓"
  }). All towns stays on top.`;
}

/** Town minus All-towns. Positive means the town is higher than the market. */
function fmtSignedDelta(
  town: number | null | undefined,
  all: number | null | undefined,
  kind: "int" | "mos" | "dom",
): string | null {
  if (town == null || all == null || !Number.isFinite(town) || !Number.isFinite(all)) {
    return null;
  }
  const raw = town - all;
  if (kind === "mos") {
    if (Math.abs(raw) < 0.05) return "even";
    const abs = Math.abs(raw).toFixed(1);
    return `${raw > 0 ? "+" : "−"}${abs} mo`;
  }
  const rounded = Math.round(raw);
  if (rounded === 0) return "even";
  const abs =
    kind === "dom" ? `${Math.abs(rounded)}d` : String(Math.abs(rounded));
  return `${rounded > 0 ? "+" : "−"}${abs}`;
}

function cityLabel(row: { city: string }): string {
  const city = row.city?.trim() || "—";
  if (city.toLowerCase() === "all") return "All towns";
  return city;
}

function chartRows(snapshot: MarketDigestSnapshot): MonthsSupplyPayload[] {
  const rows: MonthsSupplyPayload[] = [];
  if (snapshot.market) rows.push(snapshot.market);
  for (const town of snapshot.towns) {
    if (
      snapshot.market &&
      town.city.trim().toLowerCase() === snapshot.market.city.trim().toLowerCase()
    ) {
      continue;
    }
    rows.push(town);
  }
  return rows;
}

function cityKey(city: string): string {
  return city.trim().toLowerCase();
}

function isAllTownsCity(city: string): boolean {
  const t = cityKey(city);
  return t === "all" || t === "all towns";
}

function visibleTownRows<T extends { city: string }>(
  rows: readonly T[],
  expanded: boolean,
): T[] {
  if (expanded) return [...rows];
  const all = rows.filter((r) => isAllTownsCity(r.city));
  return all.length > 0 ? all : [...rows];
}

function rotatingTownNames(rows: readonly { city: string }[]): string[] {
  return rows
    .filter((row) => !isAllTownsCity(row.city))
    .map((row) => cityLabel(row));
}

const TOWN_METRICS_HEADING_CLASS =
  "[font-family:var(--mp-mono-font)] text-[11px] tracking-[0.16em] uppercase text-[var(--mp-accent)] mb-3 inline-flex flex-wrap items-baseline gap-x-1.5";

const TOWN_NAME_CLASS =
  "[font-family:var(--mp-heading-font)] text-sm text-[var(--mp-text)] underline decoration-[var(--mp-text)] underline-offset-2 hover:text-[var(--mp-accent)] hover:decoration-[var(--mp-accent)] transition-colors";

function TownMetricsLayoutWord({
  label,
  selected,
  onSelect,
}: {
  label: "stacked" | "unstacked";
  selected: boolean;
  onSelect: () => void;
}) {
  const text = label === "unstacked" ? "Unstacked" : "stacked";
  if (selected) {
    return (
      <span className="font-semibold text-[var(--mp-accent)]" aria-current="true">
        {text}
      </span>
    );
  }
  return (
    <button
      type="button"
      aria-label={`Show ${text} town metrics`}
      onClick={onSelect}
      className="underline decoration-[var(--mp-text)]/35 underline-offset-2 hover:text-[var(--mp-text)] hover:decoration-[var(--mp-text)]/55"
    >
      {text}
    </button>
  );
}

function TownName({
  city,
  label,
  href,
  townsExpanded,
  onAllTownsToggle,
  settle,
  rotateTownNames,
}: {
  city: string;
  label: string;
  href?: string;
  townsExpanded: boolean;
  onAllTownsToggle: () => void;
  settle?: MarketPulseSettleState;
  rotateTownNames?: readonly string[];
}) {
  if (isAllTownsCity(city)) {
    const rotating = settleAllTownsLabel(
      settle ?? MARKET_PULSE_SETTLE_IDLE,
      rotateTownNames ?? [],
    );
    const shown = rotating ?? label;
    return (
      <button
        type="button"
        aria-expanded={townsExpanded}
        aria-label={
          townsExpanded
            ? "All towns, hide other towns"
            : "All towns, show other towns"
        }
        onClick={onAllTownsToggle}
        className={`${TOWN_NAME_CLASS} inline-flex items-baseline gap-1.5`}
      >
        {!townsExpanded ? (
          <span
            className="font-mono text-[13px] no-underline text-[var(--mp-accent)] animate-intel-middle-tier-arrow-down"
            aria-hidden
          >
            ↓
          </span>
        ) : null}
        <span
          key={shown}
          className={
            rotating
              ? "inline-block animate-[fadeIn_0.18s_ease-out]"
              : "inline-block"
          }
        >
          {shown}
        </span>
        <span aria-hidden className="font-mono text-[11px] no-underline tabular-nums text-[var(--mp-muted-text)]">
          {townsExpanded ? "−" : "+"}
        </span>
      </button>
    );
  }
  if (href) {
    return (
      <Link href={href} className={`${TOWN_NAME_CLASS} truncate`}>
        {label}
      </Link>
    );
  }
  return (
    <span className="[font-family:var(--mp-heading-font)] text-sm text-[var(--mp-text)] truncate">
      {label}
    </span>
  );
}

function FavorSortToggle({
  favorSort,
  onToggle,
}: {
  favorSort: FavorSort;
  onToggle: () => void;
}) {
  const buyers = favorSort === "buyers";
  const current =
    favorSort === "buyers" || favorSort === "sellers"
      ? marketPulseFavorSortLabel(favorSort)
      : marketPulseFavorSortLabel("sellers");
  const next = buyers ? "Seller Friendly" : "Buyer Friendly";
  return (
    <button
      type="button"
      onClick={onToggle}
      title={`Flip to ${next}`}
      aria-label={`Sort by ${current}. Flip to ${next}`}
      className="inline-flex min-w-0 items-baseline gap-1.5 [font-family:var(--mp-mono-font)] text-[10px] tracking-[0.12em] uppercase text-[var(--mp-text)] hover:text-[var(--mp-accent)]"
    >
      <span className="text-[var(--mp-muted-text)]">Sort</span>
      <span className="underline decoration-[var(--mp-text)]/35 underline-offset-2">
        {current}
      </span>
    </button>
  );
}

/** Per-metric ASC/DESC for unstacked charts — All towns always stays on top. */
function sortRowsByMetricValue<Row extends { city: string }>(
  rows: readonly Row[],
  valueOf: (row: Row) => number | null,
  dir: MetricSortDir,
): Row[] {
  const all: Row[] = [];
  const rest: Row[] = [];
  for (const row of rows) {
    if (isAllTownsCity(row.city)) all.push(row);
    else rest.push(row);
  }
  const rank = (row: Row) => {
    const v = valueOf(row);
    return v != null && Number.isFinite(v) ? v : null;
  };
  rest.sort((a, b) => {
    const av = rank(a);
    const bv = rank(b);
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    return dir === "asc" ? av - bv : bv - av;
  });
  return [...all, ...rest];
}

/**
 * Same row the email builds from — kept as an alias rather than a second local
 * shape so a new cached metric cannot reach one surface and miss the other.
 */
type CombinedTownRow = MarketPulseCombinedTownRow;

const buildCombinedTownRows = buildMarketPulseCombinedTownRows;

function BarChart<Row extends { city: string }>({
  title,
  rows,
  valueOf,
  valueKind,
  barClassName,
  emptyMessage,
  townHref,
  settle,
  calcOf,
  sortable = false,
  favorSortDir = null,
  sortValueOf,
  formatValue,
  formatValueAside,
  asideNegative,
  explainDelta = false,
  scaleMax,
  barSpanOf,
  townsExpanded = true,
  onAllTownsToggle,
}: {
  title: string;
  rows: Row[];
  valueOf: (row: Row) => number | null;
  valueKind: MetricValueKind;
  barClassName: string;
  emptyMessage: string;
  townHref?: (cityLabel: string) => string;
  settle: MarketPulseSettleState;
  /** Cached methodology from stats / closed cache — never computed in the client. */
  calcOf?: (row: Row) => StatsValueCalc | undefined;
  /** Unstacked only — ASC/DESC arrows beside the title. */
  sortable?: boolean;
  /** Seller/Buyer Friendly per-chart direction until the visitor picks arrows. */
  favorSortDir?: MetricSortDir | null;
  /** Sort key when it differs from bar width (e.g. signed delta vs abs). */
  sortValueOf?: (row: Row) => number | null;
  formatValue?: (row: Row, display: number | null, index: number) => string;
  /** Percent (or other) shown against the bar itself, not beside the dollar amount. */
  formatValueAside?: (row: Row, index: number) => string;
  /** Settled sign of that percent — it decides which side of the fill it takes. */
  asideNegative?: (row: Row) => boolean;
  /** Title “Delta” is a link with the mean-vs-median popup. */
  explainDelta?: boolean;
  /** When set (Median / Average / Delta), bars share one dollar axis. */
  scaleMax?: number;
  /** Delta: bar starts at one price-axis end and stops at the other. */
  barSpanOf?: (row: Row) => {
    start: number | null;
    end: number | null;
  };
  townsExpanded?: boolean;
  onAllTownsToggle?: () => void;
}) {
  const [barScramble, setBarScramble] = useState<number[] | null>(null);
  /** null = use favorSortDir / snapshot order until the visitor picks a direction. */
  const [sortDir, setSortDir] = useState<MetricSortDir | null>(null);

  useEffect(() => {
    setSortDir(null);
  }, [favorSortDir]);

  useEffect(() => {
    if (settle.phase !== "scramble" || rows.length === 0) {
      setBarScramble(null);
      return;
    }
    setBarScramble(randomBarPercents(rows.length));
  }, [settle.phase, settle.tick, rows.length]);

  const effectiveSort = sortDir ?? favorSortDir ?? null;
  const rankOf = sortValueOf ?? valueOf;

  const displayRows = useMemo(() => {
    if (!sortable || !effectiveSort) return rows;
    return sortRowsByMetricValue(rows, rankOf, effectiveSort);
  }, [rows, sortable, effectiveSort, rankOf]);

  const titleRow = (
    <div className="mb-4 flex items-center justify-between gap-3">
      <p className="min-w-0 [font-family:var(--mp-mono-font)] text-[11px] tracking-[0.16em] uppercase text-[var(--mp-accent)]">
        {explainDelta ? (
          <>
            <MarketPulseDeltaLabel />
            {title.replace(/^Delta/, "")}
          </>
        ) : (
          title
        )}
      </p>
      {sortable ? (
        <div
          className="inline-flex shrink-0 items-center gap-px"
          role="group"
          aria-label={`Sort ${title}`}
        >
          <button
            type="button"
            aria-label="Sort ascending"
            aria-pressed={effectiveSort === "asc"}
            title="Ascending"
            onClick={() => setSortDir("asc")}
            className={`px-0.5 font-mono text-[11px] leading-none transition-colors ${
              effectiveSort === "asc"
                ? "text-[var(--mp-accent)]"
                : "text-[var(--mp-muted-text)]/45 hover:text-[var(--mp-muted-text)]"
            }`}
          >
            ▲
          </button>
          <button
            type="button"
            aria-label="Sort descending"
            aria-pressed={effectiveSort === "desc"}
            title="Descending"
            onClick={() => setSortDir("desc")}
            className={`px-0.5 font-mono text-[11px] leading-none transition-colors ${
              effectiveSort === "desc"
                ? "text-[var(--mp-accent)]"
                : "text-[var(--mp-muted-text)]/45 hover:text-[var(--mp-muted-text)]"
            }`}
          >
            ▼
          </button>
        </div>
      ) : null}
    </div>
  );

  if (rows.length === 0) {
    return (
      <section>
        {sortable ? (
          titleRow
        ) : (
          <p className="[font-family:var(--mp-mono-font)] text-[11px] tracking-[0.16em] uppercase text-[var(--mp-accent)] mb-3">
            {title}
          </p>
        )}
        <p className="[font-family:var(--mp-heading-font)] text-sm text-[var(--mp-muted-text)]">
          {emptyMessage}
        </p>
      </section>
    );
  }

  const visibleRows = onAllTownsToggle
    ? visibleTownRows(displayRows, townsExpanded)
    : displayRows;
  const rotateNames = rotatingTownNames(displayRows);
  const ownMax = Math.max(
    0,
    ...displayRows.map((r) => {
      const v = valueOf(r);
      return v != null && Number.isFinite(v) ? v : 0;
    }),
  );
  const max =
    scaleMax != null && Number.isFinite(scaleMax) && scaleMax > 0
      ? scaleMax
      : ownMax;

  const widthTransition =
    settle.phase === "scramble"
      ? "duration-300"
      : settle.phase === "countup"
        ? "duration-75"
        : "duration-150";

  return (
    <section>
      {titleRow}
      <ul className="space-y-2.5">
        {visibleRows.map((row, index) => {
          const v = valueOf(row);
          const settled =
            max > 0 && v != null && Number.isFinite(v) ? (v / max) * 100 : 0;
          const span = barSpanOf?.(row);
          const startPct = span
            ? settleBarPercent(
                marketPulsePricePct(span.start, max),
                index,
                settle,
                barScramble,
              )
            : 0;
          const endPct = span
            ? settleBarPercent(
                marketPulsePricePct(span.end, max),
                index,
                settle,
                barScramble,
              )
            : settleBarPercent(settled, index, settle, barScramble);
          const aligned = span
            ? marketPulseDeltaBarSpan(startPct, endPct)
            : { leftPct: 0, widthPct: endPct };
          const display =
            valueKind === "mos"
              ? settleMosDisplay(v, settle, index)
              : settleIntDisplay(v, settle, index);
          const label = cityLabel(row);
          const href = townHref?.(row.city ?? label);
          const valueText = formatValue
            ? formatValue(row, display, index)
            : formatMetricValue(valueKind, display);
          const calc = calcOf?.(row);
          const metricLabel =
            valueKind === "mos"
              ? "Months supply"
              : valueKind === "dom"
                ? "Avg days on market"
                : valueKind === "money"
                  ? title.startsWith("Average")
                    ? "Average"
                    : title.startsWith("Median")
                      ? "Median"
                      : "Delta"
                  : title.startsWith("Closed") || title.startsWith("Leased")
                    ? title.split(" —")[0]
                    : "Active inventory";
          const asideText = formatValueAside?.(row, index);
          const asidePlacement = barAsidePlacement(
            aligned.leftPct,
            aligned.widthPct,
            asideNegative?.(row) ?? false,
          );
          const townName = onAllTownsToggle ? (
            <TownName
              city={row.city ?? label}
              label={label}
              href={href}
              townsExpanded={townsExpanded}
              onAllTownsToggle={onAllTownsToggle}
              settle={settle}
              rotateTownNames={rotateNames}
            />
          ) : href ? (
            <Link
              href={href}
              className="[font-family:var(--mp-heading-font)] text-sm text-[var(--mp-text)] truncate underline decoration-[var(--mp-text)] underline-offset-2 hover:text-[var(--mp-accent)] hover:decoration-[var(--mp-accent)] transition-colors"
            >
              {label}
            </Link>
          ) : (
            <span className="[font-family:var(--mp-heading-font)] text-sm text-[var(--mp-text)] truncate">
              {label}
            </span>
          );
          return (
            <li
              key={`${row.city}-${title}`}
              data-mp-town={row.city}
              className="grid grid-cols-[4.75rem_1fr] items-center gap-1.5 sm:grid-cols-[7.5rem_1fr] sm:gap-2"
            >
              {asidePlacement === "label" && asideText ? (
                <span className="flex min-w-0 items-baseline gap-1">
                  <span className="min-w-0 truncate">{townName}</span>
                  <span className={BAR_ASIDE_LABEL_CLASS}>{asideText}</span>
                </span>
              ) : (
                townName
              )}
              <div
                className={`group relative h-4 rounded-sm bg-[var(--mp-track,rgba(0,0,0,0.10))] overflow-visible ${BAR_EXTERIOR_LANE}`}
              >
                <div className="h-full overflow-hidden rounded-sm">
                  <div
                    className={`h-full rounded-sm transition-[width,margin-left] ease-out ${widthTransition} ${barClassName}`}
                    style={{
                      marginLeft: `${aligned.leftPct}%`,
                      width: `${aligned.widthPct}%`,
                    }}
                  />
                </div>
                <BarValueOverlay
                  value={valueText}
                  aside={asideText}
                  asidePlacement={asidePlacement}
                  leftPct={aligned.leftPct}
                  widthPct={aligned.widthPct}
                  // Gold months-supply fill reads fine under the standard text,
                  // so it keeps it instead of flipping to cream.
                  colorClass={valueKind === "mos" ? BAR_VALUE_ON_EMPTY : undefined}
                />
                <div
                  className="pointer-events-none absolute left-1/2 bottom-[calc(100%+6px)] z-20 w-max max-w-[min(280px,70vw)] -translate-x-1/2 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
                  role="tooltip"
                >
                  <StatsCalcTooltipShell
                    label={label}
                    valueLine={`${valueText} · ${metricLabel}`}
                    calc={calc}
                    theme="light"
                  />
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** One town block with four stacked metric bars (each normalized to its own max). */
function CombinedMetricsChart({
  title,
  rows,
  townHref,
  settle,
  closedLookbackLabel,
  lookbackId,
  closedPending = false,
  closedBarMax = 0,
  townsExpanded,
  onAllTownsToggle,
  scopeLabel,
  saleToAskTownHref,
  kind,
  lookbackRail,
}: {
  title?: ReactNode;
  rows: CombinedTownRow[];
  townHref?: (cityLabel: string) => string;
  /** Turns the List to ask row label into a link to its Stats chart. */
  saleToAskTownHref?: (cityLabel: string) => string;
  kind: ListingKind;
  /** Lookback control, stood beside the All towns block and sized to it. */
  lookbackRail?: ReactNode;
  settle: MarketPulseSettleState;
  closedLookbackLabel: string;
  lookbackId: MarketPulseLookbackId;
  closedPending?: boolean;
  /** 24-month Closed max — 7d bars stay a slice of this, not 100%. */
  closedBarMax?: number;
  townsExpanded: boolean;
  onAllTownsToggle: () => void;
  /** Active tab scope for the heat strip tooltip, e.g. `sales` / `rentals`. */
  scopeLabel: string;
}) {
  const metrics = marketPulseTownMetrics(closedLookbackLabel, kind);
  const [barScramble, setBarScramble] = useState<number[] | null>(null);

  useEffect(() => {
    if (settle.phase !== "scramble" || rows.length === 0) {
      setBarScramble(null);
      return;
    }
    // One extra slot per row so the heat marker scrambles on its own number.
    setBarScramble(randomBarPercents(rows.length * (metrics.length + 1)));
  }, [settle.phase, settle.tick, rows.length, metrics.length]);

  const scale = useMemo(
    () =>
      marketPulseTownScale(rows, {
        closedLookbackLabel,
        kind,
        closedBarMax,
      }),
    [rows, closedLookbackLabel, kind, closedBarMax],
  );

  if (rows.length === 0) {
    return (
      <section>
        {title ? (
          <p className={TOWN_METRICS_HEADING_CLASS}>{title}</p>
        ) : null}
        <p className="[font-family:var(--mp-heading-font)] text-sm text-[var(--mp-muted-text)]">
          No town rows in cache yet.
        </p>
      </section>
    );
  }

  const rotateNames = rotatingTownNames(rows);

  return (
    <section>
      {title ? <p className={TOWN_METRICS_HEADING_CLASS}>{title}</p> : null}
      <ul className="space-y-3">
        {visibleTownRows(rows, townsExpanded).map((row, rowIndex) => {
          const label = cityLabel(row);
          const href = townHref?.(row.city ?? label);
          const block = (
            <MarketPulseTownPulse
              row={row}
              scale={scale}
              metrics={metrics}
              lookbackId={lookbackId}
              kind={kind}
              scopeLabel={scopeLabel}
              townLabel={label}
              saleToAskHref={saleToAskTownHref?.(label)}
              closedPending={closedPending}
              settle={settle}
              scramble={{
                values: barScramble,
                rowIndex,
                townCount: rows.length,
              }}
              heading={
                <TownName
                  city={row.city ?? label}
                  label={label}
                  href={href}
                  townsExpanded={townsExpanded}
                  onAllTownsToggle={onAllTownsToggle}
                  settle={settle}
                  rotateTownNames={rotateNames}
                />
              }
            />
          );
          return (
            <li
              key={`combined-${row.city}`}
              data-mp-town={row.city}
              className="space-y-1"
            >
              {/*
               * The rail stands alongside the first block only, and stretches to
               * it, so it runs from the All towns name to its last bar and no
               * further. Towns below it are not indented past empty space.
               */}
              {rowIndex === 0 && lookbackRail ? (
                <div className="flex items-stretch gap-2 sm:gap-3">
                  <div className="min-w-0 flex-1 space-y-1">{block}</div>
                  {lookbackRail}
                </div>
              ) : (
                block
              )}
              {/*
               * The same town drawn the way the listing showcase draws it, sat
               * directly under the brief's own rendering so the two can be read
               * against each other. Sample only — drop this branch to retire it.
               */}
              {rowIndex === 0 ? (
                <div className={`mt-4 ${BAR_EXTERIOR_LANE}`}>
                  <MarketPulseTownPanel
                    row={row}
                    scale={scale}
                    metrics={metrics}
                    lookbackId={lookbackId}
                    kind={kind}
                    townLabel={label}
                    closedPending={closedPending}
                    caption="Format sample · listing showcase treatment"
                  />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Kpi({
  label,
  final,
  kind,
  settle,
  salt,
  compareCity = null,
  compareValue = null,
}: {
  label: string;
  final: number | null | undefined;
  kind: "int" | "mos" | "dom";
  settle: MarketPulseSettleState;
  salt: number;
  /** Town currently under the floating strip. All-towns / null keeps market totals. */
  compareCity?: string | null;
  compareValue?: number | null;
}) {
  const comparing = Boolean(compareCity && !isAllTownsCity(compareCity));
  const shownLabel =
    comparing && kind === "mos" ? "Months Inventory" : label;
  const value = comparing ? compareValue : final;
  const display =
    comparing
      ? value
      : kind === "mos"
        ? settleMosDisplay(final, settle, salt)
        : settleIntDisplay(final, settle, salt);
  const empty = value == null && (comparing || settle.phase === "done");
  const text = empty
    ? "—"
    : kind === "mos"
      ? fmtMos(display)
      : kind === "dom"
        ? fmtDom(display)
        : fmtActive(display);
  const delta = comparing ? fmtSignedDelta(compareValue, final, kind) : null;

  return (
    <div className="rounded-lg border border-[var(--mp-hairline,rgba(0,0,0,0.08))] bg-[var(--mp-page-bg)] px-3 py-4 text-center">
      <p className="[font-family:var(--mp-mono-font)] text-[10px] tracking-[0.1em] uppercase text-[var(--mp-muted-text)] mb-1.5 leading-tight">
        {shownLabel}
      </p>
      <p className="[font-family:var(--mp-heading-font)] text-2xl text-[var(--mp-text)] leading-tight tabular-nums">
        {text}
      </p>
      {comparing ? (
        <p className="mt-1 [font-family:var(--mp-mono-font)] text-[10px] tabular-nums leading-tight text-[var(--mp-muted-text)]">
          {delta ?? "—"}
          <span className="block tracking-[0.08em] uppercase">
            vs All towns
          </span>
        </p>
      ) : null}
    </div>
  );
}

/**
 * Web presentation of the Monday market brief snapshot (Market Pulse).
 * Same data as the email; refine layout here over time.
 */
export default function WeeklyBriefContent({
  snapshot,
  etDate,
  eyebrow = "Market Pulse",
  scopeLabel = "sales",
  showDealOfTheWeek = true,
  dealHeading = "Deal of the Week",
  selectionLabel,
  townHref,
  monthsSupplyTownHref,
  closedSalesTownHref,
  avgDomTownHref,
  saleToAskTownHref,
  kind = "sale",
  settle = MARKET_PULSE_SETTLE_IDLE,
  closedPending = false,
  categoryFilter,
  lookbackId = DEFAULT_MARKET_PULSE_LOOKBACK_ID,
  onLookbackIdChange,
  closedBarMax = 0,
}: {
  snapshot: MarketDigestSnapshot;
  etDate: string;
  eyebrow?: string;
  /** Chart / footnote scope for the active category tab. */
  scopeLabel?: string;
  /** Property type the visitor picked, for chart titles (defaults to scope). */
  selectionLabel?: string;
  showDealOfTheWeek?: boolean;
  /** Heading above the featured deal card. */
  dealHeading?: string;
  /** Active inventory town labels → Intelligence. */
  townHref?: (cityLabel: string) => string;
  /** Months supply town labels → Stats months-supply chart. */
  monthsSupplyTownHref?: (cityLabel: string) => string;
  /** Closed-sales town labels → Stats sales-by-month chart. */
  closedSalesTownHref?: (cityLabel: string) => string;
  /** Avg DOM town labels → Stats avg-dom chart. */
  avgDomTownHref?: (cityLabel: string) => string;
  /** List to ask → Stats list-to-ask chart (its own graph and data table). */
  saleToAskTownHref?: (cityLabel: string) => string;
  /** Rentals are leased rather than closed, and the labels follow. */
  kind?: ListingKind;
  /** Shared settle clock from Market Pulse (scramble → count-up). */
  settle?: MarketPulseSettleState;
  /** Closed totals still in flight — otherwise empty means "cache not built". */
  closedPending?: boolean;
  /**
   * Property-type pills (All / SFR / …). Own +/- disclosure — not a boxed panel.
   */
  categoryFilter?: ReactNode;
  /** Closed-sales lookback window (Inventory / avg DOM stay current). */
  lookbackId?: MarketPulseLookbackId;
  onLookbackIdChange?: (id: MarketPulseLookbackId) => void;
  /** 24-month Closed max so 7d bars stay ~1% of that axis. */
  closedBarMax?: number;
}) {
  const [chartLayout, setChartLayout] = useState<ChartLayout>(
    DEFAULT_MARKET_PULSE_CHART_LAYOUT,
  );
  const [favorSort, setFavorSort] = useState<FavorSort>(
    DEFAULT_MARKET_PULSE_FAVOR_SORT,
  );
  const [townsExpanded, setTownsExpanded] = useState(false);
  const [sortExplainOpen, setSortExplainOpen] = useState(false);
  const kpiSentinelRef = useRef<HTMLDivElement>(null);
  const pinnedKpiBarRef = useRef<HTMLDivElement>(null);
  const [kpisPinned, setKpisPinned] = useState(false);
  const [navOffsetPx, setNavOffsetPx] = useState(96);
  const [compareCity, setCompareCity] = useState<string | null>(null);

  useEffect(() => {
    if (!townsExpanded && chartLayout !== "stacked") {
      setChartLayout("stacked");
    }
  }, [townsExpanded, chartLayout]);
  const closedLookbackLabel = marketPulseLookbackChartLabel(lookbackId);
  const closedNoun = closedNounFor(kind);
  const lookbackDays = marketPulseLookbackById(lookbackId).days;
  const lookbackDrivesMos = lookbackId !== DEFAULT_MARKET_PULSE_LOOKBACK_ID;

  const inventoryRows = useMemo(() => {
    const rows = chartRows(snapshot);
    if (!lookbackDrivesMos || closedPending) return rows;
    const closedBy = new Map(
      (snapshot.closedTrailing ?? []).map(
        (r) => [cityKey(r.city), r.count] as const,
      ),
    );
    return rows.map((row) => {
      const closedCount = closedBy.get(cityKey(row.city)) ?? null;
      const monthsSupply = monthsSupplyFromLookbackWindow(
        row.activeCount,
        closedCount,
        lookbackDays,
      );
      return {
        ...row,
        monthsSupply,
        monthsSupplyCalc: {
          summary:
            monthsSupply == null
              ? `No months supply for this ${closedLookbackLabel} window (no closings).`
              : `${row.activeCount.toLocaleString()} active ÷ ${(closedCount ?? 0).toLocaleString()} closed over ${closedLookbackLabel} (as a monthly rate) = ${monthsSupply.toFixed(1)} mo supply in ${row.city}.`,
          detail: [
            "Inventory stays current. Months supply uses closed sales in the selected lookback.",
          ],
          inputs: {
            city: row.city,
            activeCount: row.activeCount,
            closedCount,
            days: lookbackDays,
            lookbackId,
            monthsSupply,
          },
        },
      };
    });
  }, [
    snapshot,
    lookbackDrivesMos,
    lookbackDays,
    closedLookbackLabel,
    lookbackId,
    closedPending,
  ]);
  const closedRows = snapshot.closedTrailing ?? [];
  const domRows = snapshot.avgDomByTown ?? [];
  const priceRows = snapshot.priceByTown ?? [];
  const priceBarMax = marketPulsePriceBarMax(priceRows);

  const allTownsAvgDom = useMemo(() => {
    const allRow = domRows.find((r) => isAllTownsCity(r.city));
    const v = allRow?.avgDaysOnMarket;
    return v != null && Number.isFinite(v) ? v : null;
  }, [domRows]);

  const allTownsMos = lookbackDrivesMos
    ? (inventoryRows.find((r) => isAllTownsCity(r.city))?.monthsSupply ?? null)
    : (snapshot.market?.monthsSupply ?? null);
  const allTownsActive = snapshot.market?.activeCount ?? null;

  const combinedRows = useMemo(() => {
    const built = buildCombinedTownRows(
      inventoryRows,
      domRows,
      closedRows,
      priceRows,
    );
    return sortRowsByBuyerFriendlyScore(
      built,
      (r) => ({
        monthsSupply: r.monthsSupply,
        avgDaysOnMarket: r.avgDaysOnMarket,
        closedCount: r.closedCount,
        medianPrice: r.medianPrice,
        priceDelta: r.priceDelta,
        averagePrice: r.averagePrice,
        saleToAskPct: r.saleToAskPct,
      }),
      favorSort,
      (r) => isAllTownsCity(r.city),
    );
  }, [inventoryRows, domRows, closedRows, priceRows, favorSort]);

  const compareRow = useMemo(() => {
    if (!compareCity || isAllTownsCity(compareCity)) return null;
    const key = cityKey(compareCity);
    return combinedRows.find((r) => cityKey(r.city) === key) ?? null;
  }, [compareCity, combinedRows]);

  useEffect(() => {
    const sentinel = kpiSentinelRef.current;
    if (!sentinel) {
      setKpisPinned(false);
      return;
    }
    const header = document.querySelector("header");
    let raf = 0;
    const update = () => {
      const offset = header?.getBoundingClientRect().bottom ?? 96;
      setNavOffsetPx(offset);
      const top = sentinel.getBoundingClientRect().top;
      const pinned = top < offset + 1;
      setKpisPinned(pinned);
      if (!pinned || !townsExpanded) {
        setCompareCity(null);
        return;
      }
      const barEl = pinnedKpiBarRef.current;
      if (!barEl) {
        raf = window.requestAnimationFrame(update);
        return;
      }
      const scanY = barEl.getBoundingClientRect().bottom + 8;
      const nodes = document.querySelectorAll<HTMLElement>("[data-mp-town]");
      let next: string | null = null;
      for (const el of nodes) {
        const r = el.getBoundingClientRect();
        if (r.top <= scanY) {
          const city = el.dataset.mpTown ?? null;
          if (city && !isAllTownsCity(city)) next = city;
        }
      }
      setCompareCity(next);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    const ro =
      header && typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(update)
        : null;
    if (header && ro) ro.observe(header);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      ro?.disconnect();
    };
  }, [townsExpanded, chartLayout, lookbackId]);

  const deal = showDealOfTheWeek ? snapshot.dealOfTheWeek : null;

  const townMetricsHeading = (
    <p className={TOWN_METRICS_HEADING_CLASS}>
      Town metrics
      <button
        type="button"
        className="align-super font-mono text-[12px] leading-none text-[var(--mp-accent)] hover:text-[var(--mp-text)]"
        aria-label="How towns are sorted"
        onClick={() => setSortExplainOpen(true)}
      >
        *
      </button>
      <TownMetricsLayoutWord
        label="stacked"
        selected={chartLayout === "stacked"}
        onSelect={() => setChartLayout("stacked")}
      />
      <span className="text-[var(--mp-accent)]/45" aria-hidden>
        {"-->"}
      </span>
      <TownMetricsLayoutWord
        label="unstacked"
        selected={chartLayout === "unstacked"}
        onSelect={() => {
          setTownsExpanded(true);
          setChartLayout("unstacked");
        }}
      />
    </p>
  );

  const comparingTown =
    compareRow && compareCity && !isAllTownsCity(compareCity)
      ? cityLabel({ city: compareCity })
      : null;

  const kpiStrip = (
    <div className="grid grid-cols-3 gap-2 sm:gap-3">
      <Kpi
        label="Market active"
        final={allTownsActive}
        kind="int"
        settle={settle}
        salt={1}
        compareCity={comparingTown ? compareCity : null}
        compareValue={compareRow?.activeCount ?? null}
      />
      <Kpi
        label="All Town Months Inventory"
        final={allTownsMos}
        kind="mos"
        settle={settle}
        salt={2}
        compareCity={comparingTown ? compareCity : null}
        compareValue={compareRow?.monthsSupply ?? null}
      />
      <Kpi
        label="Avg days on market"
        final={allTownsAvgDom}
        kind="dom"
        settle={settle}
        salt={3}
        compareCity={comparingTown ? compareCity : null}
        compareValue={compareRow?.avgDaysOnMarket ?? null}
      />
    </div>
  );

  return (
    <article className="mx-auto max-w-2xl">
      <header className="rounded-t-2xl bg-[var(--mp-surface)] px-3 py-6 sm:px-8 sm:py-7">
        <p className="[font-family:var(--mp-mono-font)] text-[11px] tracking-[0.2em] uppercase text-[var(--mp-accent)] mb-2">
          {eyebrow}
        </p>
        <h1 className="[font-family:var(--mp-heading-font)] text-2xl sm:text-3xl text-white leading-snug">
          {etDate}
        </h1>
        {/* Last / Next email live in MarketPulseHero — one stamp per page. */}
        <p className="mt-3 font-mono text-[11px]">
          <Link
            href="/stats"
            className="text-[var(--mp-accent)] underline underline-offset-2"
          >
            View live stats
          </Link>
        </p>
      </header>

      {kpisPinned ? (
        <div
          ref={pinnedKpiBarRef}
          className="fixed inset-x-0 z-40 border-b border-[var(--mp-hairline,rgba(0,0,0,0.08))] bg-[var(--mp-page-bg)]/95 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.28)] backdrop-blur-md"
          style={{ top: navOffsetPx }}
          data-mp-kpi-pinned
        >
          <div className="mx-auto max-w-2xl px-3 py-2 sm:px-8">
            {comparingTown ? (
              <p className="mb-1.5 [font-family:var(--mp-mono-font)] text-[10px] tracking-[0.12em] uppercase text-[var(--mp-accent)]">
                {comparingTown}
                <span className="text-[var(--mp-muted-text)]"> vs All towns</span>
              </p>
            ) : null}
            {kpiStrip}
          </div>
        </div>
      ) : null}

      <div className="rounded-b-2xl border border-t-0 border-[var(--mp-hairline,rgba(0,0,0,0.08))] bg-[var(--mp-card-bg)] px-3 py-6 sm:px-8 sm:py-7 space-y-8 shadow-sm shadow-black/5">
        <div
          ref={kpiSentinelRef}
          className={kpisPinned ? "invisible" : undefined}
        >
          {kpiStrip}
        </div>

        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
          {categoryFilter}
          <FavorSortToggle
            favorSort={favorSort}
            onToggle={() =>
              setFavorSort((current) =>
                current === "buyers" ? "sellers" : "buyers",
              )
            }
          />
        </div>

        <div className="space-y-6">
        {townMetricsHeading}
        {chartLayout === "stacked" || !townsExpanded ? (
          /*
           * Stacked hands the slider to the chart, which stands it beside the
           * All towns block alone. Every town below then keeps the full width
           * instead of being indented past a control that is not there.
           */
          <CombinedMetricsChart
            rows={combinedRows}
            townHref={townHref}
            settle={settle}
            closedLookbackLabel={closedLookbackLabel}
            lookbackId={lookbackId}
            closedPending={closedPending}
            closedBarMax={closedBarMax}
            townsExpanded={townsExpanded}
            onAllTownsToggle={() => setTownsExpanded((open) => !open)}
            scopeLabel={scopeLabel}
            saleToAskTownHref={saleToAskTownHref}
            kind={kind}
            lookbackRail={
              onLookbackIdChange ? (
                <ClosedLookbackSlider
                  lookbackId={lookbackId}
                  onChange={onLookbackIdChange}
                  pending={closedPending}
                  fill
                />
              ) : null
            }
          />
        ) : (
        <div className="flex items-start gap-2 sm:gap-3">
          <div className="min-w-0 flex-1 space-y-6">
          <>
        <BarChart
          title="Active inventory"
          rows={inventoryRows}
          valueOf={(r) => r.activeCount}
          valueKind="int"
          barClassName={METRIC_COLORS.inventory}
          emptyMessage="No inventory rows in cache yet."
          townHref={townHref}
          settle={settle}
          townsExpanded={townsExpanded}
          onAllTownsToggle={() => setTownsExpanded((open) => !open)}
          calcOf={(r) => r.activeCountCalc}
          sortable
          favorSortDir={unstackedFavorSortDir(favorSort, "inventory")}
        />

        <BarChart
          title="Months supply"
          rows={inventoryRows}
          valueOf={(r) => r.monthsSupply}
          valueKind="mos"
          barClassName={METRIC_COLORS.monthsSupply}
          emptyMessage="No months-supply rows in cache yet."
          townHref={monthsSupplyTownHref ?? townHref}
          settle={settle}
          townsExpanded={townsExpanded}
          onAllTownsToggle={() => setTownsExpanded((open) => !open)}
          calcOf={(r) => r.monthsSupplyCalc}
          sortable
          favorSortDir={unstackedFavorSortDir(favorSort, "monthsSupply")}
        />

        <BarChart
          title="AVG DAYS ON MARKET"
          rows={domRows}
          valueOf={(r) => r.avgDaysOnMarket}
          valueKind="dom"
          barClassName={METRIC_COLORS.avgDom}
          emptyMessage="No days-on-market rows in cache yet."
          townHref={avgDomTownHref ?? townHref}
          settle={settle}
          townsExpanded={townsExpanded}
          onAllTownsToggle={() => setTownsExpanded((open) => !open)}
          calcOf={(r) => r.avgDaysOnMarketCalc}
          sortable
          favorSortDir={unstackedFavorSortDir(favorSort, "avgDom")}
        />

        <BarChart
          title={`${closedNoun.title} — trailing ${closedLookbackLabel}`}
          rows={closedRows}
          valueOf={(r) => r.count}
          valueKind="int"
          sortable
          favorSortDir={unstackedFavorSortDir(favorSort, "closed")}
          barClassName={METRIC_COLORS.closed}
          emptyMessage={
            closedPending
              ? `Loading ${closedNoun.lower} for this lookback…`
              : `No ${closedNoun.lower} in this lookback window (or the count request failed — try another period).`
          }
          townHref={closedSalesTownHref}
          settle={settle}
          townsExpanded={townsExpanded}
          onAllTownsToggle={() => setTownsExpanded((open) => !open)}
          calcOf={(r) => r.calc}
          scaleMax={closedBarMax > 0 ? closedBarMax : undefined}
          formatValue={(_row, display) =>
            formatClosedCountWithLookback(
              closedLookbackLabel,
              formatMetricValue("int", display),
            )
          }
        />

        <BarChart
          title="Median"
          rows={priceRows}
          valueOf={(r) => r.medianPrice}
          valueKind="money"
          sortable
          favorSortDir={unstackedFavorSortDir(favorSort, "medianPrice")}
          barClassName={METRIC_COLORS.medianPrice}
          emptyMessage="No median price rows in cache yet (rebuild market stats)."
          townHref={townHref}
          settle={settle}
          townsExpanded={townsExpanded}
          onAllTownsToggle={() => setTownsExpanded((open) => !open)}
          calcOf={(r) => r.medianPriceCalc}
          scaleMax={priceBarMax}
        />

        <BarChart
          title="Delta"
          rows={priceRows}
          valueOf={(r) => {
            const d = meanMinusMedian(r.averagePrice, r.medianPrice).dollars;
            return d == null ? null : Math.abs(d);
          }}
          sortValueOf={(r) =>
            meanMinusMedian(r.averagePrice, r.medianPrice).dollars
          }
          formatValue={(r, _display, index) => {
            const d = meanMinusMedian(r.averagePrice, r.medianPrice);
            return formatPriceDeltaK(
              settleSignedNumber(d.dollars, settle, index, 0),
            );
          }}
          formatValueAside={(r, index) =>
            formatPriceDeltaPct(
              settleSignedNumber(
                meanMinusMedian(r.averagePrice, r.medianPrice).pct,
                settle,
                index + 19,
                1,
              ),
            )
          }
          asideNegative={(r) =>
            (meanMinusMedian(r.averagePrice, r.medianPrice).pct ?? 0) < 0
          }
          explainDelta
          valueKind="int"
          sortable
          favorSortDir={unstackedFavorSortDir(favorSort, "priceDelta")}
          barClassName={METRIC_COLORS.priceDelta}
          emptyMessage="No average/median pair yet — run a stats rebuild to fill means."
          townHref={townHref}
          settle={settle}
          townsExpanded={townsExpanded}
          onAllTownsToggle={() => setTownsExpanded((open) => !open)}
          calcOf={(r) => ({
            summary: PRICE_DELTA_EXPLAIN,
            detail: [
              `Average ${fmtMoney(r.averagePrice)} − median ${fmtMoney(r.medianPrice)}`,
            ],
          })}
          scaleMax={priceBarMax}
          barSpanOf={(r) => ({
            start: r.medianPrice,
            end: r.averagePrice,
          })}
        />

        <BarChart
          title="Average"
          rows={priceRows}
          valueOf={(r) => r.averagePrice}
          valueKind="money"
          sortable
          favorSortDir={unstackedFavorSortDir(favorSort, "averagePrice")}
          barClassName={METRIC_COLORS.averagePrice}
          emptyMessage="No average price rows yet — run a stats rebuild to fill means (median still shows from older cache)."
          townHref={townHref}
          settle={settle}
          townsExpanded={townsExpanded}
          onAllTownsToggle={() => setTownsExpanded((open) => !open)}
          calcOf={(r) => r.averagePriceCalc}
          scaleMax={priceBarMax}
        />

        <BarChart
          title="List to ask"
          rows={priceRows}
          valueOf={(r) =>
            r.saleToAskDollars == null ? null : Math.abs(r.saleToAskDollars)
          }
          sortValueOf={(r) => r.saleToAskPct ?? null}
          formatValue={(r, _display, index) =>
            formatPriceDeltaK(
              settleSignedNumber(r.saleToAskDollars, settle, index, 0),
            )
          }
          formatValueAside={(r, index) =>
            formatSaleToAskPct(
              settleSignedNumber(r.saleToAskPct, settle, index + 19, 1),
            )
          }
          valueKind="int"
          sortable
          favorSortDir={unstackedFavorSortDir(favorSort, "saleToAsk")}
          barClassName={METRIC_COLORS.saleToAsk}
          emptyMessage="No close-vs-original-ask pool yet — run a stats rebuild."
          townHref={saleToAskTownHref ?? townHref}
          settle={settle}
          townsExpanded={townsExpanded}
          onAllTownsToggle={() => setTownsExpanded((open) => !open)}
          calcOf={(r) => r.saleToAskCalc}
        />
          </>
          </div>
          {onLookbackIdChange ? (
            <ClosedLookbackSlider
              lookbackId={lookbackId}
              onChange={onLookbackIdChange}
              pending={closedPending}
            />
          ) : null}
        </div>
        )}
        </div>

        {deal ? (
          <section className="rounded-xl bg-[var(--mp-surface-deep)] overflow-hidden">
            <div className="px-5 pt-5 pb-3 sm:px-6">
              <p className="font-mono text-[11px] tracking-[0.18em] uppercase text-gold mb-1">
                {dealHeading}
              </p>
              <p className="font-serif text-3xl sm:text-4xl leading-tight text-white">
                <span className="italic text-gold">
                  {deal.composite != null && Number.isFinite(deal.composite)
                    ? deal.composite.toFixed(1)
                    : "—"}
                </span>
                <span className="italic text-white/85"> · One listing.</span>
              </p>
            </div>
            {deal.photoUrl ? (
              // Plain img: MLS CDNs are not in next/image remotePatterns.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={deal.photoUrl}
                alt={deal.address}
                className="block w-full aspect-[16/10] object-cover bg-navy"
              />
            ) : (
              <div className="px-5 py-12 text-center font-serif text-sm text-white/55">
                No photo available
              </div>
            )}
            <div className="px-5 py-5 sm:px-6 space-y-3">
              <p className="font-serif text-xl text-white leading-snug">
                {deal.address}
                {deal.city ? `, ${deal.city}` : ""}
              </p>
              <p className="font-mono text-sm text-white/85">
                {deal.price != null ? fmtMoney(deal.price) : "—"}
                <span className="text-white/40"> · </span>
                MLS #{deal.mlsId}
              </p>
              {(() => {
                const meta = [
                  deal.propertyType,
                  deal.beds != null && deal.baths != null
                    ? `${deal.beds}BR/${deal.baths}BA`
                    : null,
                  deal.sqft != null
                    ? `${deal.sqft.toLocaleString()} sqft`
                    : null,
                  deal.lotAcres != null && Number.isFinite(deal.lotAcres)
                    ? `${deal.lotAcres.toFixed(deal.lotAcres < 1 ? 2 : 1)} ac`
                    : null,
                  deal.yearBuilt != null ? `Built ${deal.yearBuilt}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ");
                return meta ? (
                  <p className="font-mono text-[11px] text-white/60">{meta}</p>
                ) : null;
              })()}
              {deal.valueDiscountPct != null &&
              Number.isFinite(deal.valueDiscountPct) &&
              deal.valueDiscountPct > 0 ? (
                <p className="font-mono text-[11px] tracking-[0.08em] uppercase text-gold">
                  {Math.round(deal.valueDiscountPct)}% below town median
                </p>
              ) : null}
              {deal.superlatives.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {deal.superlatives.slice(0, 5).map((word) => (
                    <span
                      key={word}
                      className="inline-block rounded-full border border-gold/45 px-2.5 py-1 font-mono text-[10px] tracking-[0.12em] uppercase text-gold"
                    >
                      {word}
                    </span>
                  ))}
                </div>
              ) : null}
              {splitSentences(deal.insight).length > 0 ? (
                splitSentences(deal.insight).map((sentence) => (
                  <p
                    key={sentence}
                    className="font-serif text-sm leading-relaxed text-white/80"
                  >
                    {sentence}
                  </p>
                ))
              ) : (
                <p className="font-serif text-sm text-white/65">
                  No insight available.
                </p>
              )}
              <p className="pt-2">
                <a
                  href={deal.href}
                  className="inline-block rounded-full bg-gold px-4 py-2.5 font-mono text-[11px] tracking-[0.14em] uppercase text-[#131F38] hover:bg-gold/90 transition-colors"
                >
                  View listing
                </a>
              </p>
            </div>
          </section>
        ) : showDealOfTheWeek ? (
          <section>
            <p className="font-mono text-[11px] tracking-[0.16em] uppercase text-gold mb-2">
              {dealHeading}
            </p>
            <p className="font-serif text-sm text-slate">
              No featured deal in cache for this category yet — check homepage /
              stats rebuild.
            </p>
          </section>
        ) : null}

        <div className="space-y-2 [font-family:var(--mp-mono-font)] text-[10px] leading-relaxed text-[var(--mp-muted-text)]">
          <p className="tracking-[0.12em] uppercase text-[var(--mp-text)]">
            How Seller / Buyer Friendly is scored
          </p>
          <p>
            Buyer Friendly ranks a town higher when months supply is larger, avg
            days on market is larger, closed is smaller, median is smaller,
            delta is smaller, and average is smaller.
          </p>
          <p>
            Seller Friendly is the opposite of each of those — smaller months
            supply and avg days on market, larger closed, median, delta, and
            average.
          </p>
        </div>
        <p className="font-mono text-[11px] leading-relaxed text-slate">
          MOS = active ÷ avg monthly closings (3 prior full months). Scope:{" "}
          {scopeLabel}.
        </p>
        <p className="[font-family:var(--mp-mono-font)] text-[10px] leading-relaxed text-[var(--mp-muted-text)]">
          Coming Soon: Active Listings ÷ Housing Units (Derived From Town Stats
          TBD), and 24-Month Closings ÷ Housing Units (Derived From Town Stats
          TBD).
        </p>
      </div>

      {sortExplainOpen ? (
        <ModalPortal
          open
          onClose={() => setSortExplainOpen(false)}
          ariaLabel="How towns are sorted"
        >
          <div className={MODAL_PANEL_CLASS} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 mb-4">
              <h2 className="font-serif text-2xl text-navy">Town metrics</h2>
              <button
                type="button"
                onClick={() => setSortExplainOpen(false)}
                className="text-slate hover:text-navy transition-colors font-mono text-lg leading-none mt-1"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <p className="text-sm text-charcoal leading-relaxed">
              {marketPulseSortExplain(chartLayout, favorSort)}
            </p>
          </div>
        </ModalPortal>
      ) : null}
    </article>
  );
}
