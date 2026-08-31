"use client";

import type { ReactNode } from "react";
import {
  formatMetricValue,
  PANEL_SURFACE,
  PanelBarRow,
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
import { marketPulseHeatBand } from "@/lib/market-pulse-favorability";
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

/** Panel surface, lifted from the listing showcase tile. */
/**
 * Buyer ↔ seller spectrum in the showcase's treatment: a coral-to-sage gradient
 * with a white marker, captioned at both ends.
 */
function FavorabilityBar({
  score,
  peerCount,
}: {
  score: number | null;
  /** Null on the composite row, which is the towns rather than one of them. */
  peerCount: number | null;
}) {
  const pct = score == null ? null : Math.min(100, Math.max(0, score * 100));
  const band = pct == null ? null : marketPulseHeatBand(pct / 100);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 [font-family:var(--mp-mono-font)] text-[9px] uppercase tracking-[0.16em] text-white/45">
        <span>Seller</span>
        <span className="truncate text-white/70">
          {band?.label ?? "No signal"}
          {peerCount != null ? ` · vs ${peerCount} towns` : ""}
        </span>
        <span>Buyer</span>
      </div>
      <div className="relative mt-1.5 h-2 w-full rounded-full bg-gradient-to-r from-coral via-gold to-sage">
        {pct != null ? (
          <span
            className="absolute top-1/2 h-3.5 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_0_2px_rgba(38,55,79,0.9)]"
            style={{ left: `${pct}%` }}
            aria-hidden
          />
        ) : null}
      </div>
    </div>
  );
}

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
  metrics: metricsProp,
  closedPending = false,
  settle = MARKET_PULSE_SETTLE_IDLE,
  scramble,
  tabs,
  caption,
}: {
  row: MarketPulseCombinedTownRow;
  scale: MarketPulseTownScale;
  lookbackId: MarketPulseLookbackId;
  kind?: ListingKind;
  townLabel: string;
  /** Town name element. Falls back to plain text when omitted. */
  heading?: ReactNode;
  /** Makes the List to ask row label a link to its Stats chart. */
  saleToAskHref?: string;
  metrics?: MarketPulseTownMetric[];
  closedPending?: boolean;
  settle?: MarketPulseSettleState;
  /** Scramble frame shared with sibling towns, and this town's slot in it. */
  scramble?: { values: number[] | null; rowIndex: number; townCount: number };
  /** Property-type buttons, in the showcase's pill style. */
  tabs?: ReactNode;
  caption?: ReactNode;
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
        <span className="shrink-0 [font-family:var(--mp-mono-font)] text-[10px] uppercase tracking-[0.16em] text-gold">
          {heading ?? townLabel}
        </span>
        <div className="min-w-0 flex-1">
          <FavorabilityBar
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
          // Delta spans the gap between median and average rather than starting
          // at zero, which is the edge the percent is placed against.
          const aligned =
            m.id === "priceDelta"
              ? marketPulseDeltaBarSpan(
                  settledPct("medianPrice"),
                  settledPct("averagePrice"),
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
                    title={`${m.label} on Stats — chart and data table`}
                    className="underline decoration-white/25 underline-offset-2 transition-colors hover:text-gold"
                  >
                    {m.label}
                  </Link>
                ) : (
                  m.label
                )
              }
              valueText={valueText}
              leftPct={aligned.leftPct}
              widthPct={aligned.widthPct}
              aside={asideText}
              asideNegative={
                m.id === "priceDelta" && (row.priceDeltaPct ?? 0) < 0
              }
              widthTransition={widthTransition}
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
