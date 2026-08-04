"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { StatsCalcTooltipShell } from "@/components/StatsCalcTooltip";
import { fmtMoney } from "@/lib/listing-history";
import {
  MARKET_DIGEST_CLOSED_TRAILING_MONTHS,
  type MarketDigestClosedTownCount,
  type MarketDigestDomTownCount,
  type MarketDigestSnapshot,
} from "@/lib/market-digest-types";
import type { MonthsSupplyPayload } from "@/lib/months-supply-types";
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

type ChartLayout = "separate" | "combined";
/** Sellers = tightest (low MOS) first; buyers = loosest (high MOS) first. */
type FavorSort = "default" | "sellers" | "buyers";

const METRIC_COLORS = {
  inventory: "bg-[var(--mp-inventory-bar)]",
  monthsSupply: "bg-[var(--mp-months-supply-bar)]",
  avgDom: "bg-[var(--mp-avg-dom-bar,#5B8A72)]",
  closed: "bg-[var(--mp-closed-bar,#C45C4A)]",
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

/** Sort towns by months supply (seller vs buyer favorability). All towns stays first. */
function sortRowsByFavor<T extends { city: string }>(
  rows: T[],
  monthsSupplyOf: (row: T) => number | null | undefined,
  favor: FavorSort,
): T[] {
  if (favor === "default") return rows;
  const head = rows.filter((r) => isAllTownsCity(r.city));
  const rest = rows.filter((r) => !isAllTownsCity(r.city));
  const sorted = [...rest].sort((a, b) => {
    const ma = monthsSupplyOf(a);
    const mb = monthsSupplyOf(b);
    const aOk = ma != null && Number.isFinite(ma);
    const bOk = mb != null && Number.isFinite(mb);
    if (!aOk && !bOk) return 0;
    if (!aOk) return 1;
    if (!bOk) return -1;
    return favor === "sellers" ? ma! - mb! : mb! - ma!;
  });
  return [...head, ...sorted];
}

type CombinedTownRow = {
  city: string;
  activeCount: number | null;
  monthsSupply: number | null;
  avgDaysOnMarket: number | null;
  closedCount: number | null;
  activeCountCalc?: StatsValueCalc;
  monthsSupplyCalc?: StatsValueCalc;
  avgDaysOnMarketCalc?: StatsValueCalc;
  closedCalc?: StatsValueCalc;
};

function buildCombinedTownRows(
  inventory: MonthsSupplyPayload[],
  domRows: MarketDigestDomTownCount[],
  closedRows: MarketDigestClosedTownCount[],
): CombinedTownRow[] {
  const domBy = new Map(
    domRows.map((r) => [cityKey(r.city), r] as const),
  );
  const closedBy = new Map(
    closedRows.map((r) => [cityKey(r.city), r] as const),
  );
  return inventory.map((row) => {
    const key = cityKey(row.city);
    const dom = domBy.get(key);
    const closed = closedBy.get(key);
    return {
      city: row.city,
      activeCount: row.activeCount ?? null,
      monthsSupply: row.monthsSupply ?? null,
      avgDaysOnMarket: dom?.avgDaysOnMarket ?? null,
      closedCount: closed?.count ?? null,
      activeCountCalc: row.activeCountCalc,
      monthsSupplyCalc: row.monthsSupplyCalc,
      avgDaysOnMarketCalc: dom?.avgDaysOnMarketCalc,
      closedCalc: closed?.calc,
    };
  });
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
}: {
  title: string;
  rows: Row[];
  valueOf: (row: Row) => number | null;
  valueKind: "int" | "mos" | "dom";
  barClassName: string;
  emptyMessage: string;
  townHref?: (cityLabel: string) => string;
  settle: MarketPulseSettleState;
  /** Cached methodology from stats / closed cache — never computed in the client. */
  calcOf?: (row: Row) => StatsValueCalc | undefined;
}) {
  const [barScramble, setBarScramble] = useState<number[] | null>(null);

  useEffect(() => {
    if (settle.phase !== "scramble" || rows.length === 0) {
      setBarScramble(null);
      return;
    }
    setBarScramble(randomBarPercents(rows.length));
  }, [settle.phase, settle.tick, rows.length]);

  if (rows.length === 0) {
    return (
      <section>
        <p className="[font-family:var(--mp-mono-font)] text-[11px] tracking-[0.16em] uppercase text-[var(--mp-accent)] mb-3">
          {title}
        </p>
        <p className="[font-family:var(--mp-heading-font)] text-sm text-[var(--mp-muted-text)]">
          {emptyMessage}
        </p>
      </section>
    );
  }

  const max = Math.max(
    0,
    ...rows.map((r) => {
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
      <p className="[font-family:var(--mp-mono-font)] text-[11px] tracking-[0.16em] uppercase text-[var(--mp-accent)] mb-4">
        {title}
      </p>
      <ul className="space-y-2.5">
        {rows.map((row, index) => {
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
          const valueText =
            valueKind === "mos"
              ? fmtMos(display)
              : valueKind === "dom"
                ? fmtDom(display)
                : fmtActive(display);
          const calc = calcOf?.(row);
          const metricLabel =
            valueKind === "mos"
              ? "Months supply"
              : valueKind === "dom"
                ? "Avg days on market"
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

const COMBINED_METRICS = [
  {
    id: "inventory",
    label: "Inventory",
    short: "Inv",
    barClassName: METRIC_COLORS.inventory,
    valueKind: "int" as const,
    valueOf: (r: CombinedTownRow) => r.activeCount,
    calcOf: (r: CombinedTownRow) => r.activeCountCalc,
  },
  {
    id: "monthsSupply",
    label: "Months supply",
    short: "MOS",
    barClassName: METRIC_COLORS.monthsSupply,
    valueKind: "mos" as const,
    valueOf: (r: CombinedTownRow) => r.monthsSupply,
    calcOf: (r: CombinedTownRow) => r.monthsSupplyCalc,
  },
  {
    id: "avgDom",
    label: "Avg DOM",
    short: "DOM",
    barClassName: METRIC_COLORS.avgDom,
    valueKind: "dom" as const,
    valueOf: (r: CombinedTownRow) => r.avgDaysOnMarket,
    calcOf: (r: CombinedTownRow) => r.avgDaysOnMarketCalc,
  },
  {
    id: "closed",
    label: `Closed (${MARKET_DIGEST_CLOSED_TRAILING_MONTHS}mo)`,
    short: "Cls",
    barClassName: METRIC_COLORS.closed,
    valueKind: "int" as const,
    valueOf: (r: CombinedTownRow) => r.closedCount,
    calcOf: (r: CombinedTownRow) => r.closedCalc,
  },
] as const;

/** One town block with four stacked metric bars (each normalized to its own max). */
function CombinedMetricsChart({
  title,
  rows,
  townHref,
  settle,
}: {
  title: string;
  rows: CombinedTownRow[];
  townHref?: (cityLabel: string) => string;
  settle: MarketPulseSettleState;
}) {
  const [barScramble, setBarScramble] = useState<number[] | null>(null);

  useEffect(() => {
    if (settle.phase !== "scramble" || rows.length === 0) {
      setBarScramble(null);
      return;
    }
    setBarScramble(randomBarPercents(rows.length * COMBINED_METRICS.length));
  }, [settle.phase, settle.tick, rows.length]);

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

  const maxByMetric = COMBINED_METRICS.map((m) =>
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
        {COMBINED_METRICS.map((m) => (
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
                {COMBINED_METRICS.map((m, metricIndex) => {
                  const v = m.valueOf(row);
                  const max = maxByMetric[metricIndex] ?? 0;
                  const settled =
                    max > 0 && v != null && Number.isFinite(v)
                      ? (v / max) * 100
                      : 0;
                  const scrambleIndex =
                    rowIndex * COMBINED_METRICS.length + metricIndex;
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
                  const valueText =
                    m.valueKind === "mos"
                      ? fmtMos(display)
                      : m.valueKind === "dom"
                        ? fmtDom(display)
                        : fmtActive(display);
                  const calc = m.calcOf(row);
                  return (
                    <li
                      key={m.id}
                      className="group relative grid grid-cols-[3.25rem_1fr_3.25rem] items-center gap-2"
                      title={`${m.label}: ${valueText}`}
                    >
                      <span className="[font-family:var(--mp-mono-font)] text-[9px] tracking-[0.08em] uppercase text-[var(--mp-muted-text)] truncate">
                        {m.short}
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
  kind: "int" | "mos";
  settle: MarketPulseSettleState;
  salt: number;
}) {
  const display =
    kind === "mos"
      ? settleMosDisplay(final, settle, salt)
      : settleIntDisplay(final, settle, salt);
  const text =
    kind === "mos"
      ? final == null && settle.phase === "done"
        ? "—"
        : fmtMos(display)
      : final == null && settle.phase === "done"
        ? "—"
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
}) {
  const [chartLayout, setChartLayout] = useState<ChartLayout>("separate");
  const [favorSort, setFavorSort] = useState<FavorSort>("default");

  const inventoryRows = useMemo(() => chartRows(snapshot), [snapshot]);
  const closedRows = snapshot.closedTrailing ?? [];
  const domRows = snapshot.avgDomByTown ?? [];

  const mosByCity = useMemo(() => {
    const map = new Map<string, number | null>();
    for (const row of inventoryRows) {
      map.set(cityKey(row.city), row.monthsSupply ?? null);
    }
    return map;
  }, [inventoryRows]);

  const sortedInventory = useMemo(
    () =>
      sortRowsByFavor(inventoryRows, (r) => r.monthsSupply, favorSort),
    [inventoryRows, favorSort],
  );

  const sortedDom = useMemo(
    () =>
      sortRowsByFavor(
        domRows,
        (r) => mosByCity.get(cityKey(r.city)) ?? null,
        favorSort,
      ),
    [domRows, mosByCity, favorSort],
  );

  const sortedClosed = useMemo(
    () =>
      sortRowsByFavor(
        closedRows,
        (r) => mosByCity.get(cityKey(r.city)) ?? null,
        favorSort,
      ),
    [closedRows, mosByCity, favorSort],
  );

  const combinedRows = useMemo(() => {
    const built = buildCombinedTownRows(
      inventoryRows,
      domRows,
      closedRows,
    );
    return sortRowsByFavor(built, (r) => r.monthsSupply, favorSort);
  }, [inventoryRows, domRows, closedRows, favorSort]);

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
            label="Market MOS"
            final={snapshot.market?.monthsSupply}
            kind="mos"
            settle={settle}
            salt={2}
          />
          <Kpi
            label="Westport MOS"
            final={snapshot.westport?.monthsSupply}
            kind="mos"
            settle={settle}
            salt={3}
          />
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div
            className="inline-flex flex-wrap gap-1.5"
            role="group"
            aria-label="Chart layout"
          >
            <button
              type="button"
              className={controlBtn(chartLayout === "separate")}
              aria-pressed={chartLayout === "separate"}
              onClick={() => setChartLayout("separate")}
            >
              Separate charts
            </button>
            <button
              type="button"
              className={controlBtn(chartLayout === "combined")}
              aria-pressed={chartLayout === "combined"}
              onClick={() => setChartLayout("combined")}
            >
              Combined (4 bars)
            </button>
          </div>
          <div
            className="inline-flex flex-wrap gap-1.5"
            role="group"
            aria-label="Town sort by market favorability"
          >
            <button
              type="button"
              className={controlBtn(favorSort === "default")}
              aria-pressed={favorSort === "default"}
              onClick={() => setFavorSort("default")}
              title="Snapshot order (All towns first)"
            >
              Default order
            </button>
            <button
              type="button"
              className={controlBtn(favorSort === "sellers")}
              aria-pressed={favorSort === "sellers"}
              onClick={() => setFavorSort("sellers")}
              title="Lowest months supply first — tightest / most seller-favorable"
            >
              Sellers first
            </button>
            <button
              type="button"
              className={controlBtn(favorSort === "buyers")}
              aria-pressed={favorSort === "buyers"}
              onClick={() => setFavorSort("buyers")}
              title="Highest months supply first — loosest / most buyer-favorable"
            >
              Buyers first
            </button>
          </div>
        </div>
        {favorSort !== "default" ? (
          <p className="[font-family:var(--mp-mono-font)] text-[10px] text-[var(--mp-muted-text)] -mt-5">
            Sorted by months supply
            {favorSort === "sellers"
              ? " (low → high = sellers)"
              : " (high → low = buyers)"}
            . All towns stays on top.
          </p>
        ) : null}

        {chartLayout === "combined" ? (
          <CombinedMetricsChart
            title={`Town metrics combined (${titleScope})`}
            rows={combinedRows}
            townHref={townHref}
            settle={settle}
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
        />

        <BarChart
          title={`Closed sales — trailing ${MARKET_DIGEST_CLOSED_TRAILING_MONTHS} months (${titleScope})`}
          rows={sortedClosed}
          valueOf={(r) => r.count}
          valueKind="int"
          barClassName={METRIC_COLORS.closed}
          emptyMessage="Loading closed sales…"
          townHref={closedSalesTownHref}
          settle={settle}
          calcOf={(r) => r.calc}
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
      </div>
    </article>
  );
}
