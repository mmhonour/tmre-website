"use client";

import { useMemo } from "react";
import {
  buildVintageBucketSnapshots,
  formatVintageHeaderPrice,
  type VintageListingRow,
} from "@/lib/intelligence-vintage-stats";
import type { VintageBucketId } from "@/lib/vintage-buckets";

type ChartPoint = {
  id: VintageBucketId;
  label: string;
  medianPrice: number;
  x: number;
  y: number;
  /** Short vintage label for axis callouts (1st / middle / last). */
  callout?: boolean;
};

/** Panel column width — keep chart flush with the stats column below. */
const WIDTH = 248;
const HEIGHT = 72;
const PAD_X = 14;
const PAD_TOP = 22;
const PAD_BOTTOM = 18;

function shortVintageLabel(label: string): string {
  // "Pre-1900" → "Pre-'00"; "1900–1940" → "1900"; "2020–present" → "2020"
  if (/^pre/i.test(label)) return "Pre-1900";
  const start = label.match(/^(\d{4})/);
  if (start) return start[1];
  return label;
}

/**
 * Mini median-price-by-vintage sparkline above the Intelligence deal board.
 * Uses the same bucket medians as Sales/Rentals by vintage; dots set that
 * vintage filter (same as clicking Listings in the vintage pop-out).
 */
export default function IntelligenceVintageMedianMiniChart({
  listings,
  kind,
  activeBucketId = null,
  onBucketClick,
}: {
  listings: VintageListingRow[];
  kind: "sale" | "rental";
  /** Highlight when min/max vintage collapse to a single bucket. */
  activeBucketId?: VintageBucketId | null;
  onBucketClick: (bucketId: VintageBucketId) => void;
}) {
  const points = useMemo((): ChartPoint[] => {
    const snapshots = buildVintageBucketSnapshots(listings).filter(
      (snap) =>
        snap.id !== "unknown" &&
        snap.medianPrice != null &&
        Number.isFinite(snap.medianPrice) &&
        snap.medianPrice > 0,
    );
    if (snapshots.length === 0) return [];

    const prices = snapshots.map((snap) => snap.medianPrice as number);
    const minP = Math.min(...prices);
    const maxP = Math.max(...prices);
    const span = Math.max(maxP - minP, 1);
    const innerW = WIDTH - PAD_X * 2;
    const innerH = HEIGHT - PAD_TOP - PAD_BOTTOM;
    const n = snapshots.length;
    const middleIdx = Math.floor((n - 1) / 2);
    const calloutIdx = new Set(
      n === 1
        ? [0]
        : n === 2
          ? [0, 1]
          : [0, middleIdx, n - 1],
    );

    return snapshots.map((snap, i) => {
      const price = snap.medianPrice as number;
      const x = n === 1 ? WIDTH / 2 : PAD_X + (innerW * i) / (n - 1);
      const y = PAD_TOP + innerH * (1 - (price - minP) / span);
      return {
        id: snap.id,
        label: snap.label,
        medianPrice: price,
        x,
        y,
        callout: calloutIdx.has(i),
      };
    });
  }, [listings]);

  if (points.length === 0) return null;

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");

  return (
    <div className="flex w-full flex-col items-stretch gap-0.5">
      <p className="font-mono text-[8px] tracking-[0.14em] uppercase text-slate/50 leading-none text-right">
        Median by vintage
      </p>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-[4.5rem] w-full overflow-visible"
        role="img"
        aria-label="Median price by vintage. Click a point to filter the deal board."
      >
        <path
          d={linePath}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
          className="text-navy/35"
        />
        {points.map((point, i) => {
          const active = activeBucketId === point.id;
          const priceLabel = formatVintageHeaderPrice(point.medianPrice, kind);
          const isFirst = i === 0;
          const isLast = i === points.length - 1;
          const anchor =
            isFirst ? "start" : isLast ? "end" : "middle";
          // Price callout above the dot; vintage label below.
          const priceY = Math.max(9, point.y - 9);
          const vintageY = Math.min(HEIGHT - 3, point.y + 14);

          return (
            <g key={point.id}>
              <title>
                {point.label} · {priceLabel}
              </title>
              {point.callout ? (
                <>
                  <text
                    x={point.x}
                    y={priceY}
                    textAnchor={anchor}
                    className="fill-navy font-mono text-[8px] tabular-nums"
                    style={{ fontSize: 8 }}
                  >
                    {priceLabel}
                  </text>
                  <text
                    x={point.x}
                    y={vintageY}
                    textAnchor={anchor}
                    className="fill-slate/55 font-mono text-[7px] uppercase"
                    style={{ fontSize: 7, letterSpacing: "0.04em" }}
                  >
                    {shortVintageLabel(point.label)}
                  </text>
                </>
              ) : null}
              {/* Larger hit target */}
              <circle
                cx={point.x}
                cy={point.y}
                r={10}
                fill="transparent"
                className="cursor-pointer"
                onClick={() => onBucketClick(point.id)}
              />
              <circle
                cx={point.x}
                cy={point.y}
                r={active ? 4.5 : 3.25}
                className={
                  active
                    ? "fill-gold stroke-navy/40 stroke-[1] cursor-pointer"
                    : "fill-navy stroke-cream stroke-[1.5] cursor-pointer hover:fill-gold"
                }
                onClick={() => onBucketClick(point.id)}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
}
