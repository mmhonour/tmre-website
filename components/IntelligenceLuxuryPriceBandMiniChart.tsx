"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMiniGraphsCarousel } from "@/components/IntelligenceMiniGraphsStrip";
import type { InventorySegmentId } from "@/lib/inventory-segment-bands-shared";
import type { InventorySegmentChartSeed } from "@/lib/intelligence-inventory-segment-fssr";
import { useRandomMiniGraphGlow } from "@/hooks/useRandomMiniGraphGlow";
import {
  INTEL_MINI_GRAPH_WIDTH,
  miniGraphPointX,
  selectMiniGraphBucketsForLayout,
} from "@/lib/intel-mini-graph-layout";

const LUXURY_CAROUSEL_SLOT_KEY = "luxury-inventory-price";

/** Default phrase when the Luxury band is active. */
export const LUXURY_BY_PRICE_LABEL = "LUXURY INVENTORY BY PRICE";

const SEGMENT_ORDER: InventorySegmentId[] = [
  "luxury",
  "mid",
  "value",
  "discount",
];

const SEGMENT_TAB_LABEL: Record<InventorySegmentId, string> = {
  luxury: "Luxury",
  mid: "Mid-Market",
  value: "Value",
  discount: "Discount",
};

const BAND_ROTATE_MS = 5_000;

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

type SegmentPayload = {
  segmentId?: InventorySegmentId;
  segmentLabel?: string;
  buckets?: ApiBucket[];
};

type AllApiPayload = {
  bySegment?: Partial<Record<InventorySegmentId, SegmentPayload>>;
};

const WIDTH = INTEL_MINI_GRAPH_WIDTH;
const HEIGHT = 72;
const PAD_TOP = 22;
const PAD_BOTTOM = 18;

function withDollar(label: string): string {
  const t = label.trim();
  if (!t || t.startsWith("$")) return t;
  return `$${t}`;
}

