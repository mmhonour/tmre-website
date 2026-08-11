"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRandomMiniGraphGlow } from "@/hooks/useRandomMiniGraphGlow";
import { recountPriceBandsFromListings } from "@/lib/intel-mini-graph-from-listings";
import {
  INTEL_MINI_GRAPH_WIDTH,
  miniGraphPointX,
  selectMiniGraphBucketsForLayout,
} from "@/lib/intel-mini-graph-layout";

/** Phrase after “Filters …” — swap later without rewriting the chrome. */
export const ACTIVE_BY_PRICE_LABEL = "Inventory by price";

/** Dimension word in “Original view by …” flash. */
export const VIEW_BY_PRICE_DIMENSION_LABEL = "Price";

type BandPoint = {
  id: string;
  label: string;
  shortLabel: string;
  count: number;
  min: number;
  max: number | null;
  x: number;
  y: number;
  callout: boolean;
};

type ApiBucket = {
  id: string;
  label: string;
  count: number;
  min: number;
  max: number | null;
};

type ApiPayload = {
  buckets?: ApiBucket[];
  totalActive?: number;
  statsCache?: boolean;
};

const WIDTH = INTEL_MINI_GRAPH_WIDTH;
const HEIGHT = 72;
const PAD_TOP = 22;
const PAD_BOTTOM = 18;

const ORIGINAL_VIEW_FLASH_MS = 5_000;

function withDollar(label: string): string {
  const t = label.trim();
  if (!t || t.startsWith("$")) return t;
  return `$${t}`;
}

function shortBandLabel(
  label: string,
  kind: "sale" | "rental",
  min?: number,
): string {
  const s = label.replace(/\/mo/gi, "").trim();
  if (kind === "rental") {
    // Prefer band min so "$2K–$3,999" becomes "$2k" (not "$2") — every
    // rental callout keeps the k unit, including $0k and $12k+.
    if (typeof min === "number" && Number.isFinite(min) && min >= 0) {
      const k = Math.round(min / 1000);
      return withDollar(/\+/.test(s) ? `${k}k+` : `${k}k`);
    }
    const plus = s.match(/\$?\s*([\d,.]+)\s*[Kk]\+/);
    if (plus || /\+/.test(s)) {
      const n = (plus?.[1] ?? s.match(/\$?\s*([\d,.]+)/)?.[1] ?? "12").replace(
        /,.*/,
        "",
      );
      return withDollar(`${n}k+`);
    }
    const withK = s.match(/\$?\s*([\d,.]+)\s*[Kk]/);
    if (withK) {
      return withDollar(`${withK[1].replace(/,.*/, "")}k`);
    }
    const lo = s.match(/\$?\s*([\d,.]+)/);
    if (lo) {
      const n = Number(lo[1].replace(/,/g, ""));
      if (Number.isFinite(n)) {
        return withDollar(
          n >= 1000 ? `${Math.round(n / 1000)}k` : `${Math.round(n)}k`,
        );
      }
    }
  }
  // Sale: "$500K–$1.249M" → "$500K"; "$10M+" → "$10M+"
  const plus = s.match(/\$?([\d.]+)\s*([MmKk])\+/);
  if (plus) return withDollar(`${plus[1]}${plus[2].toUpperCase()}+`);
  const start = s.match(/\$?([\d.]+)\s*([MmKk])?/);
  if (start) {
    const unit = (start[2] ?? "").toUpperCase();
    return withDollar(unit ? `${start[1]}${unit}` : start[1]);
  }
  return withDollar(s.slice(0, 6));
}

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(n);
}

/**
 * Mini active-inventory-by-price sparkline above the Intelligence deal board.
 * Band edges come from /api/active-by-price (Admin sale/rent bands); counts are
 * recounted from the deal-board listing pool so they match current filters.
 * Dots set the price filter — same interactive pattern as Median by vintage.
 */
