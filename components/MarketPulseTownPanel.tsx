"use client";

import type { ReactNode } from "react";
import {
  barAsidePlacement,
  formatMetricValue,
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
import { marketPulseHeatBand } from "@/lib/market-pulse-favorability";
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
} from "@/components/MarketPulseTownPulse";

/** Panel surface, lifted from the listing showcase tile. */
const PANEL_SURFACE =
  "rounded-2xl bg-[#0d1424]/95 p-4 shadow-[0_18px_48px_-16px_rgba(0,0,0,0.8)]";

/**
 * Buyer ↔ seller spectrum in the showcase's treatment: a coral-to-sage gradient
 * with a white marker, captioned at both ends.
 */
function FavorabilityBar({ score }: { score: number | null }) {
  const pct = score == null ? null : Math.min(100, Math.max(0, score * 100));
  const band = pct == null ? null : marketPulseHeatBand(pct / 100);
  return (
    <div>
      <div className="flex items-baseline justify-between font-mono text-[9px] uppercase tracking-[0.16em] text-white/45">
        <span>Seller</span>
        <span className="text-white/70">{band?.label ?? "No signal"}</span>
        <span>Buyer</span>
      </div>
      <div className="relative mt-1.5 h-2 w-full rounded-full bg-gradient-to-r from-coral via-gold to-sage">
        {pct != null ? (
          <span
            className="absolute top-1/2 h-4 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_0_2px_rgba(13,20,36,0.9)]"
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
  metrics: metricsProp,
  closedPending = false,
  tabs,
  caption,
}: {
  row: MarketPulseCombinedTownRow;
  scale: MarketPulseTownScale;
  lookbackId: MarketPulseLookbackId;
  kind?: ListingKind;
  townLabel: string;
  metrics?: MarketPulseTownMetric[];
  closedPending?: boolean;
  /** Property-type buttons, in the showcase's pill style. */
  tabs?: ReactNode;
  caption?: ReactNode;
}) {
  const closedLookbackLabel = marketPulseLookbackChartLabel(lookbackId);
  const metrics =
    metricsProp ?? marketPulseTownMetrics(closedLookbackLabel, kind);
  const heat = scale.heatByCity.get(row.city) ?? null;

  return (
    <div className={PANEL_SURFACE}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-gold">
          {townLabel}
        </p>
        <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-white/40">
          vs {scale.peerCount} towns
        </p>
      </div>

      <div className="mt-3">
        <FavorabilityBar score={heat} />
      </div>

      {tabs ? <div className="mt-3">{tabs}</div> : null}

      <div className="mt-3 divide-y divide-white/[0.06] border-t border-white/[0.06]">
        {metrics.map((m) => {
          const value = m.valueOf(row);
          const max = marketPulseMetricMax(scale, m.id);
          const pct =
            max > 0 && value != null && Number.isFinite(value)
              ? (Math.abs(value) / max) * 100
              : 0;
          // Delta spans the gap between median and average rather than starting
          // at zero, which is the edge the percent is placed against.
          const aligned =
            m.id === "priceDelta"
              ? marketPulseDeltaBarSpan(
                  marketPulsePricePct(row.medianPrice, scale.priceMax),
                  marketPulsePricePct(row.averagePrice, scale.priceMax),
                )
              : { leftPct: 0, widthPct: Math.min(100, pct) };

          const closedCountText =
            m.id === "closed"
              ? closedPending
                ? "…"
                : formatMetricValue(m.valueKind, value)
              : null;
          const valueText =
            closedCountText != null
              ? formatClosedCountWithLookback(
                  closedLookbackLabel,
                  closedCountText,
                )
              : m.id === "priceDelta"
                ? formatPriceDeltaK(row.priceDelta)
                : m.id === "saleToAsk"
                  ? formatPriceDeltaK(row.saleToAskDollars)
                  : formatMetricValue(m.valueKind, value);

          const asideText =
            m.id === "priceDelta"
              ? formatPriceDeltaPct(row.priceDeltaPct)
              : m.id === "saleToAsk"
                ? formatSaleToAskPct(row.saleToAskPct)
                : null;
          const placement = asideText
            ? barAsidePlacement(
                aligned.leftPct,
                aligned.widthPct,
                m.id === "priceDelta" && (row.priceDeltaPct ?? 0) < 0,
              )
            : null;
          const fillRight = Math.min(100, aligned.leftPct + aligned.widthPct);

          return (
            <div
              key={m.id}
              className="grid grid-cols-[6.5rem_1fr_auto] items-center gap-2 py-1"
            >
              <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-white/45">
                {m.label}
                {placement === "label" && asideText ? (
                  <span className="ml-1 tabular-nums text-white/80">
                    {asideText}
                  </span>
                ) : null}
              </span>
              {/*
               * The percent is absolutely placed against the fill, the way the
               * brief places it, rather than sitting in the label. The track is
               * too thin to hold it, so it centres on the bar and overhangs.
               */}
              <span className="relative block h-1.5 w-full">
                <span className="block h-full w-full overflow-hidden rounded-full bg-white/10">
                  <span
                    className="block h-full rounded-full bg-gold/70"
                    style={{
                      marginLeft: `${aligned.leftPct}%`,
                      width: `${aligned.widthPct}%`,
                    }}
                  />
                </span>
                {asideText && placement && placement !== "label" ? (
                  <span
                    className={`pointer-events-none absolute top-1/2 -translate-y-1/2 whitespace-nowrap font-mono text-[9px] tabular-nums text-white/70 ${
                      placement === "left" ? "text-right" : ""
                    }`}
                    style={
                      placement === "left"
                        ? { right: `${100 - aligned.leftPct}%`, marginRight: 4 }
                        : placement === "outside-right"
                          ? { left: "100%", marginLeft: 6 }
                          : { left: `${fillRight}%`, marginLeft: 4 }
                    }
                  >
                    {asideText}
                  </span>
                ) : null}
              </span>
              <span className="text-right font-mono text-[11px] tabular-nums text-white/90">
                {valueText}
              </span>
            </div>
          );
        })}
      </div>

      {caption ? (
        <p className="mt-3 font-mono text-[9px] uppercase tracking-[0.14em] text-white/35">
          {caption}
        </p>
      ) : null}
    </div>
  );
}
