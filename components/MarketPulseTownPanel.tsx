"use client";

import type { ReactNode } from "react";
import {
  formatMetricValue,
  PANEL_SURFACE,
  PanelBarRow,
  type PanelBarFillDeltaInk,
} from "@/components/market-pulse-bar";
import type { ListingKind } from "@/lib/listing-kind";
import {
  isAllTownsCity,
  type MarketPulseCombinedTownRow,
} from "@/lib/market-pulse-combined-rows";
import {
  formatClosedCountWithLookback,
  marketPulseLookbackChartLabel,
  type MarketPulseLookbackId,
} from "@/lib/market-pulse-lookback";
import {
  formatPriceDeltaK,
  formatPriceDeltaPct,
} from "@/lib/market-pulse-price-delta";
import MarketPulseFavorabilityBar from "@/components/MarketPulseFavorabilityBar";
import {
  MARKET_PULSE_SETTLE_IDLE,
  settleBarPercent,
  settleIntDisplay,
  settleMosDisplay,
  settleSignedNumber,
  type MarketPulseSettleState,
} from "@/lib/market-pulse-settle";
import Link from "next/link";
import {
  formatSaleToAskPct,
  marketPulseDeltaBarSpan,
  marketPulsePricePct,
} from "@/lib/market-pulse-stacked-metrics";
import {
  marketPulseMetricMax,
  type MarketPulseTownScale,
} from "@/lib/market-pulse-town-scale";
import {
  marketPulseTownMetrics,
  type MarketPulseTownMetric,
} from "@/components/market-pulse-metrics";
import {
  marketPulseFillDeltaText,
  type MarketPulseWowCompare,
} from "@/lib/market-pulse-wow";

/**
 * A town's pulse drawn the way the listing showcase draws it — dark panel, one
 * gold ink across every bar, the value in its own column — with one deliberate
 * departure: the percent keeps Market Pulse's placement instead of riding in
 * the row label. It follows the fill it describes, and hops past the track's
 * right border once the fill reaches the end.
 */
