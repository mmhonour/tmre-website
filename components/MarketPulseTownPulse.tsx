"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import MarketPulseDeltaLabel from "@/components/MarketPulseDeltaLabel";
import MarketPulseHeatStrip from "@/components/MarketPulseHeatStrip";
import { StatsCalcTooltipShell } from "@/components/StatsCalcTooltip";
import {
  BAR_EXTERIOR_LANE,
  BAR_VALUE_ON_EMPTY,
  barAsidePlacement,
  BarValueOverlay,
  formatMetricValue,
  METRIC_COLORS,
  type MetricValueKind,
} from "@/components/market-pulse-bar";
import type { ListingKind } from "@/lib/listing-kind";
import type { MarketPulseCombinedTownRow } from "@/lib/market-pulse-combined-rows";
import {
  formatClosedCountWithLookback,
  marketPulseLookbackChartLabel,
  type MarketPulseLookbackId,
} from "@/lib/market-pulse-lookback";
import {
  formatPriceDeltaK,
  formatPriceDeltaPct,
} from "@/lib/market-pulse-price-delta";
import {
  MARKET_PULSE_SETTLE_IDLE,
  settleBarPercent,
  settleIntDisplay,
  settleMosDisplay,
  settleSignedNumber,
  type MarketPulseSettleState,
} from "@/lib/market-pulse-settle";
import {
  formatSaleToAskPct,
  marketPulseDeltaBarSpan,
  marketPulsePricePct,
  marketPulseStackedMetrics,
  type MarketPulseStackedMetricId,
} from "@/lib/market-pulse-stacked-metrics";
import {
  marketPulseMetricMax,
  marketPulseTownScale,
  type MarketPulseTownScale,
} from "@/lib/market-pulse-town-scale";
import type { StatsValueCalc } from "@/lib/stats-compute";

type Row = MarketPulseCombinedTownRow;

/** Web chrome for each stacked metric — colour, value shape, hover methodology. */
export function marketPulseTownMetrics(
  closedLookbackLabel: string,
  kind: ListingKind,
) {
  const chrome: Record<
    MarketPulseStackedMetricId,
    {
      barClassName: string;
      valueKind: MetricValueKind;
      calcOf: (r: Row) => StatsValueCalc | undefined;
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
    priceDelta: {
      barClassName: METRIC_COLORS.priceDelta,
      valueKind: "money",
      calcOf: (r) =>
        r.priceDelta == null
          ? undefined
          : {
              summary:
                "Average minus median on the same closed pool — a high-end tail pulls the average above the typical sale.",
              detail: [
                `Average ${r.averagePrice ?? "—"} − median ${r.medianPrice ?? "—"}`,
              ],
            },
    },
    averagePrice: {
      barClassName: METRIC_COLORS.averagePrice,
      valueKind: "money",
      calcOf: (r) => r.averagePriceCalc,
    },
    saleToAsk: {
      barClassName: METRIC_COLORS.saleToAsk,
      valueKind: "int",
      calcOf: (r) => r.saleToAskCalc,
    },
  };

  return marketPulseStackedMetrics(closedLookbackLabel, kind).map((m) => ({
    ...m,
    ...chrome[m.id],
    valueOf: m.barValueOf,
  }));
}

export type MarketPulseTownMetric = ReturnType<
  typeof marketPulseTownMetrics
>[number];

/**
 * One town's pulse: its name, its buyer/seller heat, and the stacked bars.
 *
 * This is the stacked view's town block, and only that. The unstacked view is
 * one chart per metric ranking every town against each other, which has no
 * single-town form to lift out, so a listing page always shows this.
 *
 * Self-contained on purpose. Everything that comes from the towns around it
 * arrives in `scale`, so a host with a single town — a listing page showing the
 * pulse for the town that listing sits in — renders the same markup as the
 * brief does, on axes that agree with it. Pass `heading` to control how the
 * name behaves: Market Pulse hands it an expandable control, a panel a plain
 * label.
 */
