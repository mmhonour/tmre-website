"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/** Phrase after “Filters …” — swap later without rewriting the chrome. */
export const ACTIVE_BY_PRICE_LABEL = "Inventory by price";

type BandPoint = {
  id: string;
  label: string;
  shortLabel: string;
  count: number;
  min: number;
  max: number | null;
  x: number;
  barH: number;
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
const PAD_X = 10;
const PAD_TOP = 16;
const PAD_BOTTOM = 16;
const BAR_GAP = 3;

const INTERACTIVE_HINT_MS = 10_000;
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

/**
 * Mini active-inventory-by-price chart above the Intelligence deal board.
 * Reads precomputed stats_cache via /api/active-by-price (same bands as
 * Admin → Sales by price bands / rent buckets). Bars set the price filter.
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
  const [extraCallouts, setExtraCallouts] = useState<Set<string>>(() => new Set());
  const introStartedRef = useRef(false);
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
    const maxCount = Math.max(...buckets.map((b) => b.count), 1);
    const innerW = WIDTH - PAD_X * 2;
    const innerH = HEIGHT - PAD_TOP - PAD_BOTTOM;
    const n = buckets.length;
    const barW = Math.max(4, (innerW - BAR_GAP * (n - 1)) / n);

    return buckets.map((b, i) => {
      const x = PAD_X + i * (barW + BAR_GAP) + barW / 2;
      const barH = b.count > 0 ? Math.max(3, (innerH * b.count) / maxCount) : 1;
      return {
        id: b.id,
        label: b.label,
        shortLabel: shortBandLabel(b.label, kind),
        count: b.count,
        min: b.min,
        max: b.max,
        x,
        barH,
        callout: i % 2 === 0,
      };
    });
  }, [buckets, kind]);

  const pointIdsKey = points.map((p) => p.id).join("|");
  const barW =
    points.length > 0
      ? Math.max(
          4,
          (WIDTH - PAD_X * 2 - BAR_GAP * (points.length - 1)) / points.length,
        )
      : 8;

  useEffect(() => {
    if (points.length === 0 || introStartedRef.current) return;
    introStartedRef.current = true;

    const ranked = [...points].sort((a, b) => b.count - a.count);
    const glowCount = Math.min(3, Math.max(1, Math.ceil(points.length / 3)));
    setGlowIds(new Set(ranked.slice(0, glowCount).map((p) => p.id)));
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

  if (points.length === 0) return null;

  const chartTitle = ACTIVE_BY_PRICE_LABEL;
  const baseline = HEIGHT - PAD_BOTTOM;

  const handleBarClick = (point: BandPoint) => {
    if (!point.callout) {
      setExtraCallouts((prev) => {
        if (prev.has(point.id)) return prev;
        const next = new Set(prev);
        next.add(point.id);
        return next;
      });
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
        </div>
        <div className="flex min-w-0 flex-1 flex-col items-stretch gap-0.5">
          <svg
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            className="h-[4.5rem] w-full max-w-[248px] overflow-visible bg-transparent"
            role="img"
            aria-label={`${chartTitle}. Click a bar to filter the deal board by price.`}
          >
            {points.map((point) => {
              const active = activeBucketId === point.id;
              const glowing = glowIds.has(point.id);
              const showCallout = point.callout || extraCallouts.has(point.id);
              const barX = point.x - barW / 2;
              const barY = baseline - point.barH;
              const countY = Math.max(9, barY - 4);

              return (
                <g key={point.id}>
                  <title>
                    {point.label} · {point.count}{" "}
                    {kind === "rental" ? "for rent" : "for sale"}
                  </title>
                  {glowing ? (
                    <rect
                      x={barX - 1}
                      y={barY - 1}
                      width={barW + 2}
                      height={point.barH + 2}
                      rx={1.5}
                      className="fill-gold/20 animate-vintage-dot-glow pointer-events-none"
                    />
                  ) : null}
                  <rect
                    x={barX}
                    y={barY}
                    width={barW}
                    height={point.barH}
                    rx={1}
                    className={
                      active
                        ? "fill-gold cursor-pointer"
                        : glowing
                          ? "fill-gold/80 cursor-pointer animate-vintage-dot-glow"
                          : "fill-navy/55 cursor-pointer hover:fill-gold"
                    }
                    onClick={() => handleBarClick(point)}
                  />
                  {/* Hit target */}
                  <rect
                    x={barX - 1}
                    y={PAD_TOP}
                    width={barW + 2}
                    height={HEIGHT - PAD_TOP - 2}
                    fill="transparent"
                    className="cursor-pointer"
                    onClick={() => handleBarClick(point)}
                  />
                  {showCallout ? (
                    <>
                      <text
                        x={point.x}
                        y={countY}
                        textAnchor="middle"
                        className="fill-navy font-mono text-[8px] tabular-nums"
                        style={{ fontSize: 8 }}
                      >
                        {formatCount(point.count)}
                      </text>
                      <text
                        x={point.x}
                        y={Math.min(HEIGHT - 2, baseline + 10)}
                        textAnchor="middle"
                        className="fill-slate/55 font-mono text-[7px] uppercase"
                        style={{ fontSize: 7, letterSpacing: "0.02em" }}
                      >
                        {point.shortLabel}
                      </text>
                    </>
                  ) : null}
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