function shortBandLabel(label: string): string {
  const s = label.trim();
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

function bucketsFromSeed(
  seed: InventorySegmentChartSeed | null | undefined,
  segment: InventorySegmentId,
): ApiBucket[] {
  const row = seed?.bySegment?.[segment];
  if (!row?.buckets?.length) return [];
  return row.buckets.filter(
    (b) =>
      b.id !== "unknown" &&
      typeof b.count === "number" &&
      Number.isFinite(b.min),
  );
}

function segmentInventoryByPriceLabel(segmentLabel: string): string {
  return `${segmentLabel.trim().toUpperCase()} INVENTORY BY PRICE`;
}

function PausePlayIcon({ paused }: { paused: boolean }) {
  if (paused) {
    return (
      <svg viewBox="0 0 12 12" className="h-3 w-3" fill="currentColor" aria-hidden>
        <path d="M3.2 1.6v8.8l7.2-4.4z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 12 12" className="h-3 w-3" fill="currentColor" aria-hidden>
      <rect x="2.4" y="1.8" width="2.2" height="8.4" rx="0.4" />
      <rect x="7.4" y="1.8" width="2.2" height="8.4" rx="0.4" />
    </svg>
  );
}

/**
 * Intelligence inventory-by-price sparkline — Luxury / Mid-market / Value /
 * Discount (Admin Market Bands). Auto-cycles all bands on mobile and desktop
 * with a local pause/play control. Prefers SSR seed +
 * /api/active-by-segment-price?all=1 so all band caches are warm.
 */
export default function IntelligenceLuxuryPriceBandMiniChart({
  city,
  initialSeed = null,
  activeBucketId = null,
  filterActive = false,
  onBucketClick,
  onResetFilter,
  onInteract,
}: {
  city: string;
  initialSeed?: InventorySegmentChartSeed | null;
  activeBucketId?: string | null;
  filterActive?: boolean;
  onBucketClick: (bucket: {
    id: string;
    min: number;
    max: number | null;
  }) => void;
  onResetFilter?: () => void;
  /** Fired when a graph point / segment tab is used (e.g. pause mobile carousel). */
  onInteract?: () => void;
}) {
  const seedCity = initialSeed?.city ?? null;
  const miniCarousel = useMiniGraphsCarousel();
  /** Only cycle bands while this graph is on-screen (mobile slide or desktop window). */
  const isActiveCarouselSlide =
    !miniCarousel?.isCarousel ||
    (miniCarousel.isKeyVisible
      ? miniCarousel.isKeyVisible(LUXURY_CAROUSEL_SLOT_KEY)
      : miniCarousel.activeKey === LUXURY_CAROUSEL_SLOT_KEY);
  const [segment, setSegment] = useState<InventorySegmentId>("luxury");
  const [bandPaused, setBandPaused] = useState(false);
  const [bySegment, setBySegment] = useState<
    Partial<Record<InventorySegmentId, ApiBucket[]>>
  >(() => {
    if (!initialSeed || initialSeed.city !== city) return {};
    return {
      luxury: bucketsFromSeed(initialSeed, "luxury"),
      mid: bucketsFromSeed(initialSeed, "mid"),
      value: bucketsFromSeed(initialSeed, "value"),
      discount: bucketsFromSeed(initialSeed, "discount"),
    };
  });
  const [labels, setLabels] = useState<
    Partial<Record<InventorySegmentId, string>>
  >(() => ({
    luxury: initialSeed?.bySegment.luxury?.segmentLabel,
    mid: initialSeed?.bySegment.mid?.segmentLabel,
    value: initialSeed?.bySegment.value?.segmentLabel,
    discount: initialSeed?.bySegment.discount?.segmentLabel,
  }));
  const [ready, setReady] = useState(() =>
    Boolean(
      initialSeed &&
        initialSeed.city === city &&
        SEGMENT_ORDER.some(
          (id) => (initialSeed.bySegment?.[id]?.buckets?.length ?? 0) > 0,
        ),
    ),
  );
  const [extraCallouts, setExtraCallouts] = useState<Set<string>>(
    () => new Set(),
  );
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setBandPaused(false);
    setSegment("luxury");

    if (initialSeed && seedCity === city) {
      setBySegment({
        luxury: bucketsFromSeed(initialSeed, "luxury"),
        mid: bucketsFromSeed(initialSeed, "mid"),
        value: bucketsFromSeed(initialSeed, "value"),
        discount: bucketsFromSeed(initialSeed, "discount"),
      });
      setLabels({
        luxury: initialSeed.bySegment.luxury?.segmentLabel,
        mid: initialSeed.bySegment.mid?.segmentLabel,
        value: initialSeed.bySegment.value?.segmentLabel,
        discount: initialSeed.bySegment.discount?.segmentLabel,
      });
      setReady(
        SEGMENT_ORDER.some(
          (id) => (initialSeed.bySegment?.[id]?.buckets?.length ?? 0) > 0,
        ),
      );
    } else {
      setBySegment({});
      setReady(false);
    }
    setExtraCallouts(new Set());

    const qs = new URLSearchParams({ city, all: "1" });
    void fetch(`/api/active-by-segment-price?${qs}`, { signal: ac.signal })
      .then(async (res) => {
        if (!res.ok) return null;
        return (await res.json()) as AllApiPayload;
      })
      .then((data) => {
        if (ac.signal.aborted || !data?.bySegment) return;
        const next: Partial<Record<InventorySegmentId, ApiBucket[]>> = {};
        const nextLabels: Partial<Record<InventorySegmentId, string>> = {};
        for (const id of SEGMENT_ORDER) {
          const row = data.bySegment[id];
          if (!row?.buckets) continue;
          next[id] = row.buckets.filter(
            (b) =>
              b.id !== "unknown" &&
              typeof b.count === "number" &&
              Number.isFinite(b.min),
          );
          if (row.segmentLabel) nextLabels[id] = row.segmentLabel;
        }
        setBySegment(next);
        setLabels((prev) => ({ ...prev, ...nextLabels }));
        setReady(SEGMENT_ORDER.some((id) => (next[id]?.length ?? 0) > 0));
      })
      .catch(() => {
        /* aborted or network */
      });

    return () => ac.abort();
    // initialSeed identity is stable from SSR for city All
    // eslint-disable-next-line react-hooks/exhaustive-deps -- city drives refetch
  }, [city, seedCity]);

  const buckets = bySegment[segment] ?? [];
  const segmentDataKey = SEGMENT_ORDER.map(
    (id) => `${id}:${bySegment[id]?.length ?? 0}`,
  ).join("|");

  // When this slide becomes active on the mobile carousel, restart at Luxury
  // so the parent’s 4× dwell shows all bands before advancing to #1.
  useEffect(() => {
    if (!isActiveCarouselSlide) return;
    setSegment("luxury");
    setExtraCallouts(new Set());
  }, [isActiveCarouselSlide]);

  // Cycle Luxury → Mid-Market → Value → Discount (pause while off-screen on mobile).
  useEffect(() => {
    if (bandPaused || !ready || !isActiveCarouselSlide) return;
    const timer = window.setInterval(() => {
      setSegment((prev) => {
        const idx = SEGMENT_ORDER.indexOf(prev);
        return SEGMENT_ORDER[(idx + 1) % SEGMENT_ORDER.length]!;
      });
      setExtraCallouts(new Set());
    }, BAND_ROTATE_MS);
    return () => window.clearInterval(timer);
  }, [bandPaused, ready, segmentDataKey, isActiveCarouselSlide]);

  const points = useMemo((): BandPoint[] => {
    if (buckets.length === 0) return [];
    // ≤3 non-empty bands → drop empty slots and spread the real points.
    const plot = selectMiniGraphBucketsForLayout(buckets);
    if (plot.length === 0) return [];
    const counts = plot.map((b) => b.count);
    const minC = Math.min(...counts);
    const maxC = Math.max(...counts);
    const span = Math.max(maxC - minC, 1);
    const innerH = HEIGHT - PAD_TOP - PAD_BOTTOM;
    const n = plot.length;
    const labelAll = n <= 3;

    return plot.map((b, i) => {
      const x = miniGraphPointX(i, n, WIDTH);
      const y = PAD_TOP + innerH * (1 - (b.count - minC) / span);
      return {
        id: b.id,
        label: b.label,
        shortLabel: shortBandLabel(b.label),
        count: b.count,
        min: b.min,
        max: b.max,
        x,
        y,
        callout: labelAll || i % 2 === 0,
      };
    });
  }, [buckets]);

  const glowIds = useRandomMiniGraphGlow(
    points.map((p) => p.id),
    // Keep glowing on desktop always; on mobile carousel only while visible
    // so off-screen slides don't burn timers — other graphs still glow on their own.
    isActiveCarouselSlide,
  );
  const segmentLabel = labels[segment] ?? SEGMENT_TAB_LABEL[segment];
  const chartTitle = segmentInventoryByPriceLabel(segmentLabel);
  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");

  const pauseBandRotation = () => {
    setBandPaused(true);
    onInteract?.();
  };

  const handlePointClick = (point: BandPoint) => {
    pauseBandRotation();
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

  // Keep the carousel slide occupied while segment caches warm (avoid a blank mobile slide).
  if (!ready) {
    return (
      <div className="relative flex w-full flex-col items-stretch gap-0.5 bg-transparent">
        <div className="flex w-full min-w-0 flex-col items-stretch gap-0.5">
          <div className="flex w-full flex-wrap items-center justify-between gap-x-2 gap-y-1">
            <div
              role="tablist"
              aria-label="Inventory segment"
              className="flex min-w-0 flex-wrap items-center justify-start gap-x-2.5 gap-y-0.5"
            >
              {SEGMENT_ORDER.map((id) => (
                <span
                  key={id}
                  className="font-mono text-[8px] tracking-[0.12em] uppercase text-navy/35"
                >
                  {SEGMENT_TAB_LABEL[id]}
                </span>
              ))}
            </div>
          </div>
          <div className="relative flex h-[4.5rem] w-full items-center justify-center">
            <p className="pointer-events-none absolute right-0.5 top-0 text-right font-mono text-[8px] leading-snug tracking-[0.14em] uppercase text-black/50">
              {LUXURY_BY_PRICE_LABEL}
            </p>
            <p className="font-mono text-[9px] tracking-[0.12em] uppercase text-slate/40">
              Loading…
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex w-full flex-col items-stretch gap-0.5 bg-transparent">
      <div className="flex w-full min-w-0 flex-col items-stretch gap-0.5">
          <div className="flex w-full flex-wrap items-center justify-between gap-x-2 gap-y-1">
            <div
              role="tablist"
              aria-label="Inventory segment"
              className="flex min-w-0 flex-wrap items-center justify-start gap-x-2.5 gap-y-0.5"
            >
              {SEGMENT_ORDER.map((id) => {
                const active = segment === id;
                const label = labels[id] ?? SEGMENT_TAB_LABEL[id];
                return (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => {
                      pauseBandRotation();
                      setSegment(id);
                      setExtraCallouts(new Set());
                    }}
                    className={`font-mono text-[8px] tracking-[0.12em] uppercase transition-colors ${
                      id === "luxury"
                        ? active
                          ? "text-navy underline decoration-gold underline-offset-2"
                          : "text-navy/55 hover:text-navy"
                        : id === "value"
                          ? active
                            ? "text-sage underline decoration-gold underline-offset-2"
                            : "text-sage/60 hover:text-sage"
                          : id === "discount"
                            ? active
                              ? "text-coral underline decoration-gold underline-offset-2"
                              : "text-coral/60 hover:text-coral"
                            : active
                              ? "text-black underline decoration-gold underline-offset-2"
                              : "text-black/45 hover:text-black"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => setBandPaused((p) => !p)}
              aria-pressed={bandPaused}
              aria-label={
                bandPaused
                  ? "Resume market band rotation"
                  : "Pause market band rotation"
              }
              title={bandPaused ? "Play band cycle" : "Pause band cycle"}
              className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors ${
                bandPaused
                  ? "border-gold/50 bg-gold/15 text-navy"
                  : "border-navy/20 bg-white text-navy/70 hover:border-navy/40 hover:text-navy"
              }`}
            >
              <PausePlayIcon paused={bandPaused} />
            </button>
          </div>
          {points.length > 0 ? (
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
              const isFirst = i === 0;
              const isLast = i === points.length - 1;
              const anchor = isFirst ? "start" : isLast ? "end" : "middle";
              // Price ($) above the point; inventory count below.
              const priceY = Math.max(9, point.y - 9);
              const countY = Math.min(HEIGHT - 3, point.y + 14);

              return (
                <g key={point.id}>
                  <title>
                    {point.label} · {point.count} for sale
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
                        {formatCount(point.count)}
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
          ) : (
            <div className="relative flex h-[4.5rem] w-full items-center justify-center">
              <p className="pointer-events-none absolute right-0.5 top-0 text-right font-mono text-[8px] leading-snug tracking-[0.14em] uppercase text-black">
                {chartTitle}
              </p>
              <p className="font-mono text-[9px] tracking-[0.12em] uppercase text-slate/45">
                No inventory in this band
              </p>
            </div>
          )}

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
