"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { StatsCalcTooltipShell } from "@/components/StatsCalcTooltip";
import MarketPulseDeltaLabel from "@/components/MarketPulseDeltaLabel";
import ModalPortal, { MODAL_PANEL_CLASS } from "@/components/ModalPortal";
import { fmtMoney } from "@/lib/listing-history";
import {
  type MarketDigestClosedTownCount,
  type MarketDigestDomTownCount,
  type MarketDigestPriceTownCount,
  type MarketDigestSnapshot,
} from "@/lib/market-digest-types";
import type { MonthsSupplyPayload } from "@/lib/months-supply-types";
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
  isMarketPulsePriceScaleMetric,
  marketPulsePriceBarMax,
  marketPulseStackedMetrics,
  type MarketPulseStackedMetricId,
} from "@/lib/market-pulse-stacked-metrics";
import {
  DEFAULT_MARKET_PULSE_LOOKBACK_ID,
  MARKET_PULSE_LOOKBACK_OPTIONS,
  marketPulseLookbackById,
  marketPulseLookbackChartLabel,
  marketPulseLookbackClosedPrefix,
  formatClosedCountWithLookback,
  monthsSupplyFromLookbackWindow,
  type MarketPulseLookbackId,
} from "@/lib/market-pulse-lookback";
import {
  MARKET_PULSE_SETTLE_IDLE,
  randomBarPercents,
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
type MetricValueKind = "int" | "mos" | "dom" | "money";

const METRIC_COLORS = {
  inventory: "bg-[var(--mp-inventory-bar)]",
  monthsSupply: "bg-[var(--mp-months-supply-bar)]",
  avgDom: "bg-[var(--mp-avg-dom-bar,#5B8A72)]",
  closed: "bg-[var(--mp-closed-bar,#C45C4A)]",
  medianPrice: "bg-[var(--mp-median-bar,#6B7C9B)]",
  averagePrice: "bg-[var(--mp-average-bar,#8B6F4E)]",
  priceDelta: "bg-[var(--mp-delta-bar,#7A6A8A)]",
} as const;

function FilterDisclosure({
  label,
  summary,
  open,
  onToggle,
  children,
}: {
  label: string;
  summary: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <button
          type="button"
          className="inline-flex items-center gap-1.5 font-mono text-[11px] tracking-[0.12em] uppercase text-[var(--mp-text)] underline decoration-[var(--mp-text)]/35 underline-offset-2 transition-colors hover:text-[var(--mp-accent)] hover:decoration-[var(--mp-accent)]/50"
          aria-expanded={open}
          onClick={onToggle}
        >
          {label}
          <span aria-hidden className="tabular-nums no-underline">
            {open ? "−" : "+"}
          </span>
        </button>
        {!open ? (
          <span className="min-w-0 [font-family:var(--mp-mono-font)] text-[10px] leading-snug text-[var(--mp-muted-text)]">
            {summary}
          </span>
        ) : null}
      </div>
      {open ? children : null}
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
    return `Sorted by buyer/seller friendly composite (months supply + avg DOM${
      favorSort === "sellers"
        ? "; lower = more seller friendly"
        : "; higher = more buyer friendly"
    }). All towns stays on top.`;
  }
  return `Each unstacked chart sorts on its own metric (${
    favorSort === "sellers"
      ? "Seller: DOM↑, closed↓, median/avg↓"
      : "Buyer: DOM↓, closed↑, median/avg↑"
  }). All towns stays on top.`;
}

function fmtMos(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "n/a";
  return `${n.toFixed(1)} mo`;
}

function fmtActive(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return String(Math.round(n));
}

function fmtDom(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${Math.round(n)}d`;
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

type CombinedTownRow = {
  city: string;
  activeCount: number | null;
  monthsSupply: number | null;
  avgDaysOnMarket: number | null;
  closedCount: number | null;
  medianPrice: number | null;
  averagePrice: number | null;
  priceDelta: number | null;
  priceDeltaPct: number | null;
  activeCountCalc?: StatsValueCalc;
  monthsSupplyCalc?: StatsValueCalc;
  avgDaysOnMarketCalc?: StatsValueCalc;
  closedCalc?: StatsValueCalc;
  medianPriceCalc?: StatsValueCalc;
  averagePriceCalc?: StatsValueCalc;
};

function buildCombinedTownRows(
  inventory: MonthsSupplyPayload[],
  domRows: MarketDigestDomTownCount[],
  closedRows: MarketDigestClosedTownCount[],
  priceRows: MarketDigestPriceTownCount[],
): CombinedTownRow[] {
  const domBy = new Map(
    domRows.map((r) => [cityKey(r.city), r] as const),
  );
  const closedBy = new Map(
    closedRows.map((r) => [cityKey(r.city), r] as const),
  );
  const priceBy = new Map(
    priceRows.map((r) => [cityKey(r.city), r] as const),
  );
  return inventory.map((row) => {
    const key = cityKey(row.city);
    const dom = domBy.get(key);
    const closed = closedBy.get(key);
    const price = priceBy.get(key);
    const delta = meanMinusMedian(price?.averagePrice, price?.medianPrice);
    return {
      city: row.city,
      activeCount: row.activeCount ?? null,
      monthsSupply: row.monthsSupply ?? null,
      avgDaysOnMarket: dom?.avgDaysOnMarket ?? null,
      closedCount: closed?.count ?? null,
      medianPrice: price?.medianPrice ?? null,
      averagePrice: price?.averagePrice ?? null,
      priceDelta: delta.dollars,
      priceDeltaPct: delta.pct,
      activeCountCalc: row.activeCountCalc,
      monthsSupplyCalc: row.monthsSupplyCalc,
      avgDaysOnMarketCalc: dom?.avgDaysOnMarketCalc,
      closedCalc: closed?.calc,
      medianPriceCalc: price?.medianPriceCalc,
      averagePriceCalc: price?.averagePriceCalc,
    };
  });
}

function formatMetricValue(
  kind: MetricValueKind,
  display: number | null,
): string {
  if (kind === "mos") return fmtMos(display);
  if (kind === "dom") return fmtDom(display);
  if (kind === "money") return fmtMoney(display);
  return fmtActive(display);
}

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
  explainDelta = false,
  scaleMax,
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
  /** Percent (or other) shown next to the town, not beside the dollar amount. */
  formatValueAside?: (row: Row, index: number) => string;
  /** Title “Delta” is a link with the mean-vs-median popup. */
  explainDelta?: boolean;
  /** When set (Median / Avg / Delta), bars share one dollar axis. */
  scaleMax?: number;
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
        {displayRows.map((row, index) => {
          const v = valueOf(row);
          const settled =
            max > 0 && v != null && Number.isFinite(v) ? (v / max) * 100 : 0;
          const pct = settleBarPercent(
            settled,
            index,
            settle,
            barScramble,
          );
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
                  ? title.startsWith("Avg")
                    ? "Avg"
                    : title.startsWith("Median")
                      ? "Median"
                      : "Delta"
                  : title.startsWith("Closed")
                    ? "Closed sales"
                    : "Active inventory";
          return (
            <li
              key={`${row.city}-${title}`}
              className={`grid items-center gap-1.5 sm:gap-2 ${
                formatValueAside
                  ? "grid-cols-[4.5rem_2.35rem_1fr_2.6rem] sm:grid-cols-[6.5rem_3.25rem_1fr_4.25rem]"
                  : formatValue
                    ? "grid-cols-[4.75rem_1fr_3rem] sm:grid-cols-[7.5rem_1fr_4.5rem]"
                    : "grid-cols-[4.75rem_1fr_2.6rem] sm:grid-cols-[7.5rem_1fr_3.5rem]"
              }`}
            >
              {href ? (
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
              )}
              {formatValueAside ? (
                <span className="[font-family:var(--mp-mono-font)] text-[10px] tabular-nums text-[var(--mp-muted-text)]">
                  {formatValueAside(row, index)}
                </span>
              ) : null}
              <div className="group relative h-3.5 rounded-sm bg-black/10 overflow-visible">
                <div className="h-full overflow-hidden rounded-sm">
                  <div
                    className={`h-full rounded-sm transition-[width] ease-out ${widthTransition} ${barClassName}`}
                    style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
                  />
                </div>
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
              <span className="[font-family:var(--mp-mono-font)] text-xs text-[var(--mp-text)] text-right tabular-nums">
                {valueText}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function combinedMetrics(closedLookbackLabel: string) {
  const chrome: Record<
    MarketPulseStackedMetricId,
    {
      barClassName: string;
      valueKind: MetricValueKind;
      calcOf: (r: CombinedTownRow) => StatsValueCalc | undefined;
    }
  > = {
    inventory: {
      barClassName: METRIC_COLORS.inventory,
      valueKind: "int",
      calcOf: (r) => r.activeCountCalc,
    },
    monthsSupply: {
      barClassName: METRIC_COLORS.monthsSupply,
      valueKind: "mos",
      calcOf: (r) => r.monthsSupplyCalc,
    },
    avgDom: {
      barClassName: METRIC_COLORS.avgDom,
      valueKind: "dom",
      calcOf: (r) => r.avgDaysOnMarketCalc,
    },
    closed: {
      barClassName: METRIC_COLORS.closed,
      valueKind: "int",
      calcOf: (r) => r.closedCalc,
    },
    medianPrice: {
      barClassName: METRIC_COLORS.medianPrice,
      valueKind: "money",
      calcOf: (r) => r.medianPriceCalc,
    },
    averagePrice: {
      barClassName: METRIC_COLORS.averagePrice,
      valueKind: "money",
      calcOf: (r) => r.averagePriceCalc,
    },
    priceDelta: {
      barClassName: METRIC_COLORS.priceDelta,
      valueKind: "int",
      calcOf: (r) => ({
        summary: PRICE_DELTA_EXPLAIN,
        detail: [
          `Avg ${fmtMoney(r.averagePrice)} − median ${fmtMoney(r.medianPrice)}`,
        ],
      }),
    },
  };

  return marketPulseStackedMetrics(closedLookbackLabel).map((m) => ({
    ...m,
    ...chrome[m.id],
    valueOf: m.barValueOf,
    formatOf: m.format,
  }));
}

/** One town block with four stacked metric bars (each normalized to its own max). */
function CombinedMetricsChart({
  title,
  rows,
  townHref,
  settle,
  closedLookbackLabel,
  closedPending = false,
  closedBarMax = 0,
}: {
  title: ReactNode;
  rows: CombinedTownRow[];
  townHref?: (cityLabel: string) => string;
  settle: MarketPulseSettleState;
  closedLookbackLabel: string;
  closedPending?: boolean;
  /** 24-month Closed max — 7d bars stay a slice of this, not 100%. */
  closedBarMax?: number;
}) {
  const metrics = combinedMetrics(closedLookbackLabel);
  const [barScramble, setBarScramble] = useState<number[] | null>(null);

  useEffect(() => {
    if (settle.phase !== "scramble" || rows.length === 0) {
      setBarScramble(null);
      return;
    }
    setBarScramble(randomBarPercents(rows.length * metrics.length));
  }, [settle.phase, settle.tick, rows.length, metrics.length]);

  if (rows.length === 0) {
    return (
      <section>
        <p className="[font-family:var(--mp-mono-font)] text-[11px] tracking-[0.16em] uppercase text-[var(--mp-accent)] mb-3 inline-flex flex-wrap items-baseline gap-x-1">
          {title}
        </p>
        <p className="[font-family:var(--mp-heading-font)] text-sm text-[var(--mp-muted-text)]">
          No town rows in cache yet.
        </p>
      </section>
    );
  }

  const maxByMetric = metrics.map((m) =>
    Math.max(
      0,
      ...rows.map((r) => {
        const v = m.valueOf(r);
        return v != null && Number.isFinite(v) ? v : 0;
      }),
    ),
  );
  const priceMax = marketPulsePriceBarMax(rows);

  const widthTransition =
    settle.phase === "scramble"
      ? "duration-300"
      : settle.phase === "countup"
        ? "duration-75"
        : "duration-150";

  function metricRow(
    row: CombinedTownRow,
    rowIndex: number,
    townLabel: string,
    m: (typeof metrics)[number],
    metricIndex: number,
  ) {
    const v = m.valueOf(row);
    const max =
      m.id === "closed" && closedBarMax > 0
        ? closedBarMax
        : isMarketPulsePriceScaleMetric(m.id)
          ? priceMax
          : (maxByMetric[metricIndex] ?? 0);
    const settled =
      max > 0 && v != null && Number.isFinite(v) ? (v / max) * 100 : 0;
    const scrambleIndex = rowIndex * metrics.length + metricIndex;
    const pct = settleBarPercent(
      settled,
      scrambleIndex,
      settle,
      barScramble,
    );
    const display =
      m.valueKind === "mos"
        ? settleMosDisplay(v, settle, scrambleIndex)
        : settleIntDisplay(v, settle, scrambleIndex);
    const deltaDollars =
      m.id === "priceDelta"
        ? settleSignedNumber(row.priceDelta, settle, scrambleIndex, 0)
        : null;
    const deltaPct =
      m.id === "priceDelta"
        ? settleSignedNumber(row.priceDeltaPct, settle, scrambleIndex + 19, 1)
        : null;
    const closedCountText =
      m.id === "closed"
        ? closedPending
          ? "…"
          : formatMetricValue(m.valueKind, display)
        : null;
    const valueText =
      closedCountText != null
        ? formatClosedCountWithLookback(closedLookbackLabel, closedCountText)
        : m.id === "priceDelta"
          ? formatPriceDeltaK(deltaDollars)
          : formatMetricValue(m.valueKind, display);
    const calc = m.calcOf(row);
    return (
      <li
        key={m.id}
        className="group relative grid grid-cols-[4.75rem_1fr_2.75rem] items-center gap-1.5 sm:grid-cols-[8.25rem_1fr_7.25rem] sm:gap-2"
        title={m.id === "priceDelta" ? undefined : `${m.label}: ${valueText}`}
      >
        {m.id === "priceDelta" ? (
        <span className="[font-family:var(--mp-mono-font)] text-[9px] tracking-[0.06em] uppercase text-[var(--mp-muted-text)] leading-tight">
          <MarketPulseDeltaLabel
            pctLabel={formatPriceDeltaPct(deltaPct)}
          />
        </span>
        ) : (
          <span className="[font-family:var(--mp-mono-font)] text-[9px] tracking-[0.06em] uppercase text-[var(--mp-muted-text)] leading-tight">
            {m.label}
          </span>
        )}
        <div className="h-3 rounded-sm bg-black/10 overflow-visible">
          <div className="h-full overflow-hidden rounded-sm">
            <div
              className={`h-full rounded-sm transition-[width] ease-out ${widthTransition} ${m.barClassName}`}
              style={{
                width: `${Math.max(0, Math.min(100, pct))}%`,
              }}
            />
          </div>
          <div
            className="pointer-events-none absolute left-1/2 bottom-[calc(100%+6px)] z-20 w-max max-w-[min(280px,70vw)] -translate-x-1/2 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
            role="tooltip"
          >
            <StatsCalcTooltipShell
              label={townLabel}
              valueLine={`${valueText} · ${m.label}`}
              calc={calc}
              theme="light"
            />
          </div>
        </div>
        <span className="[font-family:var(--mp-mono-font)] text-[10px] tabular-nums text-[var(--mp-text)] text-right">
          {closedCountText != null ? (
            <>
              <span className="hidden sm:inline">
                {marketPulseLookbackClosedPrefix(closedLookbackLabel)} -{" "}
              </span>
              {closedCountText}
            </>
          ) : (
            valueText
          )}
        </span>
      </li>
    );
  }

  return (
    <section>
      <p className="[font-family:var(--mp-mono-font)] text-[11px] tracking-[0.16em] uppercase text-[var(--mp-accent)] mb-3 inline-flex flex-wrap items-baseline gap-x-1">
        {title}
      </p>
      <ul className="space-y-3">
        {rows.map((row, rowIndex) => {
          const label = cityLabel(row);
          const href = townHref?.(row.city ?? label);
          return (
            <li key={`combined-${row.city}`} className="space-y-1">
              {href ? (
                <Link
                  href={href}
                  className="[font-family:var(--mp-heading-font)] text-sm text-[var(--mp-text)] underline decoration-[var(--mp-text)] underline-offset-2 hover:text-[var(--mp-accent)] hover:decoration-[var(--mp-accent)] transition-colors"
                >
                  {label}
                </Link>
              ) : (
                <span className="[font-family:var(--mp-heading-font)] text-sm text-[var(--mp-text)]">
                  {label}
                </span>
              )}
              <ul className="space-y-1.5">
                {metrics.map((m, metricIndex) => {
                  if (m.id === "averagePrice") return null;
                  if (m.id === "medianPrice") {
                    const avg = metrics.find((x) => x.id === "averagePrice");
                    const avgIndex = metrics.findIndex(
                      (x) => x.id === "averagePrice",
                    );
                    return (
                      <li key="price-sandwich" className="space-y-0">
                        <ul className="space-y-0">
                          {metricRow(row, rowIndex, label, m, metricIndex)}
                          {avg
                            ? metricRow(row, rowIndex, label, avg, avgIndex)
                            : null}
                        </ul>
                      </li>
                    );
                  }
                  return metricRow(row, rowIndex, label, m, metricIndex);
                })}
              </ul>
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
}: {
  label: string;
  final: number | null | undefined;
  kind: "int" | "mos" | "dom";
  settle: MarketPulseSettleState;
  salt: number;
}) {
  const display =
    kind === "mos"
      ? settleMosDisplay(final, settle, salt)
      : settleIntDisplay(final, settle, salt);
  const empty = final == null && settle.phase === "done";
  const text = empty
    ? "—"
    : kind === "mos"
      ? fmtMos(display)
      : kind === "dom"
        ? fmtDom(display)
        : fmtActive(display);

  return (
    <div className="rounded-lg border border-black/[0.08] bg-[var(--mp-page-bg)] px-3 py-4 text-center">
      <p className="[font-family:var(--mp-mono-font)] text-[10px] tracking-[0.1em] uppercase text-[var(--mp-muted-text)] mb-1.5 leading-tight">
        {label}
      </p>
      <p className="[font-family:var(--mp-heading-font)] text-2xl text-[var(--mp-text)] leading-tight tabular-nums">
        {text}
      </p>
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
  eyebrow = "TMRE Market Pulse",
  scopeLabel = "sales",
  showDealOfTheWeek = true,
  dealHeading = "Deal of the Week",
  selectionLabel,
  townHref,
  monthsSupplyTownHref,
  closedSalesTownHref,
  avgDomTownHref,
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
  const [lookbackOpen, setLookbackOpen] = useState(false);
  const [propertyTypeOpen, setPropertyTypeOpen] = useState(false);
  const [layoutOpen, setLayoutOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [sortExplainOpen, setSortExplainOpen] = useState(false);
  const closedLookbackLabel = marketPulseLookbackChartLabel(lookbackId);
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
      }),
      favorSort,
      (r) => isAllTownsCity(r.city),
    );
  }, [inventoryRows, domRows, closedRows, priceRows, favorSort]);

  const deal = showDealOfTheWeek ? snapshot.dealOfTheWeek : null;
  const titleScope = selectionLabel ?? scopeLabel;

  const controlBtn = (active: boolean) =>
    `shrink-0 font-mono text-[10px] tracking-[0.1em] uppercase rounded-full px-3 py-1.5 border transition-colors ${
      active
        ? "border-[var(--mp-accent)] bg-[var(--mp-accent)]/15 text-[var(--mp-text)]"
        : "border-black/15 text-[var(--mp-muted-text)] hover:border-black/25 hover:text-[var(--mp-text)]"
    }`;
  const pillRow = "flex flex-wrap items-center gap-2";
  const townMetricsTitle = (
    <>
      Town metrics
      <button
        type="button"
        className="ml-0.5 align-super font-mono text-[12px] leading-none text-[var(--mp-accent)] hover:text-[var(--mp-text)]"
        aria-label="How towns are sorted"
        onClick={() => setSortExplainOpen(true)}
      >
        *
      </button>
    </>
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
        <p className="mt-3 font-mono text-[11px]">
          <Link
            href="/stats"
            className="text-[var(--mp-accent)] underline underline-offset-2"
          >
            View live stats
          </Link>
        </p>
      </header>

      <div className="rounded-b-2xl border border-t-0 border-black/[0.08] bg-[var(--mp-card-bg)] px-3 py-6 sm:px-8 sm:py-7 space-y-8 shadow-sm shadow-black/5">
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <Kpi
            label="Market active"
            final={snapshot.market?.activeCount}
            kind="int"
            settle={settle}
            salt={1}
          />
          <Kpi
            label="All Town Months Inventory"
            final={
              lookbackDrivesMos
                ? (inventoryRows.find((r) => isAllTownsCity(r.city))
                    ?.monthsSupply ?? null)
                : snapshot.market?.monthsSupply
            }
            kind="mos"
            settle={settle}
            salt={2}
          />
          <Kpi
            label="Avg days on market"
            final={allTownsAvgDom}
            kind="dom"
            settle={settle}
            salt={3}
          />
        </div>

        <div className="space-y-3">
          {onLookbackIdChange ? (
            <FilterDisclosure
              label="Closed lookback"
              summary={closedLookbackLabel}
              open={lookbackOpen}
              onToggle={() => setLookbackOpen((open) => !open)}
            >
              <div className={pillRow} role="group" aria-label="Closed sales lookback period">
                {MARKET_PULSE_LOOKBACK_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    className={controlBtn(lookbackId === opt.id)}
                    aria-pressed={lookbackId === opt.id}
                    onClick={() => onLookbackIdChange(opt.id)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <p className="[font-family:var(--mp-mono-font)] text-[10px] text-[var(--mp-muted-text)]">
                Sets closed sales and months supply. Inventory, avg DOM, and
                prices stay current.
                {closedPending ? " Loading closed counts…" : ""}
              </p>
            </FilterDisclosure>
          ) : null}

          {categoryFilter ? (
            <FilterDisclosure
              label="Property type"
              summary={(selectionLabel ?? scopeLabel).trim() || "ALL"}
              open={propertyTypeOpen}
              onToggle={() => setPropertyTypeOpen((open) => !open)}
            >
              {categoryFilter}
            </FilterDisclosure>
          ) : null}

          <FilterDisclosure
            label="Layout"
            summary={chartLayout}
            open={layoutOpen}
            onToggle={() => setLayoutOpen((open) => !open)}
          >
            <div className={pillRow} role="group" aria-label="Chart layout">
              <button
                type="button"
                className={controlBtn(chartLayout === "stacked")}
                aria-pressed={chartLayout === "stacked"}
                onClick={() => setChartLayout("stacked")}
              >
                STACKED
              </button>
              <button
                type="button"
                className={controlBtn(chartLayout === "unstacked")}
                aria-pressed={chartLayout === "unstacked"}
                onClick={() => setChartLayout("unstacked")}
              >
                UNSTACKED
              </button>
            </div>
          </FilterDisclosure>

          <FilterDisclosure
            label="Sort"
            summary={marketPulseFavorSortLabel(favorSort)}
            open={sortOpen}
            onToggle={() => setSortOpen((open) => !open)}
          >
            <div
              className={pillRow}
              role="group"
              aria-label="Town sort by market favorability"
            >
              <button
                type="button"
                className={controlBtn(favorSort === "sellers")}
                aria-pressed={favorSort === "sellers"}
                onClick={() => {
                  if (favorSort === "sellers") {
                    setFavorSort("default");
                    return;
                  }
                  setFavorSort("sellers");
                }}
              >
                Seller Friendly
              </button>
              <button
                type="button"
                className={controlBtn(favorSort === "buyers")}
                aria-pressed={favorSort === "buyers"}
                onClick={() => {
                  if (favorSort === "buyers") {
                    setFavorSort("default");
                    return;
                  }
                  setFavorSort("buyers");
                }}
              >
                Buyer Friendly
              </button>
            </div>
          </FilterDisclosure>
        </div>

        {chartLayout === "stacked" ? (
          <CombinedMetricsChart
            title={
              <>
                {townMetricsTitle}
                {` stacked (${titleScope})`}
              </>
            }
            rows={combinedRows}
            townHref={townHref}
            settle={settle}
            closedLookbackLabel={closedLookbackLabel}
            closedPending={closedPending}
            closedBarMax={closedBarMax}
          />
        ) : (
          <>
        <p className="[font-family:var(--mp-mono-font)] text-[11px] tracking-[0.16em] uppercase text-[var(--mp-accent)] mb-1 inline-flex flex-wrap items-baseline gap-x-1">
          {townMetricsTitle}
        </p>
        <BarChart
          title={`Active inventory (${titleScope})`}
          rows={inventoryRows}
          valueOf={(r) => r.activeCount}
          valueKind="int"
          barClassName={METRIC_COLORS.inventory}
          emptyMessage="No inventory rows in cache yet."
          townHref={townHref}
          settle={settle}
          calcOf={(r) => r.activeCountCalc}
          sortable
          favorSortDir={unstackedFavorSortDir(favorSort, "inventory")}
        />

        <BarChart
          title={`Months supply (${scopeLabel})`}
          rows={inventoryRows}
          valueOf={(r) => r.monthsSupply}
          valueKind="mos"
          barClassName={METRIC_COLORS.monthsSupply}
          emptyMessage="No months-supply rows in cache yet."
          townHref={monthsSupplyTownHref ?? townHref}
          settle={settle}
          calcOf={(r) => r.monthsSupplyCalc}
          sortable
          favorSortDir={unstackedFavorSortDir(favorSort, "monthsSupply")}
        />

        <BarChart
          title={`Avg days on market (${titleScope})`}
          rows={domRows}
          valueOf={(r) => r.avgDaysOnMarket}
          valueKind="dom"
          barClassName={METRIC_COLORS.avgDom}
          emptyMessage="No days-on-market rows in cache yet."
          townHref={avgDomTownHref ?? townHref}
          settle={settle}
          calcOf={(r) => r.avgDaysOnMarketCalc}
          sortable
          favorSortDir={unstackedFavorSortDir(favorSort, "avgDom")}
        />

        <BarChart
          title={`Closed sales — trailing ${closedLookbackLabel} (${titleScope})`}
          rows={closedRows}
          valueOf={(r) => r.count}
          valueKind="int"
          sortable
          favorSortDir={unstackedFavorSortDir(favorSort, "closed")}
          barClassName={METRIC_COLORS.closed}
          emptyMessage={
            closedPending
              ? "Loading closed sales for this lookback…"
              : "No closed sales in this lookback window (or the count request failed — try another period)."
          }
          townHref={closedSalesTownHref}
          settle={settle}
          calcOf={(r) => r.calc}
          scaleMax={closedBarMax > 0 ? closedBarMax : undefined}
        />

        <BarChart
          title={`Median (${titleScope})`}
          rows={priceRows}
          valueOf={(r) => r.medianPrice}
          valueKind="money"
          sortable
          favorSortDir={unstackedFavorSortDir(favorSort, "medianPrice")}
          barClassName={METRIC_COLORS.medianPrice}
          emptyMessage="No median price rows in cache yet (rebuild market stats)."
          townHref={townHref}
          settle={settle}
          calcOf={(r) => r.medianPriceCalc}
          scaleMax={priceBarMax}
        />

        <BarChart
          title={`Avg (${titleScope})`}
          rows={priceRows}
          valueOf={(r) => r.averagePrice}
          valueKind="money"
          sortable
          favorSortDir={unstackedFavorSortDir(favorSort, "averagePrice")}
          barClassName={METRIC_COLORS.averagePrice}
          emptyMessage="No average price rows yet — run a stats rebuild to fill means (median still shows from older cache)."
          townHref={townHref}
          settle={settle}
          calcOf={(r) => r.averagePriceCalc}
          scaleMax={priceBarMax}
        />

        <BarChart
          title={`Delta (${titleScope})`}
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
          explainDelta
          valueKind="int"
          sortable
          favorSortDir={unstackedFavorSortDir(favorSort, "priceDelta")}
          barClassName={METRIC_COLORS.priceDelta}
          emptyMessage="No average/median pair yet — run a stats rebuild to fill means."
          townHref={townHref}
          settle={settle}
          calcOf={(r) => ({
            summary: PRICE_DELTA_EXPLAIN,
            detail: [
              `Avg ${fmtMoney(r.averagePrice)} − median ${fmtMoney(r.medianPrice)}`,
            ],
          })}
          scaleMax={priceBarMax}
        />
          </>
        )}

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
