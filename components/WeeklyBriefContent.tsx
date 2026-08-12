"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { StatsCalcTooltipShell } from "@/components/StatsCalcTooltip";
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
  summarizeMarketPulseFilters,
  type MarketPulseChartLayout,
} from "@/lib/market-pulse-defaults";
import {
  sortRowsByBuyerFriendlyScore,
  type MarketPulseFavorSort,
} from "@/lib/market-pulse-favorability";
import {
  DEFAULT_MARKET_PULSE_LOOKBACK_ID,
  MARKET_PULSE_LOOKBACK_OPTIONS,
  marketPulseLookbackChartLabel,
  type MarketPulseLookbackId,
} from "@/lib/market-pulse-lookback";
import {
  MARKET_PULSE_SETTLE_IDLE,
  randomBarPercents,
  settleBarPercent,
  settleIntDisplay,
  settleMosDisplay,
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
} as const;

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
    return {
      city: row.city,
      activeCount: row.activeCount ?? null,
      monthsSupply: row.monthsSupply ?? null,
      avgDaysOnMarket: dom?.avgDaysOnMarket ?? null,
      closedCount: closed?.count ?? null,
      medianPrice: price?.medianPrice ?? null,
      averagePrice: price?.averagePrice ?? null,
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
}) {
  const [barScramble, setBarScramble] = useState<number[] | null>(null);
  /** null = page-load / snapshot order until the visitor picks a direction. */
  const [sortDir, setSortDir] = useState<MetricSortDir | null>(null);

  useEffect(() => {
    if (settle.phase !== "scramble" || rows.length === 0) {
      setBarScramble(null);
      return;
    }
    setBarScramble(randomBarPercents(rows.length));
  }, [settle.phase, settle.tick, rows.length]);

  const displayRows = useMemo(() => {
    if (!sortable || !sortDir) return rows;
    return sortRowsByMetricValue(rows, valueOf, sortDir);
  }, [rows, sortable, sortDir, valueOf]);

  const titleRow = (
    <div className="mb-4 flex items-center justify-between gap-3">
      <p className="min-w-0 [font-family:var(--mp-mono-font)] text-[11px] tracking-[0.16em] uppercase text-[var(--mp-accent)]">
        {title}
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
            aria-pressed={sortDir === "asc"}
            title="Ascending"
            onClick={() => setSortDir("asc")}
            className={`px-0.5 font-mono text-[11px] leading-none transition-colors ${
              sortDir === "asc"
                ? "text-[var(--mp-accent)]"
                : "text-[var(--mp-muted-text)]/45 hover:text-[var(--mp-muted-text)]"
            }`}
          >
            ▲
          </button>
          <button
            type="button"
            aria-label="Sort descending"
            aria-pressed={sortDir === "desc"}
            title="Descending"
            onClick={() => setSortDir("desc")}
            className={`px-0.5 font-mono text-[11px] leading-none transition-colors ${
              sortDir === "desc"
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

  const max = Math.max(
    0,
    ...displayRows.map((r) => {
      const v = valueOf(r);
      return v != null && Number.isFinite(v) ? v : 0;
    }),
  );

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
          const valueText = formatMetricValue(valueKind, display);
          const calc = calcOf?.(row);
          const metricLabel =
            valueKind === "mos"
              ? "Months supply"
              : valueKind === "dom"
                ? "Avg days on market"
                : valueKind === "money"
                  ? title.startsWith("Average")
                    ? "Average price"
                    : "Median price"
                  : title.startsWith("Closed")
                    ? "Closed sales"
                    : "Active inventory";
          return (
            <li
              key={`${row.city}-${title}`}
              className="grid grid-cols-[7.5rem_1fr_3.5rem] items-center gap-2"
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
  return [
    {
      id: "inventory",
      label: "Inventory",
      barClassName: METRIC_COLORS.inventory,
      valueKind: "int" as const,
      valueOf: (r: CombinedTownRow) => r.activeCount,
      calcOf: (r: CombinedTownRow) => r.activeCountCalc,
    },
    {
      id: "monthsSupply",
      label: "Months supply",
      barClassName: METRIC_COLORS.monthsSupply,
      valueKind: "mos" as const,
      valueOf: (r: CombinedTownRow) => r.monthsSupply,
      calcOf: (r: CombinedTownRow) => r.monthsSupplyCalc,
    },
    {
      id: "avgDom",
      label: "Avg DOM",
      barClassName: METRIC_COLORS.avgDom,
      valueKind: "dom" as const,
      valueOf: (r: CombinedTownRow) => r.avgDaysOnMarket,
      calcOf: (r: CombinedTownRow) => r.avgDaysOnMarketCalc,
    },
    {
      id: "closed",
      label: `Closed (${closedLookbackLabel})`,
      barClassName: METRIC_COLORS.closed,
      valueKind: "int" as const,
      valueOf: (r: CombinedTownRow) => r.closedCount,
      calcOf: (r: CombinedTownRow) => r.closedCalc,
    },
    {
      id: "medianPrice",
      label: "Median price",
      barClassName: METRIC_COLORS.medianPrice,
      valueKind: "money" as const,
      valueOf: (r: CombinedTownRow) => r.medianPrice,
      calcOf: (r: CombinedTownRow) => r.medianPriceCalc,
    },
    {
      id: "averagePrice",
      label: "Average price",
      barClassName: METRIC_COLORS.averagePrice,
      valueKind: "money" as const,
      valueOf: (r: CombinedTownRow) => r.averagePrice,
      calcOf: (r: CombinedTownRow) => r.averagePriceCalc,
    },
  ] as const;
}

/** One town block with four stacked metric bars (each normalized to its own max). */
function CombinedMetricsChart({
  title,
  rows,
  townHref,
  settle,
  closedLookbackLabel,
}: {
  title: string;
  rows: CombinedTownRow[];
  townHref?: (cityLabel: string) => string;
  settle: MarketPulseSettleState;
  closedLookbackLabel: string;
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
        <p className="[font-family:var(--mp-mono-font)] text-[11px] tracking-[0.16em] uppercase text-[var(--mp-accent)] mb-3">
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

  const widthTransition =
    settle.phase === "scramble"
      ? "duration-300"
      : settle.phase === "countup"
        ? "duration-75"
        : "duration-150";

  return (
    <section>
      <p className="[font-family:var(--mp-mono-font)] text-[11px] tracking-[0.16em] uppercase text-[var(--mp-accent)] mb-3">
        {title}
      </p>
      <ul className="mb-4 flex flex-wrap gap-x-4 gap-y-1.5">
        {metrics.map((m) => (
          <li
            key={m.id}
            className="inline-flex items-center gap-1.5 [font-family:var(--mp-mono-font)] text-[10px] tracking-[0.08em] uppercase text-[var(--mp-muted-text)]"
          >
            <span className={`h-2 w-2.5 rounded-sm ${m.barClassName}`} aria-hidden />
            {m.label}
          </li>
        ))}
      </ul>
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
                  const v = m.valueOf(row);
                  const max = maxByMetric[metricIndex] ?? 0;
                  const settled =
                    max > 0 && v != null && Number.isFinite(v)
                      ? (v / max) * 100
                      : 0;
                  const scrambleIndex =
                    rowIndex * metrics.length + metricIndex;
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
                  const valueText = formatMetricValue(m.valueKind, display);
                  const calc = m.calcOf(row);
                  return (
                    <li
                      key={m.id}
                      className="group relative grid grid-cols-[6.5rem_1fr_3.25rem] items-center gap-2"
                      title={`${m.label}: ${valueText}`}
                    >
                      <span className="[font-family:var(--mp-mono-font)] text-[9px] tracking-[0.06em] uppercase text-[var(--mp-muted-text)] leading-tight">
                        {m.label}
                      </span>
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
                            label={label}
                            valueLine={`${valueText} · ${m.label}`}
                            calc={calc}
                            theme="light"
                          />
                        </div>
                      </div>
                      <span className="[font-family:var(--mp-mono-font)] text-[10px] tabular-nums text-[var(--mp-text)] text-right">
                        {valueText}
                      </span>
                    </li>
                  );
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
      <p className="[font-family:var(--mp-mono-font)] text-[10px] tracking-[0.14em] uppercase text-[var(--mp-muted-text)] mb-1.5">
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
   * Property-type filter (All / SFR / …). Rendered inside the pulse panel,
   * directly above the town-metrics chart title.
   */
  categoryFilter?: ReactNode;
  /** Closed-sales lookback window (Inventory / MOS / DOM stay current). */
  lookbackId?: MarketPulseLookbackId;
  onLookbackIdChange?: (id: MarketPulseLookbackId) => void;
}) {
  const [chartLayout, setChartLayout] = useState<ChartLayout>(
    DEFAULT_MARKET_PULSE_CHART_LAYOUT,
  );
  const [favorSort, setFavorSort] = useState<FavorSort>(
    DEFAULT_MARKET_PULSE_FAVOR_SORT,
  );
  /** Filters start collapsed — summary sentence stays visible. */
  const [filtersOpen, setFiltersOpen] = useState(false);
  const closedLookbackLabel = marketPulseLookbackChartLabel(lookbackId);
  const filterSummary = summarizeMarketPulseFilters({
    selectionLabel: selectionLabel ?? scopeLabel,
    chartLayout,
    favorSort,
    lookbackId,
  });

  const inventoryRows = useMemo(() => chartRows(snapshot), [snapshot]);
  const closedRows = snapshot.closedTrailing ?? [];
  const domRows = snapshot.avgDomByTown ?? [];
  const priceRows = snapshot.priceByTown ?? [];

  const allTownsAvgDom = useMemo(() => {
    const allRow = domRows.find((r) => isAllTownsCity(r.city));
    const v = allRow?.avgDaysOnMarket;
    return v != null && Number.isFinite(v) ? v : null;
  }, [domRows]);

  const mosByCity = useMemo(() => {
    const map = new Map<string, number | null>();
    for (const row of inventoryRows) {
      map.set(cityKey(row.city), row.monthsSupply ?? null);
    }
    return map;
  }, [inventoryRows]);

  const domByCity = useMemo(() => {
    const map = new Map<string, number | null>();
    for (const row of domRows) {
      map.set(cityKey(row.city), row.avgDaysOnMarket ?? null);
    }
    return map;
  }, [domRows]);

  const sortedInventory = useMemo(
    () =>
      sortRowsByBuyerFriendlyScore(
        inventoryRows,
        (r) => ({
          monthsSupply: mosByCity.get(cityKey(r.city)) ?? null,
          avgDaysOnMarket: domByCity.get(cityKey(r.city)) ?? null,
        }),
        favorSort,
        (r) => isAllTownsCity(r.city),
      ),
    [inventoryRows, favorSort, mosByCity, domByCity],
  );

  const sortedDom = useMemo(
    () =>
      sortRowsByBuyerFriendlyScore(
        domRows,
        (r) => ({
          monthsSupply: mosByCity.get(cityKey(r.city)) ?? null,
          avgDaysOnMarket: r.avgDaysOnMarket ?? null,
        }),
        favorSort,
        (r) => isAllTownsCity(r.city),
      ),
    [domRows, favorSort, mosByCity],
  );

  const sortedClosed = useMemo(
    () =>
      sortRowsByBuyerFriendlyScore(
        closedRows,
        (r) => ({
          monthsSupply: mosByCity.get(cityKey(r.city)) ?? null,
          avgDaysOnMarket: domByCity.get(cityKey(r.city)) ?? null,
        }),
        favorSort,
        (r) => isAllTownsCity(r.city),
      ),
    [closedRows, favorSort, mosByCity, domByCity],
  );

  const sortedMedianPrice = useMemo(
    () =>
      sortRowsByBuyerFriendlyScore(
        priceRows,
        (r) => ({
          monthsSupply: mosByCity.get(cityKey(r.city)) ?? null,
          avgDaysOnMarket: domByCity.get(cityKey(r.city)) ?? null,
        }),
        favorSort,
        (r) => isAllTownsCity(r.city),
      ),
    [priceRows, favorSort, mosByCity, domByCity],
  );

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
    `font-mono text-[10px] tracking-[0.1em] uppercase rounded-full px-2.5 py-1 border transition-colors ${
      active
        ? "border-[var(--mp-accent)] bg-[var(--mp-accent)]/15 text-[var(--mp-text)]"
        : "border-black/10 text-[var(--mp-muted-text)] hover:border-black/20 hover:text-[var(--mp-text)]"
    }`;

  return (
    <article className="mx-auto max-w-2xl">
      <header className="rounded-t-2xl bg-[var(--mp-surface)] px-6 py-7 sm:px-8">
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

      <div className="rounded-b-2xl border border-t-0 border-black/[0.08] bg-[var(--mp-card-bg)] px-6 py-7 sm:px-8 space-y-8 shadow-sm shadow-black/5">
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <Kpi
            label="Market active"
            final={snapshot.market?.activeCount}
            kind="int"
            settle={settle}
            salt={1}
          />
          <Kpi
            label="All Towns MOS"
            final={snapshot.market?.monthsSupply}
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

        <div className="space-y-2">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <button
              type="button"
              className="inline-flex items-center gap-1.5 font-mono text-[11px] tracking-[0.12em] uppercase text-[var(--mp-text)] underline decoration-[var(--mp-text)]/35 underline-offset-2 transition-colors hover:text-[var(--mp-accent)] hover:decoration-[var(--mp-accent)]/50"
              aria-expanded={filtersOpen}
              onClick={() => setFiltersOpen((open) => !open)}
            >
              Filters
              <span aria-hidden className="tabular-nums no-underline">
                {filtersOpen ? "−" : "+"}
              </span>
            </button>
            {!filtersOpen ? (
              <p className="min-w-0 [font-family:var(--mp-mono-font)] text-[10px] leading-snug text-[var(--mp-muted-text)]">
                {filterSummary}
              </p>
            ) : null}
          </div>

          {filtersOpen ? (
            <div className="flex flex-col gap-3 rounded-xl border border-black/[0.06] bg-[var(--mp-page-bg)]/60 px-3 py-3 sm:px-4">
              {categoryFilter ? (
                <div className="space-y-1.5">
                  <p className="[font-family:var(--mp-mono-font)] text-[10px] tracking-[0.12em] uppercase text-[var(--mp-muted-text)]">
                    Property type
                  </p>
                  {categoryFilter}
                </div>
              ) : null}

              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                <div
                  className="inline-flex flex-wrap gap-1.5"
                  role="group"
                  aria-label="Chart layout"
                >
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
                    onClick={() => {
                      setChartLayout("unstacked");
                      // Friend sorts only apply to the stacked composite.
                      setFavorSort("default");
                    }}
                  >
                    UNSTACKED
                  </button>
                </div>
                <div
                  className="inline-flex flex-wrap gap-1.5"
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
                      setChartLayout("stacked");
                    }}
                    title="Composite: lower months supply + shorter DOM first (more seller friendly). Tap again to clear."
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
                      setChartLayout("stacked");
                    }}
                    title="Composite: higher months supply + longer DOM first (more buyer friendly). Tap again to clear."
                  >
                    Buyer Friendly
                  </button>
                </div>
              </div>

              {onLookbackIdChange ? (
                <div className="space-y-1.5">
                  <p className="[font-family:var(--mp-mono-font)] text-[10px] tracking-[0.12em] uppercase text-[var(--mp-muted-text)]">
                    Closed lookback
                  </p>
                  <div
                    className="inline-flex flex-wrap gap-1.5"
                    role="group"
                    aria-label="Closed sales lookback period"
                  >
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
                    Applies to closed sales only. Inventory, months supply, avg
                    DOM, and prices stay current.
                  </p>
                </div>
              ) : null}

              {favorSort !== "default" ? (
                <p className="[font-family:var(--mp-mono-font)] text-[10px] text-[var(--mp-muted-text)]">
                  Sorted by buyer/seller friendly composite (months supply + avg
                  DOM
                  {favorSort === "sellers"
                    ? "; lower = more seller friendly"
                    : "; higher = more buyer friendly"}
                  ). All towns stays on top.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        {chartLayout === "stacked" ? (
          <CombinedMetricsChart
            title={`Town metrics stacked (${titleScope})`}
            rows={combinedRows}
            townHref={townHref}
            settle={settle}
            closedLookbackLabel={closedLookbackLabel}
          />
        ) : (
          <>
        <BarChart
          title={`Active inventory (${titleScope})`}
          rows={sortedInventory}
          valueOf={(r) => r.activeCount}
          valueKind="int"
          barClassName={METRIC_COLORS.inventory}
          emptyMessage="No inventory rows in cache yet."
          townHref={townHref}
          settle={settle}
          calcOf={(r) => r.activeCountCalc}
          sortable
        />

        <BarChart
          title={`Months supply (${scopeLabel})`}
          rows={sortedInventory}
          valueOf={(r) => r.monthsSupply}
          valueKind="mos"
          barClassName={METRIC_COLORS.monthsSupply}
          emptyMessage="No months-supply rows in cache yet."
          townHref={monthsSupplyTownHref ?? townHref}
          settle={settle}
          calcOf={(r) => r.monthsSupplyCalc}
          sortable
        />

        <BarChart
          title={`Avg days on market (${titleScope})`}
          rows={sortedDom}
          valueOf={(r) => r.avgDaysOnMarket}
          valueKind="dom"
          barClassName={METRIC_COLORS.avgDom}
          emptyMessage="No days-on-market rows in cache yet."
          townHref={avgDomTownHref ?? townHref}
          settle={settle}
          calcOf={(r) => r.avgDaysOnMarketCalc}
          sortable
        />

        <BarChart
          title={`Closed sales — trailing ${closedLookbackLabel} (${titleScope})`}
          rows={sortedClosed}
          valueOf={(r) => r.count}
          valueKind="int"
          sortable
          barClassName={METRIC_COLORS.closed}
          emptyMessage={
            closedPending
              ? "Loading closed sales for this lookback…"
              : "No closed sales in this lookback window (or the count request failed — try another period)."
          }
          townHref={closedSalesTownHref}
          settle={settle}
          calcOf={(r) => r.calc}
        />

        <BarChart
          title={`Median price (${titleScope})`}
          rows={sortedMedianPrice}
          valueOf={(r) => r.medianPrice}
          valueKind="money"
          sortable
          barClassName={METRIC_COLORS.medianPrice}
          emptyMessage="No median price rows in cache yet (rebuild market stats)."
          townHref={townHref}
          settle={settle}
          calcOf={(r) => r.medianPriceCalc}
        />

        <BarChart
          title={`Average price (${titleScope})`}
          rows={sortedMedianPrice}
          valueOf={(r) => r.averagePrice}
          valueKind="money"
          sortable
          barClassName={METRIC_COLORS.averagePrice}
          emptyMessage="No average price rows yet — run a stats rebuild to fill means (median still shows from older cache)."
          townHref={townHref}
          settle={settle}
          calcOf={(r) => r.averagePriceCalc}
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
    </article>
  );
}
