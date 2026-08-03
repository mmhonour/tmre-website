"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRandomMiniGraphGlow } from "@/hooks/useRandomMiniGraphGlow";
import {
  INTEL_MINI_GRAPH_WIDTH,
  miniGraphPointX,
  selectMiniGraphBucketsForLayout,
} from "@/lib/intel-mini-graph-layout";

/** Phrase after “Filters …” — swap later without rewriting the chrome. */
export const ACTIVE_BY_DOM_LABEL = "Inventory by DOM";

/** Dimension word in “Original view by …” flash. */
export const VIEW_BY_DOM_DIMENSION_LABEL = "DOM";

type BandPoint = {
  id: string;
  label: string;
  shortLabel: string;
  count: number;
  minDays: number;
  maxDays: number | null;
  x: number;
  y: number;
  callout: boolean;
};

type ApiBucket = {
  id: string;
  label: string;
  shortLabel?: string;
  count: number;
  minDays: number;
  maxDays: number | null;
};

type ApiPayload = {
  buckets?: ApiBucket[];
  totalActive?: number;
};

const WIDTH = INTEL_MINI_GRAPH_WIDTH;
const HEIGHT = 72;
const PAD_TOP = 22;
const PAD_BOTTOM = 18;

const INTERACTIVE_HINT_MS = 10_000;
const ORIGINAL_VIEW_FLASH_MS = 5_000;

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(n);
}

/**
 * Mini active-inventory-by-DOM sparkline (Goldilocks day-ranges, sequential).
 * Click a point to filter the deal board to that DOM window.
 */
export default function IntelligenceDomBandMiniChart({
  city,
  kind,
  activeBucketId = null,
  filterActive = false,
  onBucketClick,
  onResetFilter,
  onInteract,
}: {
  city: string;
  kind: "sale" | "rental";
  activeBucketId?: string | null;
  filterActive?: boolean;
  onBucketClick: (bucket: {
    id: string;
    minDays: number;
    maxDays: number | null;
  }) => void;
  onResetFilter?: () => void;
  onInteract?: () => void;
}) {
  const [buckets, setBuckets] = useState<ApiBucket[]>([]);
  const [showInteractiveHint, setShowInteractiveHint] = useState(false);
  const [showOriginalViewFlash, setShowOriginalViewFlash] = useState(false);
  const [extraCallouts, setExtraCallouts] = useState<Set<string>>(() => new Set());
  const introStartedRef = useRef(false);
  const originalFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    introStartedRef.current = false;
    setBuckets([]);
    setExtraCallouts(new Set());

    const qs = new URLSearchParams({ city, kind });
    void fetch(`/api/active-by-dom?${qs}`, { signal: ac.signal })
      .then(async (res) => {
        if (!res.ok) return null;
        return (await res.json()) as ApiPayload;
      })
      .then((data) => {
        if (ac.signal.aborted || !data?.buckets) return;
        setBuckets(
          data.buckets.filter(
            (b) =>
              typeof b.count === "number" &&
              Number.isFinite(b.minDays) &&
              b.minDays >= 0,
          ),
        );
      })
      .catch(() => {
        /* aborted or network */
      });

    return () => ac.abort();
  }, [city, kind]);

  const points = useMemo((): BandPoint[] => {
    if (buckets.length === 0) return [];
    const plot = selectMiniGraphBucketsForLayout(buckets);
    if (plot.length === 0) return [];
    const counts = plot.map((b) => b.count);
    const minC = Math.min(...counts);
    const maxC = Math.max(...counts);
    const span = Math.max(maxC - minC, 1);
    const innerH = HEIGHT - PAD_TOP - PAD_BOTTOM;
    const n = plot.length;

    return plot.map((b, i) => {
      const x = miniGraphPointX(i, n, WIDTH);
      const y = PAD_TOP + innerH * (1 - (b.count - minC) / span);
      return {
        id: b.id,
        label: b.label,
        shortLabel: b.shortLabel ?? b.label,
        count: b.count,
        minDays: b.minDays,
        maxDays: b.maxDays,
        x,
        y,
        callout: true,
      };
    });
  }, [buckets]);

  const glowIds = useRandomMiniGraphGlow(points.map((p) => p.id));
  const pointIdsKey = points.map((p) => p.id).join("|");

  useEffect(() => {
    if (points.length === 0 || introStartedRef.current) return;
    introStartedRef.current = true;
    setShowInteractiveHint(true);
    const hintTimer = window.setTimeout(
      () => setShowInteractiveHint(false),
      INTERACTIVE_HINT_MS,
    );
    return () => {
      window.clearTimeout(hintTimer);
    };
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

  const chartTitle = ACTIVE_BY_DOM_LABEL;
  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");

  const handlePointClick = (point: BandPoint) => {
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

    onBucketClick({
      id: point.id,
      minDays: point.minDays,
      maxDays: point.maxDays,
    });
  };

  return (
    <div className="relative flex w-full max-w-md flex-col items-stretch gap-0.5 bg-transparent">
      {showOriginalViewFlash ? (
        <p className="pointer-events-none absolute left-0 top-0 z-[1] font-mono text-[9px] leading-snug tracking-[0.12em] uppercase text-navy/70">
          Original view by {VIEW_BY_DOM_DIMENSION_LABEL}
        </p>
      ) : null}
      <div className="flex w-full min-w-0 max-w-[248px] flex-col items-stretch gap-0.5">
        <div className="relative w-full">
          <div className="pointer-events-none absolute inset-x-0 top-0 z-[1] flex items-start justify-between gap-2 px-0.5">
            <p className="min-w-0 bg-transparent text-left font-mono text-[8px] leading-snug tracking-[0.14em] uppercase text-black">
              {chartTitle}
            </p>
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
            aria-label={`${chartTitle}. Click a point to filter the deal board by days on market.`}
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
              const glowing = glowIds.has(point.id);
              const showCallout = point.callout || extraCallouts.has(point.id);
              const countLabel = formatCount(point.count);
              const isFirst = i === 0;
              const isLast = i === points.length - 1;
              const anchor = isFirst ? "start" : isLast ? "end" : "middle";
              const bandY = Math.max(9, point.y - 9);
              const countY = Math.min(HEIGHT - 3, point.y + 14);

              return (
                <g key={point.id}>
                  <title>
                    {point.label} days · {point.count}{" "}
                    {kind === "rental" ? "for rent" : "for sale"}
                  </title>
                  {showCallout ? (
                    <>
                      <text
                        x={point.x}
                        y={bandY}
                        textAnchor={anchor}
                        className="fill-black font-mono text-[8px] uppercase"
                        style={{ fontSize: 8, letterSpacing: "0.04em" }}
                      >
                        {point.shortLabel}
                      </text>
                      <text
                        x={point.x}
                        y={countY}
                        textAnchor={anchor}
                        className="fill-black font-mono text-[9px] tabular-nums"
                        style={{ fontSize: 9 }}
                      >
                        {countLabel}
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
              title="Reset DOM filter — show all days on market"
              aria-label="All DOM — reset days-on-market filter"
            >
              All DOM
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