export default function MarketPulseTownPulse({
  row,
  scale,
  lookbackId,
  kind = "sale",
  scopeLabel = "sales",
  heading,
  townLabel,
  saleToAskHref,
  closedPending = false,
  settle = MARKET_PULSE_SETTLE_IDLE,
  scramble,
  metrics: metricsProp,
}: {
  row: Row;
  /** Ceilings and heat from the whole town set — see `marketPulseTownScale`. */
  scale: MarketPulseTownScale;
  lookbackId: MarketPulseLookbackId;
  kind?: ListingKind;
  scopeLabel?: string;
  /** Town name element. Falls back to plain text when omitted. */
  heading?: ReactNode;
  townLabel: string;
  /** Makes the List to ask row label a link to its Stats chart. */
  saleToAskHref?: string;
  closedPending?: boolean;
  settle?: MarketPulseSettleState;
  /** Scramble frame shared with sibling towns, and this town's slot in it. */
  scramble?: { values: number[] | null; rowIndex: number; townCount: number };
  /** Reuse the caller's metric list rather than rebuilding it per town. */
  metrics?: MarketPulseTownMetric[];
}) {
  const closedLookbackLabel = marketPulseLookbackChartLabel(lookbackId);
  const metrics =
    metricsProp ?? marketPulseTownMetrics(closedLookbackLabel, kind);
  const barScramble = scramble?.values ?? null;
  const rowIndex = scramble?.rowIndex ?? 0;
  const townCount = scramble?.townCount ?? 1;
  const heat = scale.heatByCity.get(row.city) ?? null;

  const widthTransition =
    settle.phase === "scramble"
      ? "duration-300"
      : settle.phase === "countup"
        ? "duration-75"
        : "duration-150";

  function metricRow(m: MarketPulseTownMetric, metricIndex: number) {
    const v = m.valueOf(row);
    const max = marketPulseMetricMax(scale, m.id);
    const settled =
      max > 0 && v != null && Number.isFinite(v) ? (v / max) * 100 : 0;
    const scrambleIndex = rowIndex * metrics.length + metricIndex;
    const settledPct = (metricId: "medianPrice" | "averagePrice") => {
      const idx = metrics.findIndex((x) => x.id === metricId);
      return settleBarPercent(
        marketPulsePricePct(
          metricId === "medianPrice" ? row.medianPrice : row.averagePrice,
          scale.priceMax,
        ),
        rowIndex * metrics.length + (idx >= 0 ? idx : metricIndex),
        settle,
        barScramble,
      );
    };
    const aligned =
      m.id === "priceDelta"
        ? marketPulseDeltaBarSpan(
            settledPct("medianPrice"),
            settledPct("averagePrice"),
          )
        : {
            leftPct: 0,
            widthPct: settleBarPercent(
              settled,
              scrambleIndex,
              settle,
              barScramble,
            ),
          };
    const display =
      m.valueKind === "mos"
        ? settleMosDisplay(v, settle, scrambleIndex)
        : settleIntDisplay(v, settle, scrambleIndex);
    const deltaDollars =
      m.id === "priceDelta"
        ? settleSignedNumber(row.priceDelta, settle, scrambleIndex, 0)
        : m.id === "saleToAsk"
          ? settleSignedNumber(row.saleToAskDollars, settle, scrambleIndex, 0)
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
        : m.id === "priceDelta" || m.id === "saleToAsk"
          ? formatPriceDeltaK(deltaDollars)
          : formatMetricValue(m.valueKind, display);
    const calc = m.calcOf(row);
    // The bar overlay carries the ratio here, so the web label stays plain.
    // labelOf still holds it for the email and text digest, which have no overlay.
    const stackedLabel =
      m.id === "saleToAsk" ? m.label : (m.labelOf?.(row) ?? m.label);
    const asideText =
      m.id === "priceDelta"
        ? formatPriceDeltaPct(deltaPct)
        : m.id === "saleToAsk"
          ? formatSaleToAskPct(row.saleToAskPct)
          : undefined;
    // List to ask is a level in the high 90s, so only Delta can run negative.
    const asidePlacement = barAsidePlacement(
      aligned.leftPct,
      aligned.widthPct,
      m.id === "priceDelta" && (row.priceDeltaPct ?? 0) < 0,
    );
    const asideOnLabel = asidePlacement === "label" ? asideText : undefined;
    return (
      <li
        key={m.id}
        className="group relative grid grid-cols-[5.75rem_1fr] items-center gap-1.5 sm:grid-cols-[9.5rem_1fr] sm:gap-2"
        title={m.id === "priceDelta" ? undefined : `${m.label}: ${valueText}`}
      >
        {/* Labels right-align against the bar rather than flush under the town. */}
        {m.id === "priceDelta" ? (
          <span className="[font-family:var(--mp-mono-font)] text-[9px] tracking-[0.06em] uppercase text-[var(--mp-muted-text)] leading-tight text-right">
            <MarketPulseDeltaLabel pctLabel={asideOnLabel} />
          </span>
        ) : (
          <span className="[font-family:var(--mp-mono-font)] text-[9px] tracking-[0.06em] uppercase text-[var(--mp-muted-text)] leading-tight text-right">
            {m.id === "saleToAsk" && saleToAskHref ? (
              <Link
                href={saleToAskHref}
                title={`${stackedLabel} on Stats — chart and data table`}
                className="underline decoration-[var(--mp-muted-text)]/40 underline-offset-2 transition-colors hover:text-[var(--mp-accent)] hover:decoration-[var(--mp-accent)]/50"
              >
                {stackedLabel}
              </Link>
            ) : (
              stackedLabel
            )}
            {asideOnLabel ? (
              <span className="ml-1 shrink-0 tabular-nums text-[var(--mp-text)]">
                {asideOnLabel}
              </span>
            ) : null}
          </span>
        )}
        <div
          className={`relative h-4 rounded-sm bg-[var(--mp-track,rgba(0,0,0,0.10))] overflow-visible ${BAR_EXTERIOR_LANE}`}
        >
          <div className="h-full overflow-hidden rounded-sm">
            <div
              className={`h-full rounded-sm transition-[width,margin-left] ease-out ${widthTransition} ${m.barClassName}`}
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
            // Gold months-supply fill reads fine under the standard text.
            colorClass={
              m.id === "monthsSupply" ? BAR_VALUE_ON_EMPTY : undefined
            }
          />
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
      </li>
    );
  }

  return (
    <>
      {/* Heat strip ends where the bar tracks do, so the two read as one chart. */}
      <div
        className={`flex min-w-0 items-center justify-between gap-3 ${BAR_EXTERIOR_LANE}`}
      >
        {heading ?? (
          <span className="[font-family:var(--mp-heading-font)] text-sm text-[var(--mp-text)] truncate">
            {townLabel}
          </span>
        )}
        {heat != null ? (
          <MarketPulseHeatStrip
            townLabel={townLabel}
            pct={settleBarPercent(
              heat * 100,
              townCount * metrics.length + rowIndex,
              settle,
              barScramble,
            )}
            peerCount={scale.peerCount}
            scopeLabel={scopeLabel}
          />
        ) : null}
      </div>
      <ul className="space-y-1.5">
        {metrics.map((m, metricIndex) => {
          if (m.id === "averagePrice" || m.id === "priceDelta") return null;
          if (m.id === "medianPrice") {
            // Delta spans the gap between median and average, so it only reads
            // right sandwiched between the two bars it measures.
            const delta = metrics.find((x) => x.id === "priceDelta");
            const deltaIndex = metrics.findIndex((x) => x.id === "priceDelta");
            const avg = metrics.find((x) => x.id === "averagePrice");
            const avgIndex = metrics.findIndex((x) => x.id === "averagePrice");
            return (
              <li key="price-sandwich" className="space-y-0">
                <ul className="space-y-0">
                  {metricRow(m, metricIndex)}
                  {delta ? metricRow(delta, deltaIndex) : null}
                  {avg ? metricRow(avg, avgIndex) : null}
                </ul>
              </li>
            );
          }
          return metricRow(m, metricIndex);
        })}
      </ul>
    </>
  );
}

/**
 * Convenience for a host that holds the whole town set and wants one town's
 * pulse without wiring the scale by hand — the shape a listing page needs.
 */
export function marketPulseTownPulseScale(
  rows: readonly MarketPulseCombinedTownRow[],
  options: {
    lookbackId: MarketPulseLookbackId;
    kind?: ListingKind;
    closedBarMax?: number;
  },
): MarketPulseTownScale {
  return marketPulseTownScale(rows, {
    closedLookbackLabel: marketPulseLookbackChartLabel(options.lookbackId),
    kind: options.kind,
    closedBarMax: options.closedBarMax,
  });
}
