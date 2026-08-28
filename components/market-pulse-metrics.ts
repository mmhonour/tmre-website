"use client";

import { METRIC_COLORS, type MetricValueKind } from "@/components/market-pulse-bar";
import type { ListingKind } from "@/lib/listing-kind";
import type { MarketPulseCombinedTownRow } from "@/lib/market-pulse-combined-rows";
import {
  marketPulseStackedMetrics,
  type MarketPulseStackedMetricId,
} from "@/lib/market-pulse-stacked-metrics";
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

