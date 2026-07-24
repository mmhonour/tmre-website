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
};

const WIDTH = 168;
const HEIGHT = 40;
const PAD_X = 8;
const PAD_Y = 7;

/**
 * Mini median-price-by-vintage sparkline for the Intelligent Deals heading.
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
    const innerH = HEIGHT - PAD_Y * 2;
    const n = snapshots.length;

    return snapshots.map((snap, i) => {
      const price = snap.medianPrice as number;
      const x = n === 1 ? WIDTH / 2 : PAD_X + (innerW * i) / (n - 1);
      const y = PAD_Y + innerH * (1 - (price - minP) / span);
      return {
        id: snap.id,
        label: snap.label,
        medianPrice: price,
        x,
        y,
      };
    });
  }, [listings]);

  if (points.length === 0) return null;

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");

  return (
    <div className="flex flex-col items-start gap-0.5 min-w-0">
      <p className="font-mono text-[8px] tracking-[0.14em] uppercase text-slate/50 leading-none">
        Median by vintage
      </p>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-9 w-[10.5rem] max-w-full overflow-visible"
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
        {points.map((point) => {
          const active = activeBucketId === point.id;
          const priceLabel = formatVintageHeaderPrice(point.medianPrice, kind);
          return (
            <g key={point.id}>
              <title>
                {point.label} · {priceLabel}
              </title>
              {/* Larger hit target */}
              <circle
                cx={point.x}
                cy={point.y}
                r={10}
                fill="transparent"
                className="cursor-pointer"
                onClick={() => onBucketClick(point.id)}
              >
                <title>
                  {point.label} · {priceLabel}
                </title>
              </circle>
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
