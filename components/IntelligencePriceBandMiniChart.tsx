"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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

const WIDTH = 248;
const HEIGHT = 72;
const PAD_X = 14;
const PAD_TOP = 22;
const PAD_BOTTOM = 18;

const INTERACTIVE_HINT_MS = 10_000;
const ORIGINAL_VIEW_FLASH_MS = 5_000;
const INTRO_GLOW_MS = 4_500;

function shortBandLabel(label: string, kind: "sale" | "rental"): string {
  const s = label.replace(/\/mo/gi, "").trim();
  if (kind === "rental") {
    const m = s.match(/\$?([\d,.]+)\s*[Kk]?\+?/);
    if (/\+/.test(s)) return `${(m?.[1] ?? "12").replace(/,.*/, "")}k+`;
    const lo = s.match(/\$?([\d,.]+)/);
    if (lo) {
      const n = Number(lo[1].replace(/,/g, ""));
      if (Number.isFinite(n)) {
        return n >= 1000 ? `${Math.round(n / 1000)}k` : String(n);
      }
    }
  }
  // Sale: "$500K–$1.249M" → "500K"; "$10M+" → "10M+"
  const plus = s.match(/\$?([\d.]+)\s*([MmKk])\+/);
  if (plus) return `${plus[1]}${plus[2].toUpperCase()}+`;
  const start = s.match(/\$?([\d.]+)\s*([MmKk])?/);
  if (start) {
    const unit = (start[2] ?? "").toUpperCase();
    return unit ? `${start[1]}${unit}` : start[1];
  }
  return s.slice(0, 6);
}

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(n);
}

function pickRandomGlowIds(ids: string[], count: number): Set<string> {
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
 * Mini active-inventory-by-price sparkline above the Intelligence deal board.
 * Reads precomputed stats_cache via /api/active-by-price (same bands as
 * Admin → Sales by price bands / rent buckets). Dots set the price filter —
 * same interactive pattern as Median by vintage.
 */
export default function IntelligencePriceBandMiniChart({
  city,
  kind,
  activeBucketId = null,
  filterActive = false,
  onBucketClick,
  onResetFilter,
}: {
  city: string;
  kind: "sale" | "rental";
  /** Highlight when the price filter matches a single band. */
  activeBucketId?: string | null;
  filterActive?: boolean;
  onBucketClick: (bucket: { id: string; min: number; max: number | null }) => void;
  onResetFilter?: () => void;
}) {
  const [buckets, setBuckets] = useState<ApiBucket[]>([]);
  const [glowIds, setGlowIds] = useState<Set<string>>(() => new Set());
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
    setGlowIds(new Set());
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
        setBuckets(
          data.buckets.filter(
            (b) =>
              b.id !== "unknown" &&
              typeof b.count === "number" &&
              Number.isFinite(b.min),
          ),
        );
      })
      .catch(() => {
        /* aborted or network — leave empty */
      });

    return () => ac.abort();
  }, [city, kind]);

  const points = useMemo((): BandPoint[] => {
    if (buckets.length === 0) return [];
    const counts = buckets.map((b) => b.count);
    const minC = Math.min(...counts);
    const maxC = Math.max(...counts);
    const span = Math.max(maxC - minC, 1);
    const innerW = WIDTH - PAD_X * 2;
    const innerH = HEIGHT - PAD_TOP - PAD_BOTTOM;
    const n = buckets.length;

    return buckets.map((b, i) => {
      const x = n === 1 ? WIDTH / 2 : PAD_X + (innerW * i) / (n - 1);
      const y = PAD_TOP + innerH * (1 - (b.count - minC) / span);
      return {
        id: b.id,
        label: b.label,
        shortLabel: shortBandLabel(b.label, kind),
        count: b.count,
        min: b.min,
        max: b.max,
        x,
        y,
        callout: i % 2 === 0,
      };
    });
  }, [buckets, kind]);

  const pointIdsKey = points.map((p) => p.id).join("|");

  useEffect(() => {
    if (points.length === 0 || introStartedRef.current) return;
    introStartedRef.current = true;

    const withCount = points.filter((p) => p.count > 0).map((p) => p.id);
    const glowSource = withCount.length > 0 ? withCount : points.map((p) => p.id);
    const glowCount = Math.min(3, Math.max(1, Math.ceil(glowSource.length / 3)));
    setGlowIds(pickRandomGlowIds(glowSource, glowCount));
    setShowInteractiveHint(true);

    const glowTimer = window.setTimeout(() => setGlowIds(new Set()), INTRO_GLOW_MS);
    const hintTimer = window.setTimeout(
      () => setShowInteractiveHint(false),
      INTERACTIVE_HINT_MS,
    );
    return () => {
      window.clearTimeout(glowTimer);
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

  const chartTitle = ACTIVE_BY_PRICE_LABEL;
  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");

  const handlePointClick = (point: BandPoint) => {
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
    <div className="flex w-full max-w-md flex-col items-stretch gap-0.5 bg-transparent">
      <p className="bg-transparent font-mono text-[8px] leading-snug tracking-[0.14em] uppercase text-black">
        {chartTitle}
      </p>
      <div className="flex w-full items-center justify-start gap-2">
        <div className="relative w-[4.75rem] shrink-0 self-center">
          <p
            className={`text-left italic text-[10px] leading-snug text-slate/55 transition-opacity duration-700 ease-in-out ${
              showInteractiveHint
                ? "animate-interactive-graph-hint"
                : "pointer-events-none opacity-0"
            }`}
            aria-hidden={!showInteractiveHint}
          >
            interactive graph
          </p>
          {showOriginalViewFlash ? (
            <p className="absolute inset-x-0 top-0 font-mono text-[9px] leading-snug tracking-[0.12em] uppercase text-navy/70">
              Original view by {VIEW_BY_PRICE_DIMENSION_LABEL}
            </p>
          ) : null}
        </div>
        <div className="flex min-w-0 flex-1 flex-col items-stretch gap-0.5">
          <svg
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            className="h-[4.5rem] w-full max-w-[248px] overflow-visible bg-transparent"
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
              const countY = Math.max(9, point.y - 9);
              const bandY = Math.min(HEIGHT - 3, point.y + 14);

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
                        y={countY}
                        textAnchor={anchor}
                        className="fill-navy font-mono text-[8px] tabular-nums"
                        style={{ fontSize: 8 }}
                      >
                        {countLabel}
                      </text>
                      <text
                        x={point.x}
                        y={bandY}
                        textAnchor={anchor}
                        className="fill-slate/55 font-mono text-[7px] uppercase"
                        style={{ fontSize: 7, letterSpacing: "0.04em" }}
                      >
                        {point.shortLabel}
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

          {filterActive && onResetFilter ? (
            <div className="flex w-full max-w-[248px] justify-end">
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
    </div>
  );
}