export default function MarketPulseTownPanel({
  row,
  scale,
  lookbackId,
  kind = "sale",
  townLabel,
  heading,
  saleToAskHref,
  metricHref,
  metrics: metricsProp,
  closedPending = false,
  settle = MARKET_PULSE_SETTLE_IDLE,
  scramble,
  tabs,
  caption,
  compare = null,
  fillDeltaInk = "black",
}: {
  row: MarketPulseCombinedTownRow;
  scale: MarketPulseTownScale;
  lookbackId: MarketPulseLookbackId;
  kind?: ListingKind;
  townLabel: string;
  /** Town name element. Falls back to plain text when omitted. */
  heading?: ReactNode;
  /** Makes the TRAN$ACT to LIST row label a link to its Stats chart. */
  saleToAskHref?: string;
  /** Stats chart behind each bar, by metric id. Null where none exists. */
  metricHref?: (metricId: string) => string | null;
  metrics?: MarketPulseTownMetric[];
  closedPending?: boolean;
  settle?: MarketPulseSettleState;
  /** Scramble frame shared with sibling towns, and this town's slot in it. */
  scramble?: { values: number[] | null; rowIndex: number; townCount: number };
  /** Property-type buttons, in the showcase's pill style. */
  tabs?: ReactNode;
  caption?: ReactNode;
  /** Prior-week change, drawn in the middle of each shaded fill. */
  compare?: MarketPulseWowCompare | null;
  fillDeltaInk?: PanelBarFillDeltaInk;
}) {
  const closedLookbackLabel = marketPulseLookbackChartLabel(lookbackId);
  const metrics =
    metricsProp ?? marketPulseTownMetrics(closedLookbackLabel, kind);
  const barScramble = scramble?.values ?? null;
  const rowIndex = scramble?.rowIndex ?? 0;
  const townCount = scramble?.townCount ?? 1;
  const widthTransition =
    settle.phase === "scramble"
      ? "duration-300"
      : settle.phase === "countup"
        ? "duration-75"
        : "duration-150";
  const heat = scale.heatByCity.get(row.city) ?? null;
  // The composite is the towns summed and averaged, so ranking it against a
  // count of them reads as nonsense. The spectrum still places it.
  const aggregate = isAllTownsCity(row.city);

  return (
    <div className={PANEL_SURFACE}>
      {/*
       * Name sits beside the spectrum, which gives up exactly the width the
       * name takes, so a longer town simply condenses it. Sized to the row
       * labels rather than carrying its own heading type.
       */}
      <div className="flex items-center gap-3">
        <span className="shrink-0 [font-family:var(--mp-mono-font)] text-[11px] tracking-[0.1em] text-gold">
          {heading ?? townLabel}
        </span>
        <div className="min-w-0 flex-1">
          <MarketPulseFavorabilityBar
            score={
              heat == null
                ? null
                : settleBarPercent(
                    heat * 100,
                    townCount * metrics.length + rowIndex,
                    settle,
                    barScramble,
                  ) / 100
            }
            peerCount={aggregate ? null : scale.peerCount}
          />
        </div>
      </div>

      {tabs ? <div className="mt-3">{tabs}</div> : null}

      <div className="mt-2 divide-y divide-white/[0.08] border-t border-white/[0.08]">
        {metrics.map((m, metricIndex) => {
          const value = m.valueOf(row);
          const max = marketPulseMetricMax(scale, m.id);
          const pct =
            max > 0 && value != null && Number.isFinite(value)
              ? (Math.abs(value) / max) * 100
              : 0;
          const scrambleIndex = rowIndex * metrics.length + metricIndex;
          const settledPct = (id: "medianPrice" | "averagePrice") => {
            const idx = metrics.findIndex((x) => x.id === id);
            return settleBarPercent(
              marketPulsePricePct(
                id === "medianPrice" ? row.medianPrice : row.averagePrice,
                scale.priceMax,
              ),
              rowIndex * metrics.length + (idx >= 0 ? idx : metricIndex),
              settle,
              barScramble,
            );
          };
          const settledTaxPct = (id: "medianTax" | "averageTax") => {
            const idx = metrics.findIndex((x) => x.id === id);
            return settleBarPercent(
              marketPulsePricePct(
                id === "medianTax" ? row.medianTax : row.averageTax,
                scale.taxMax,
              ),
              rowIndex * metrics.length + (idx >= 0 ? idx : metricIndex),
              settle,
              barScramble,
            );
          };
          // Delta spans the gap between median and average rather than starting
          // at zero, which is the edge the percent is placed against.
          const aligned =
            m.id === "priceDelta"
              ? marketPulseDeltaBarSpan(
                  settledPct("medianPrice"),
                  settledPct("averagePrice"),
                )
              : m.id === "taxDelta"
                ? marketPulseDeltaBarSpan(
                    settledTaxPct("medianTax"),
                    settledTaxPct("averageTax"),
                  )
              : {
                  leftPct: 0,
                  widthPct: settleBarPercent(
                    Math.min(100, pct),
                    scrambleIndex,
                    settle,
                    barScramble,
                  ),
                };

          const display =
            m.valueKind === "mos"
              ? settleMosDisplay(value, settle, scrambleIndex)
              : settleIntDisplay(value, settle, scrambleIndex);
          const closedCountText =
            m.id === "closed"
              ? closedPending
                ? "…"
                : formatMetricValue(m.valueKind, display)
              : null;
          const valueText =
            closedCountText != null
              ? formatClosedCountWithLookback(
                  closedLookbackLabel,
                  closedCountText,
                )
              : m.id === "priceDelta"
                ? formatPriceDeltaK(
                    settleSignedNumber(row.priceDelta, settle, scrambleIndex, 0),
                  )
                : m.id === "taxDelta"
                  ? formatPriceDeltaK(
                      settleSignedNumber(row.taxDelta, settle, scrambleIndex, 0),
                    )
                : m.id === "saleToAsk"
                  ? formatPriceDeltaK(
                      settleSignedNumber(
                        row.saleToAskDollars,
                        settle,
                        scrambleIndex,
                        0,
                      ),
                    )
                  : formatMetricValue(m.valueKind, display);

          const asideText =
            m.id === "priceDelta"
              ? formatPriceDeltaPct(
                  settleSignedNumber(
                    row.priceDeltaPct,
                    settle,
                    scrambleIndex + 19,
                    1,
                  ),
                )
              : m.id === "taxDelta"
                ? formatPriceDeltaPct(
                    settleSignedNumber(
                      row.taxDeltaPct,
                      settle,
                      scrambleIndex + 19,
                      1,
                    ),
                  )
              : m.id === "saleToAsk"
                ? formatSaleToAskPct(row.saleToAskPct)
                : null;
          return (
            <PanelBarRow
              key={m.id}
              label={
                m.id === "saleToAsk" && saleToAskHref ? (
                  <Link
                    href={saleToAskHref}
                    title={`${m.labelOf?.(row) ?? m.label} on Stats — chart and data table`}
                    className="underline decoration-white/25 underline-offset-2 transition-colors hover:text-gold"
                  >
                    {m.labelOf?.(row) ?? m.label}
                  </Link>
                ) : (
                  (m.labelOf?.(row) ?? m.label)
                )
              }
              valueText={valueText}
              leftPct={aligned.leftPct}
              widthPct={aligned.widthPct}
              aside={asideText}
              asideNegative={
                (m.id === "priceDelta" && (row.priceDeltaPct ?? 0) < 0) ||
                (m.id === "taxDelta" && (row.taxDeltaPct ?? 0) < 0)
              }
              widthTransition={widthTransition}
              href={metricHref?.(m.id)}
              fillDelta={marketPulseFillDeltaText(compare, row.city, m.id)}
              fillDeltaInk={fillDeltaInk}
            />
          );
        })}
      </div>

      {caption ? (
        <p className="mt-2 [font-family:var(--mp-mono-font)] text-[9px] uppercase tracking-[0.14em] text-white/35">
          {caption}
        </p>
      ) : null}
    </div>
  );
}
