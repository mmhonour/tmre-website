"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { InventorySegmentId } from "@/lib/inventory-segment-bands-shared";
import type { InventorySegmentChartSeed } from "@/lib/intelligence-inventory-segment-fssr";

/** Phrase after “Filters …” — segment inventory mini chart title. */
export const LUXURY_BY_PRICE_LABEL = "Luxury inventory by price";

const SEGMENT_ORDER: InventorySegmentId[] = ["luxury", "mid", "value"];

const SEGMENT_TAB_LABEL: Record<InventorySegmentId, string> = {
  luxury: "Luxury",
  mid: "Mid-Market",
  value: "Value",
};

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

const WIDTH = 248;
const HEIGHT = 72;
const PAD_X = 14;
const PAD_TOP = 22;
const PAD_BOTTOM = 18;

const INTERACTIVE_HINT_MS = 10_000;
const INTRO_GLOW_MS = 4_500;

function shortBandLabel(label: string): string {
  const s = label.trim();
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
  return new Set(shuffled.slice(0, Math.min(count, shuffled.length)));
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

/**
 * Intelligence inventory-by-price sparkline — Luxury / Mid-market / Value
 * (Admin segment bands). One view at a time; default Luxury. Prefers SSR seed
 * + /api/active-by-segment-price?all=1 so all three caches are warm.
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
  /** Fired when a graph point is clicked (e.g. pause mobile carousel). */
  onInteract?: () => void;
}) {
  const seedCity = initialSeed?.city ?? null;
  const [segment, setSegment] = useState<InventorySegmentId>("luxury");
  const [bySegment, setBySegment] = useState<
    Partial<Record<InventorySegmentId, ApiBucket[]>>
  >(() => {
    if (!initialSeed || initialSeed.city !== city) return {};
    return {
      luxury: bucketsFromSeed(initialSeed, "luxury"),
      mid: bucketsFromSeed(initialSeed, "mid"),
      value: bucketsFromSeed(initialSeed, "value"),
    };
  });
  const [labels, setLabels] = useState<
    Partial<Record<InventorySegmentId, string>>
  >(() => ({
    luxury: initialSeed?.bySegment.luxury?.segmentLabel,
    mid: initialSeed?.bySegment.mid?.segmentLabel,
    value: initialSeed?.bySegment.value?.segmentLabel,
  }));
  const [ready, setReady] = useState(() =>
    Boolean(
      initialSeed &&
        initialSeed.city === city &&
        SEGMENT_ORDER.every(
          (id) => (initialSeed.bySegment?.[id]?.buckets?.length ?? 0) > 0,
        ),
    ),
  );
  const [glowIds, setGlowIds] = useState<Set<string>>(() => new Set());
  const [showInteractiveHint, setShowInteractiveHint] = useState(false);
  const [extraCallouts, setExtraCallouts] = useState<Set<string>>(
    () => new Set(),
  );
  const introStartedRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    introStartedRef.current = false;

    if (initialSeed && seedCity === city) {
      setBySegment({
        luxury: bucketsFromSeed(initialSeed, "luxury"),
        mid: bucketsFromSeed(initialSeed, "mid"),
        value: bucketsFromSeed(initialSeed, "value"),
      });
      setLabels({
        luxury: initialSeed.bySegment.luxury?.segmentLabel,
        mid: initialSeed.bySegment.mid?.segmentLabel,
        value: initialSeed.bySegment.value?.segmentLabel,
      });
      setReady(true);
    } else {
      setBySegment({});
      setReady(false);
    }
    setGlowIds(new Set());
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
        setReady(SEGMENT_ORDER.every((id) => (next[id]?.length ?? 0) > 0));
      })
      .catch(() => {
        /* aborted or network */
      });

    return () => ac.abort();
    // initialSeed identity is stable from SSR for city All
    // eslint-disable-next-line react-hooks/exhaustive-deps -- city drives refetch
  }, [city, seedCity]);

  const buckets = bySegment[segment] ?? [];

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
        shortLabel: shortBandLabel(b.label),
        count: b.count,
        min: b.min,
        max: b.max,
        x,
        y,
        callout: i % 2 === 0,
      };
    });
  }, [buckets]);

  const pointIdsKey = `${segment}|${points.map((p) => p.id).join("|")}`;

  useEffect(() => {
    if (points.length === 0 || introStartedRef.current) return;
    introStartedRef.current = true;
    const withCount = points.filter((p) => p.count > 0).map((p) => p.id);
    const glowSource = withCount.length > 0 ? withCount : points.map((p) => p.id);
    setGlowIds(pickRandomGlowIds(glowSource, Math.min(3, glowSource.length)));
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intro once per segment dataset
  }, [pointIdsKey]);

  if (!ready && points.length === 0) return null;
  if (points.length === 0) return null;
  if (!points.some((p) => p.count > 0) && segment === "luxury") {
    // Still show empty mid/value switches if luxury empty
  }

  const chartTitle = LUXURY_BY_PRICE_LABEL;
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
    onBucketClick({ id: point.id, min: point.min, max: point.max });
  };

  return (
    <div className="flex w-full max-w-md flex-col items-stretch gap-0.5 bg-transparent">
      <div className="flex w-full items-start justify-start gap-2">
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
          <p className="w-full max-w-[248px] bg-transparent text-center font-mono text-[8px] leading-snug tracking-[0.14em] uppercase text-black">
            {chartTitle}
          </p>
          <div
            role="tablist"
            aria-label="Inventory segment"
            className="flex w-full max-w-[248px] flex-wrap items-center justify-center gap-x-2.5 gap-y-0.5"
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
                    setSegment(id);
                    introStartedRef.current = false;
                    setExtraCallouts(new Set());
                  }}
                  className={`font-mono text-[8px] tracking-[0.12em] uppercase transition-colors ${
                    active
                      ? "text-navy underline decoration-gold underline-offset-2"
                      : "text-charcoal/45 hover:text-navy"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <svg
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            className="h-[4.5rem] w-full max-w-[248px] overflow-visible bg-transparent"
            role="img"
            aria-label={`${chartTitle} · ${SEGMENT_TAB_LABEL[segment]}. Click a point to filter the deal board by price.`}
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
              const countY = Math.max(9, point.y - 9);
              const bandY = Math.min(HEIGHT - 3, point.y + 14);

              return (
                <g key={point.id}>
                  <title>
                    {point.label} · {point.count} for sale
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
                        {formatCount(point.count)}
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
