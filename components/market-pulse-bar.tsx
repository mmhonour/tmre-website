"use client";

import type { ReactNode } from "react";
import { formatMarketPulseMoney } from "@/lib/market-pulse-price-delta";

/**
 * Bar chrome shared by the Market Pulse charts and by a single town's pulse
 * panel, which is rendered on its own elsewhere. Kept apart from either so the
 * panel does not have to import the whole brief to draw one bar.
 */

/** Value sits on the fill (cream) vs the empty track (navy). */
export const BAR_VALUE_ON_FILL = "text-[#F6F1E8]";
export const BAR_VALUE_ON_EMPTY = "text-[var(--mp-text)]";

/**
 * Rough share of the track the 10px mono percent needs. The overlay is placed
 * off the fill, which is itself a percentage, so the reserve has to be one too.
 */
const ASIDE_SPAN_PCT = 16;
/** The dollar value right-aligns across the whole track and must stay clear. */
const VALUE_SPAN_PCT = 14;
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
 * A positive percent reads off the fill's right edge, then hops the track's
 * right border once the fill reaches it or crowds the right-aligned dollars.
 * A negative one mirrors that to the left, where the row label holds the only
 * space outside the track.
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
  return 100 - fillRight >= ASIDE_SPAN_PCT + VALUE_SPAN_PCT
    ? "right"
    : "outside-right";
}

export function BarValueOverlay({
  value,
  aside,
  asidePlacement = "right",
  leftPct,
  widthPct,
  colorClass,
}: {
  value: ReactNode;
  aside?: ReactNode;
  asidePlacement?: BarAsidePlacement;
  leftPct: number;
  widthPct: number;
  colorClass?: string;
}) {
  const fillLeft = Math.min(Math.max(leftPct, 0), 100);
  const fillRight = Math.min(Math.max(leftPct + widthPct, 0), 100);
  const fontClass = "[font-family:var(--mp-mono-font)]";
  const base = `pointer-events-none absolute inset-y-0 z-[1] flex items-center text-[10px] tabular-nums whitespace-nowrap ${fontClass}`;
  // Every value right-aligns in the grey track; only a full bar puts it on the fill.
  const valueColor =
    colorClass ?? (fillRight >= 95 ? BAR_VALUE_ON_FILL : BAR_VALUE_ON_EMPTY);
  // `label` puts the percent next to the row label instead of on the track.
  const showAside = aside != null && asidePlacement !== "label";
  const asideClass =
    asidePlacement === "left"
      ? `justify-end pr-1 ${BAR_VALUE_ON_EMPTY}`
      : `justify-start pl-1 ${BAR_VALUE_ON_EMPTY}`;
  const asideStyle =
    asidePlacement === "left"
      ? { left: 0, right: `${100 - fillLeft}%` }
      : asidePlacement === "outside-right"
        ? { left: "100%" }
        : { left: `${fillRight}%`, right: 0 };

  return (
    <>
      {showAside ? (
        <span className={`${base} ${asideClass}`} style={asideStyle}>
          {aside}
        </span>
      ) : null}
      <span className={`${base} inset-x-0 justify-end pr-1 ${valueColor}`}>
        {value}
      </span>
    </>
  );
}

/** Percent shown beside a row label when it cannot fit around its own bar. */
export const BAR_ASIDE_LABEL_CLASS =
  "shrink-0 [font-family:var(--mp-mono-font)] text-[10px] tabular-nums text-[var(--mp-text)]";

/**
 * One ink for every bar, the way the listing showcase draws a town. Colour
 * there carries no meaning — the row label already names the metric — so a
 * single tone lets the lengths be the only thing that varies.
 */
export const MONO_BAR_CLASS = "bg-[var(--mp-text)]/85";

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
