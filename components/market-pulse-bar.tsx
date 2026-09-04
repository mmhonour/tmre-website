"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { barAsidePlacement } from "@/lib/market-pulse-bar-aside";
import { formatMarketPulseMoney } from "@/lib/market-pulse-price-delta";

/**
 * Bar chrome shared by the Market Pulse charts and by a single town's pulse
 * panel, which is rendered on its own elsewhere. Kept apart from either so the
 * panel does not have to import the whole brief to draw one bar.
 */

/**
 * Strip held clear past the right edge of every track. A percent with no room
 * left beside its fill moves out here instead of covering the fill or the
 * dollars, and reserving the same strip on every bar keeps the shared price
 * axis (Median / Delta / Average) lined up.
 */
export const BAR_EXTERIOR_LANE = "mr-8 sm:mr-10";

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
export const PANEL_SURFACE = "rounded-xl bg-[#26374F] py-3 pl-4 pr-11";
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
  href,
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
  /** Stats chart standing behind this bar, if there is one. */
  href?: string | null;
}) {
  const placement = aside ? barAsidePlacement(leftPct, widthPct, asideNegative) : null;
  const Bar = (href ? Link : "span") as React.ElementType;
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
      {/*
       * The bar is the link, not the label: a label may already hold its own
       * control — Delta's explainer, TRAN$ACT to LIST's chart link — and one
       * interactive element cannot sit inside another.
       */}
      <Bar
        {...(href ? { href } : {})}
        className={`relative block h-1.5 w-full ${
          href ? "cursor-pointer" : ""
        }`}
      >
        <span
          className={`block h-full w-full overflow-hidden rounded-full bg-white/10 ${
            href ? "transition-colors group-hover:bg-white/20" : ""
          }`}
        >
          <span
            className={`block h-full rounded-full bg-gold/70 transition-[width,margin-left] ease-out ${widthTransition} ${
              href ? "group-hover:bg-gold" : ""
            }`}
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
      </Bar>
      <span className="text-right [font-family:var(--mp-mono-font)] text-[11px] tabular-nums text-white/90">
        {valueText}
      </span>
      {/*
       * A fill that runs to the end of the track leaves the percent nowhere on
       * it, and the space immediately right belongs to the value. It steps out
       * of the row into the panel's own gutter, clearing both — kept inside the
       * panel so it cannot land on the lookback rail beside the first card.
       */}
      {aside && placement === "outside-right" ? (
        <span className="pointer-events-none absolute top-1/2 left-full ml-2 -translate-y-1/2 whitespace-nowrap [font-family:var(--mp-mono-font)] text-[9px] tabular-nums text-white/70">
          {aside}
        </span>
      ) : null}
      {tooltip}
    </div>
  );
}
