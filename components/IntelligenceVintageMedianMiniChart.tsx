"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildVintageBucketSnapshots,
  formatVintageHeaderPrice,
  type VintageListingRow,
} from "@/lib/intelligence-vintage-stats";
import type { VintageBucketId } from "@/lib/vintage-buckets";
import { useRandomMiniGraphGlow } from "@/hooks/useRandomMiniGraphGlow";
import {
  INTEL_MINI_GRAPH_WIDTH,
  miniGraphPointX,
} from "@/lib/intel-mini-graph-layout";

/** Phrase after “Filters …” — swap later without rewriting the chrome. */
export const MEDIAN_BY_VINTAGE_LABEL = "Median by vintage";

/** Dimension word in “Original view by …” flash — swap later (e.g. town). */
export const VIEW_BY_DIMENSION_LABEL = "Vintage";

type ChartPoint = {
  id: VintageBucketId;
  label: string;
  medianPrice: number;
  x: number;
  y: number;
  /** Default callout: every other point starting at the first. */
  callout: boolean;
};

/** Panel column width — keep chart flush with the stats column below. */
const WIDTH = INTEL_MINI_GRAPH_WIDTH;
const HEIGHT = 72;
const PAD_TOP = 22;
const PAD_BOTTOM = 18;

const INTERACTIVE_HINT_MS = 10_000;
const ORIGINAL_VIEW_FLASH_MS = 5_000;

