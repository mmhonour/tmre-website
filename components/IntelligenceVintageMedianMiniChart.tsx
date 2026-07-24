"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildVintageBucketSnapshots,
  formatVintageHeaderPrice,
  type VintageListingRow,
} from "@/lib/intelligence-vintage-stats";
import type { VintageBucketId } from "@/lib/vintage-buckets";

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
const WIDTH = 248;
const HEIGHT = 72;
const PAD_X = 14;
const PAD_TOP = 22;
const PAD_BOTTOM = 18;

const INTERACTIVE_HINT_MS = 10_000;
const ORIGINAL_VIEW_FLASH_MS = 5_000;
const INTRO_GLOW_MS = 4_500;

function shortVintageLabel(label: string): string {
  // "Pre-1900" → "Pre-1900"; "1900–1940" → "1900"; "2020–present" → "2020"
  if (/^pre/i.test(label)) return "Pre-1900";
  const start = label.match(/^(\d{4})/);
  if (start) return start[1];
  return label;
}

function pickRandomGlowIds(ids: VintageBucketId[], count: number): Set<VintageBucketId> {
  if (ids.length === 0) return new Set();
  const shuffled = [...ids];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = shuffled[i]!;
    shuffled[i] = shuffled[j]!;
    shuffled[j] = tmp;
  }
  const n = Math.min(count, shuffled.length);
  return new Set(shuffled.slice(0, n));
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
  const [extraCallouts, setExtraCallouts] = useState<Set<VintageBucketId>>(
    () => new Set(),
  );
  const [glowIds, setGlowIds] = useState<Set<VintageBucketId>>(() => new Set());
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
    const innerW = WIDTH - PAD_X * 2;
    const innerH = HEIGHT - PAD_TOP - PAD_BOTTOM;
    const n = snapshots.length;

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
        // Every other point, starting with the first (0, 2, 4, …).
        callout: i % 2 === 0,
      };
    });
  }, [listings]);

  const pointIdsKey = points.map((p) => p.id).join("|");

  useEffect(() => {
    if (points.length === 0 || introStartedRef.current) return;
    introStartedRef.current = true;

    const glowCount = Math.min(3, Math.max(1, Math.ceil(points.length / 3)));
    setGlowIds(pickRandomGlowIds(points.map((p) => p.id), glowCount));
    setShowInteractiveHint(true);

    const glowTimer = window.setTimeout(() => {
      setGlowIds(new Set());
    }, INTRO_GLOW_MS);
    const hintTimer = window.setTimeout(() => {
      setShowInteractiveHint(false);
    }, INTERACTIVE_HINT_MS);

    return () => {
      window.clearTimeout(glowTimer);
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

  const chartTitle = `Filters ${MEDIAN_BY_VINTAGE_LABEL}`;

  return (
    <div className="flex w-full items-start justify-start gap-2.5">
      <p className="shrink-0 pt-1 text-left font-mono text-[8px] tracking-[0.14em] uppercase text-slate/50 leading-snug max-w-[5.5rem]">
        {chartTitle}
      </p>
      <div className="min-w-0 flex-1 flex flex-col items-stretch gap-0.5">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="h-[4.5rem] w-full max-w-[248px] overflow-visible"
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
        <div className="min-h-[1rem] max-w-[248px]">
          {showInteractiveHint ? (
            <p className="italic text-[10px] text-slate/55 leading-none">
              interactive graph
            </p>
          ) : null}
          {showOriginalViewFlash ? (
            <p className="font-mono text-[9px] tracking-[0.12em] uppercase text-navy/70 leading-none">
              Original view by {VIEW_BY_DIMENSION_LABEL}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
