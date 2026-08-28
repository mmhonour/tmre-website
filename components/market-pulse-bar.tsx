"use client";

import type { ReactNode } from "react";
import { formatMarketPulseMoney } from "@/lib/market-pulse-price-delta";

/**
 * Bar chrome shared by the Market Pulse charts and by a single town's pulse
 * panel, which is rendered on its own elsewhere. Kept apart from either so the
 * panel does not have to import the whole brief to draw one bar.
 */

/**
 * Rough share of the track the 10px mono percent needs. The overlay is placed
 * off the fill, which is itself a percentage, so the reserve has to be one too.
 */
const ASIDE_SPAN_PCT = 16;
/**
 * Strip held clear past the right edge of every track. A percent with no room
 * left beside its fill moves out here instead of covering the fill or the
 * dollars, and reserving the same strip on every bar keeps the shared price
 * axis (Median / Delta / Average) lined up.
 */
export const BAR_EXTERIOR_LANE = "mr-8 sm:mr-10";

/**
 * Where a bar's percent sits relative to the fill it describes.
 * - `right` / `left`: on the track, just past the near edge of the fill.
 * - `outside-right`: in the exterior lane past the track's right border.
 * - `label`: back beside the row's own label, the only room left of the track.
 */
export type BarAsidePlacement = "right" | "outside-right" | "left" | "label";

/**
 * A positive percent reads off the fill's right edge, and once the fill runs
 * to the end of the track it leaves the panel entirely rather than climbing
 * over the value beside it. A negative one mirrors that to the left, where the
 * row label holds the only space outside the track.
 */
export function barAsidePlacement(
  leftPct: number,
  widthPct: number,
  negative: boolean,
): BarAsidePlacement {
  const fillLeft = Math.min(Math.max(leftPct, 0), 100);
  const fillRight = Math.min(Math.max(leftPct + widthPct, 0), 100);
  if (negative) {
    return fillLeft >= ASIDE_SPAN_PCT ? "left" : "label";
  }
  return 100 - fillRight >= ASIDE_SPAN_PCT ? "right" : "outside-right";
}

export const METRIC_COLORS = {
  inventory: "bg-[var(--mp-inventory-bar)]",
  monthsSupply: "bg-[var(--mp-months-supply-bar)]",
  avgDom: "bg-[var(--mp-avg-dom-bar,#5B8A72)]",
  closed: "bg-[var(--mp-closed-bar,#C45C4A)]",
  medianPrice: "bg-[var(--mp-median-bar,#6B7C9B)]",
  averagePrice: "bg-[var(--mp-average-bar,#8B6F4E)]",
  priceDelta: "bg-[var(--mp-delta-bar,#7A6A8A)]",
  saleToAsk: "bg-[var(--mp-sale-to-ask-bar,#4A7C8A)]",
} as const;

export type MetricValueKind = "int" | "mos" | "dom" | "money";

export function fmtMos(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "n/a";
  return `${n.toFixed(1)} mo`;
}

export function fmtActive(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return String(Math.round(n));
}

export function fmtDom(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${Math.round(n)}d`;
}

export function formatMetricValue(
  kind: MetricValueKind,
  display: number | null,
): string {
  if (kind === "mos") return fmtMos(display);
  if (kind === "dom") return fmtDom(display);
  if (kind === "money") return formatMarketPulseMoney(display);
  return fmtActive(display);
}

/** Denim card the town panels and the unstacked charts both sit on. */
export const PANEL_SURFACE = "rounded-xl bg-[#26374F] px-4 py-3";
export const PANEL_TITLE =
  "[font-family:var(--mp-mono-font)] text-[10px] uppercase tracking-[0.16em] text-gold";
export const PANEL_LABEL =
  "truncate text-right [font-family:var(--mp-mono-font)] text-[9px] uppercase tracking-[0.14em] whitespace-nowrap text-white/45";

/**
 * One labelled bar on a denim panel, shared so a town's stacked metrics and an
 * unstacked chart's towns are drawn by the same code rather than two that drift.
 *
 * The label right-aligns to its bar, every row is the same height so nothing
 * wraps, and the value keeps its own column. The percent follows the brief's
 * placement — beside the fill, or past the track's right border once the fill
 * reaches the end — which the 6px track is too thin to hold, so it centres on
 * the bar and overhangs it.
 */
export function PanelBarRow({
  label,
  valueText,
  leftPct,
  widthPct,
  aside,
  asideNegative = false,
  widthTransition = "",
  tooltip,
  dense = false,
}: {
  label: ReactNode;
  valueText: ReactNode;
  leftPct: number;
  widthPct: number;
  aside?: string | null;
  asideNegative?: boolean;
  widthTransition?: string;
  tooltip?: ReactNode;
  /** Closes the rows up where a group reads as one figure rather than a list. */
  dense?: boolean;
}) {
  const placement = aside ? barAsidePlacement(leftPct, widthPct, asideNegative) : null;
  const fillRight = Math.min(100, Math.max(0, leftPct + widthPct));
  return (
    <div
      className={`group relative grid grid-cols-[7.75rem_1fr_auto] items-center gap-2 ${
        dense ? "h-[18px]" : "h-6"
      }`}
    >
      <span className={PANEL_LABEL}>
        {label}
        {placement === "label" && aside ? (
          <span className="ml-1 tabular-nums text-white/80">{aside}</span>
        ) : null}
      </span>
      <span className="relative block h-1.5 w-full">
        <span className="block h-full w-full overflow-hidden rounded-full bg-white/10">
          <span
            className={`block h-full rounded-full bg-gold/70 transition-[width,margin-left] ease-out ${widthTransition}`}
            style={{ marginLeft: `${leftPct}%`, width: `${widthPct}%` }}
          />
        </span>
        {aside && (placement === "left" || placement === "right") ? (
          <span
            className={`pointer-events-none absolute top-1/2 -translate-y-1/2 whitespace-nowrap [font-family:var(--mp-mono-font)] text-[9px] tabular-nums text-white/70 ${
              placement === "left" ? "text-right" : ""
            }`}
            style={
              placement === "left"
                ? { right: `${100 - leftPct}%`, marginRight: 4 }
                : { left: `${fillRight}%`, marginLeft: 4 }
            }
          >
            {aside}
          </span>
        ) : null}
      </span>
      <span className="text-right [font-family:var(--mp-mono-font)] text-[11px] tabular-nums text-white/90">
        {valueText}
      </span>
      {/*
       * A fill that reaches the end of the track leaves the percent nowhere on
       * it, and the space immediately right belongs to the value. It steps off
       * the panel instead, which puts it on the card, so it takes the card's
       * ink rather than the panel's.
       */}
      {aside && placement === "outside-right" ? (
        <span className="pointer-events-none absolute top-1/2 left-full ml-2 -translate-y-1/2 whitespace-nowrap [font-family:var(--mp-mono-font)] text-[9px] tabular-nums text-[var(--mp-muted-text)]">
          {aside}
        </span>
      ) : null}
      {tooltip}
    </div>
  );
}