function shortVintageLabel(label: string): string {
  // "Pre-1900" → "Pre-1900"; "1900–1940" → "1900"; "2020–present" → "2020"
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
  filterActive = false,
  onBucketClick,
  onResetFilter,
  onInteract,
}: {
  listings: VintageListingRow[];
  kind: "sale" | "rental";
  /** Highlight when min/max vintage collapse to a single bucket. */
  activeBucketId?: VintageBucketId | null;
  /** True when the vintage / timescale filter is narrowed. */
  filterActive?: boolean;
  onBucketClick: (bucketId: VintageBucketId) => void;
  /** Clear vintage filter back to all buckets. */
  onResetFilter?: () => void;
  /** Fired when a graph point is clicked (e.g. pause mobile carousel). */
  onInteract?: () => void;
}) {
  const [extraCallouts, setExtraCallouts] = useState<Set<VintageBucketId>>(
    () => new Set(),
  );
  const [showInteractiveHint, setShowInteractiveHint] = useState(false);
  const [showOriginalViewFlash, setShowOriginalViewFlash] = useState(false);
  const introStartedRef = useRef(false);
  const originalFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

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
    const innerH = HEIGHT - PAD_TOP - PAD_BOTTOM;
    const n = snapshots.length;
    // Sparse vintage sets (≤3 eras): label every point; one stays centered.
    const labelAll = n <= 3;

    return snapshots.map((snap, i) => {
      const price = snap.medianPrice as number;
      const x = miniGraphPointX(i, n, WIDTH);
      const y = PAD_TOP + innerH * (1 - (price - minP) / span);
      return {
        id: snap.id,
        label: snap.label,
        medianPrice: price,
        x,
        y,
        // Dense: every other point; sparse (≤3): every point.
        callout: labelAll || i % 2 === 0,
      };
    });
  }, [listings]);

  const glowIds = useRandomMiniGraphGlow(points.map((p) => p.id));
  const pointIdsKey = points.map((p) => p.id).join("|");

  useEffect(() => {
    if (points.length === 0 || introStartedRef.current) return;
    introStartedRef.current = true;
    setShowInteractiveHint(true);
    const hintTimer = window.setTimeout(() => {
      setShowInteractiveHint(false);
    }, INTERACTIVE_HINT_MS);
    return () => {
      window.clearTimeout(hintTimer);
    };
    // Run once when first non-empty points arrive.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intro only
  }, [pointIdsKey]);

  useEffect(() => {
    return () => {
      if (originalFlashTimerRef.current != null) {
        clearTimeout(originalFlashTimerRef.current);
      }
    };
  }, []);

  if (points.length === 0) return null;

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");

  const handlePointClick = (point: ChartPoint) => {
    onInteract?.();
    if (!point.callout) {
      setExtraCallouts((prev) => {
        if (prev.has(point.id)) return prev;
        const next = new Set(prev);
        next.add(point.id);
        return next;
      });
    }

    if (activeBucketId != null && activeBucketId !== point.id) {
      setShowOriginalViewFlash(true);
      if (originalFlashTimerRef.current != null) {
        clearTimeout(originalFlashTimerRef.current);
      }
      originalFlashTimerRef.current = setTimeout(() => {
        originalFlashTimerRef.current = null;
        setShowOriginalViewFlash(false);
      }, ORIGINAL_VIEW_FLASH_MS);
    }

    onBucketClick(point.id);
  };

  const chartTitle = MEDIAN_BY_VINTAGE_LABEL;

  return (
    <div className="relative flex w-full max-w-md flex-col items-stretch gap-0.5 bg-transparent">
      {showOriginalViewFlash ? (
        <p className="pointer-events-none absolute left-0 top-0 z-[1] font-mono text-[9px] leading-snug tracking-[0.12em] uppercase text-navy/70">
          Original view by {VIEW_BY_DIMENSION_LABEL}
        </p>
      ) : null}
      <div className="flex w-full min-w-0 max-w-[248px] flex-col items-stretch gap-0.5">
          <div className="relative w-full">
            <div className="pointer-events-none absolute inset-x-0 top-0 z-[1] flex items-start justify-between gap-2 px-0.5">
              <p className="min-w-0 bg-transparent text-left font-mono text-[8px] leading-snug tracking-[0.14em] uppercase text-black">
                {chartTitle}
              </p>
              {/* Desktop hint; mobile carousel strip shows its own. */}
              <p
                className={`hidden shrink-0 italic text-[10px] leading-snug text-slate/55 transition-opacity duration-700 ease-in-out sm:block ${
                  showInteractiveHint
                    ? "animate-interactive-graph-hint"
                    : "opacity-0"
                }`}
                aria-hidden={!showInteractiveHint}
              >
                interactive graph
              </p>
            </div>
          <svg
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            className="h-[4.5rem] w-full overflow-visible bg-transparent"
            role="img"
            aria-label={`${chartTitle}. Click a point to filter the deal board.`}
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
              const showCallout =
                point.callout || extraCallouts.has(point.id);
              const glowing = glowIds.has(point.id);
              const priceLabel = formatVintageHeaderPrice(point.medianPrice, kind);
              const isFirst = i === 0;
              const isLast = i === points.length - 1;
              const anchor = isFirst ? "start" : isLast ? "end" : "middle";
              const priceY = Math.max(9, point.y - 9);
              const vintageY = Math.min(HEIGHT - 3, point.y + 14);

              return (
                <g key={point.id}>
                  <title>
                    {point.label} · {priceLabel}
                  </title>
                  {showCallout ? (
                    <>
                      <text
                        x={point.x}
                        y={priceY}
                        textAnchor={anchor}
                        className="fill-black font-mono text-[9px] tabular-nums"
                        style={{ fontSize: 9 }}
                      >
                        {priceLabel}
                      </text>
                      <text
                        x={point.x}
                        y={vintageY}
                        textAnchor={anchor}
                        className="fill-black font-mono text-[8px] uppercase"
                        style={{ fontSize: 8, letterSpacing: "0.04em" }}
                      >
                        {shortVintageLabel(point.label)}
                      </text>
                    </>
                  ) : null}
                  {glowing ? (
                    <circle
                      cx={point.x}
                      cy={point.y}
                      r={8}
                      className="fill-gold/25 animate-vintage-dot-glow pointer-events-none"
                    />
                  ) : null}
                  {/* Larger hit target */}
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r={10}
                    fill="transparent"
                    className="cursor-pointer"
                    onClick={() => handlePointClick(point)}
                  />
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r={active ? 4.5 : glowing ? 4 : 3.25}
                    className={
                      active
                        ? "fill-gold stroke-navy/40 stroke-[1] cursor-pointer"
                        : glowing
                          ? "fill-gold stroke-cream stroke-[1.5] cursor-pointer animate-vintage-dot-glow"
                          : "fill-navy stroke-cream stroke-[1.5] cursor-pointer hover:fill-gold"
                    }
                    onClick={() => handlePointClick(point)}
                  />
                </g>
              );
            })}
          </svg>
          </div>

          {filterActive && onResetFilter ? (
            <div className="flex w-full justify-end">
              <button
                type="button"
                onClick={onResetFilter}
                className="text-right font-mono text-[9px] tracking-[0.12em] uppercase text-navy/70 underline decoration-navy/30 underline-offset-2 transition-colors hover:text-navy hover:decoration-gold"
                title="Reset vintage filter — show all timescales"
                aria-label="All timescales — reset vintage filter"
              >
                All timescales
              </button>
            </div>
          ) : null}
      </div>
    </div>
  );
}