export default function IntelligencePriceBandMiniChart({
  city,
  kind,
  listings,
  activeBucketId = null,
  filterActive = false,
  onBucketClick,
  onResetFilter,
  onInteract,
}: {
  city: string;
  kind: "sale" | "rental";
  /** Filtered board pool (omit price so other bands stay clickable). */
  listings: readonly { price: number | null | undefined }[];
  /** Highlight when the price filter matches a single band. */
  activeBucketId?: string | null;
  filterActive?: boolean;
  onBucketClick: (bucket: { id: string; min: number; max: number | null }) => void;
  onResetFilter?: () => void;
  /** Fired when a graph point is clicked (e.g. pause mobile carousel). */
  onInteract?: () => void;
}) {
  const [bandDefs, setBandDefs] = useState<ApiBucket[]>([]);
  const [showOriginalViewFlash, setShowOriginalViewFlash] = useState(false);
  const [extraCallouts, setExtraCallouts] = useState<Set<string>>(() => new Set());
  const originalFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setBandDefs([]);
    setExtraCallouts(new Set());

    const qs = new URLSearchParams({
      city,
      kind,
    });
    void fetch(`/api/active-by-price?${qs}`, { signal: ac.signal })
      .then(async (res) => {
        if (!res.ok) return null;
        return (await res.json()) as ApiPayload;
      })
      .then((data) => {
        if (ac.signal.aborted || !data?.buckets) return;
        // Skeleton only — counts are recomputed from `listings`.
        setBandDefs(
          data.buckets
            .filter(
              (b) =>
                b.id !== "unknown" &&
                Number.isFinite(b.min),
            )
            .map((b) => ({
              id: b.id,
              label: b.label,
              min: b.min,
              max: b.max,
              count: 0,
            })),
        );
      })
      .catch(() => {
        /* aborted or network — leave empty */
      });

    return () => ac.abort();
  }, [city, kind]);

  const buckets = useMemo(
    () => recountPriceBandsFromListings(bandDefs, listings),
    [bandDefs, listings],
  );

  const points = useMemo((): BandPoint[] => {
    if (buckets.length === 0 || listings.length === 0) return [];
    // ≤3 non-empty bands → drop empty slots and spread the real points.
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
        shortLabel: shortBandLabel(b.label, kind, b.min),
        count: b.count,
        min: b.min,
        max: b.max,
        x,
        y,
        // Graph #2: label every inventory band.
        callout: true,
      };
    });
  }, [buckets, kind, listings.length]);

  const glowIds = useRandomMiniGraphGlow(points.map((p) => p.id));

  useEffect(() => {
    return () => {
      if (originalFlashTimerRef.current != null) {
        clearTimeout(originalFlashTimerRef.current);
      }
    };
  }, []);

  if (points.length === 0) return null;

  const chartTitle = ACTIVE_BY_PRICE_LABEL;
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

    onBucketClick({ id: point.id, min: point.min, max: point.max });
  };

  return (
    <div className="relative flex w-full flex-col items-stretch gap-0.5 bg-transparent">
      {showOriginalViewFlash ? (
        <p className="pointer-events-none absolute right-0 top-0 z-[1] text-right font-mono text-[9px] leading-snug tracking-[0.12em] uppercase text-navy/70">
          Original view by {VIEW_BY_PRICE_DIMENSION_LABEL}
        </p>
      ) : null}
      <div className="flex w-full min-w-0 flex-col items-stretch gap-0.5">
          <div className="relative w-full">
            <div className="pointer-events-none absolute inset-x-0 top-0 z-[1] flex items-start justify-end gap-2 px-0.5">
              <p className="min-w-0 bg-transparent text-right font-mono text-[8px] leading-snug tracking-[0.14em] uppercase text-black">
                {chartTitle}
              </p>
            </div>
          <svg
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            className="h-[4.5rem] w-full overflow-visible bg-transparent"
            role="img"
            aria-label={`${chartTitle}. Click a point to filter the deal board by price.`}
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
              // Price ($) above the point; inventory count below.
              const priceY = Math.max(9, point.y - 9);
              const countY = Math.min(HEIGHT - 3, point.y + 14);

              return (
                <g key={point.id}>
                  <title>
                    {point.label} · {point.count}{" "}
                    {kind === "rental" ? "for rent" : "for sale"}
                  </title>
                  {showCallout ? (
                    <>
                      <text
                        x={point.x}
                        y={priceY}
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
                title="Reset price filter — show all price bands"
                aria-label="All prices — reset price filter"
              >
                All prices
              </button>
            </div>
          ) : null}
      </div>
    </div>
  );
}
