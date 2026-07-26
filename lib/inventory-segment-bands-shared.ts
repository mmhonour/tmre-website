/**
 * Client-safe Value / Mid-market / Luxury inventory segment bands.
 * Luxury fine steps default to $1M ($4–10M) and $5M ($10M+).
 */

import {
  classifySalePrice,
  emptyPriceCounts,
  type PriceBucketDef,
  visiblePriceBuckets,
} from "@/lib/price-buckets-shared";

export type InventorySegmentId = "value" | "mid" | "luxury";

export type InventorySegmentDef = {
  id: InventorySegmentId;
  label: string;
  /** Inclusive floor for the segment. */
  min: number;
  /** Inclusive ceiling; null = open-ended. */
  max: number | null;
  /** Fine inventory steps for Intelligence charts (editable). */
  steps: PriceBucketDef[];
};

export type InventorySegmentBandsConfig = {
  segments: InventorySegmentDef[];
};

export const INVENTORY_SEGMENT_IDS: InventorySegmentId[] = [
  "value",
  "mid",
  "luxury",
];

/** Default Value steps — sub-$1.25M inventory. */
export const DEFAULT_VALUE_STEPS: PriceBucketDef[] = [
  { id: "val-0-500k", label: "$0–$499.99K", min: 0, max: 499_999 },
  { id: "val-500-750k", label: "$500K–$749.99K", min: 500_000, max: 749_999 },
  { id: "val-750-1m", label: "$750K–$999.99K", min: 750_000, max: 999_999 },
  { id: "val-1-1.25m", label: "$1M–$1.249M", min: 1_000_000, max: 1_249_999 },
];

/** Default Mid-market steps — $1.25M–$4M inventory. */
export const DEFAULT_MID_STEPS: PriceBucketDef[] = [
  {
    id: "mid-1.25-1.75m",
    label: "$1.25M–$1.749M",
    min: 1_250_000,
    max: 1_749_999,
  },
  {
    id: "mid-1.75-2.25m",
    label: "$1.75M–$2.249M",
    min: 1_750_000,
    max: 2_249_999,
  },
  {
    id: "mid-2.25-3m",
    label: "$2.25M–$2.999M",
    min: 2_250_000,
    max: 2_999_999,
  },
  { id: "mid-3-4m", label: "$3M–$3.999M", min: 3_000_000, max: 3_999_999 },
];

/** Default Luxury steps — $1M ($4–10M), $5M ($10M+). */
export const DEFAULT_LUXURY_STEPS: PriceBucketDef[] = [
  { id: "lux-4-5m", label: "$4M–$5M", min: 4_000_000, max: 4_999_999 },
  { id: "lux-5-6m", label: "$5M–$6M", min: 5_000_000, max: 5_999_999 },
  { id: "lux-6-7m", label: "$6M–$7M", min: 6_000_000, max: 6_999_999 },
  { id: "lux-7-8m", label: "$7M–$8M", min: 7_000_000, max: 7_999_999 },
  { id: "lux-8-9m", label: "$8M–$9M", min: 8_000_000, max: 8_999_999 },
  { id: "lux-9-10m", label: "$9M–$10M", min: 9_000_000, max: 9_999_999 },
  { id: "lux-10-15m", label: "$10M–$15M", min: 10_000_000, max: 14_999_999 },
  { id: "lux-15-20m", label: "$15M–$20M", min: 15_000_000, max: 19_999_999 },
  { id: "lux-20-25m", label: "$20M–$25M", min: 20_000_000, max: 24_999_999 },
  { id: "lux-25-30m", label: "$25M–$30M", min: 25_000_000, max: 29_999_999 },
  { id: "lux-30m-plus", label: "$30M+", min: 30_000_000, max: null },
];

export const DEFAULT_INVENTORY_SEGMENT_BANDS: InventorySegmentBandsConfig = {
  segments: [
    {
      id: "value",
      label: "Value",
      min: 0,
      max: 1_249_999,
      steps: DEFAULT_VALUE_STEPS,
    },
    {
      id: "mid",
      label: "Mid-market",
      min: 1_250_000,
      max: 3_999_999,
      steps: DEFAULT_MID_STEPS,
    },
    {
      id: "luxury",
      label: "Luxury",
      min: 4_000_000,
      max: null,
      steps: DEFAULT_LUXURY_STEPS,
    },
  ],
};

function cloneSteps(steps: readonly PriceBucketDef[]): PriceBucketDef[] {
  return steps.map((b) => ({
    id: b.id,
    label: b.label,
    min: b.min,
    max: b.max,
    ...(b.hidden ? { hidden: true as const } : {}),
  }));
}

export function cloneInventorySegmentBandsConfig(
  config: InventorySegmentBandsConfig = DEFAULT_INVENTORY_SEGMENT_BANDS,
): InventorySegmentBandsConfig {
  return {
    segments: config.segments.map((s) => ({
      id: s.id,
      label: s.label,
      min: s.min,
      max: s.max,
      steps: cloneSteps(s.steps),
    })),
  };
}

export function isDefaultInventorySegmentBandsConfig(
  config: InventorySegmentBandsConfig,
): boolean {
  return (
    JSON.stringify(config) === JSON.stringify(DEFAULT_INVENTORY_SEGMENT_BANDS)
  );
}

function normalizeStep(
  raw: unknown,
  usedIds: Set<string>,
  index: number,
): { ok: true; step: PriceBucketDef } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: `Step ${index + 1} is invalid` };
  }
  const o = raw as Record<string, unknown>;
  const min = Number(o.min);
  if (!Number.isFinite(min) || min < 0) {
    return { ok: false, error: `Step ${index + 1} needs a valid min` };
  }
  let max: number | null = null;
  if (o.max != null && o.max !== "") {
    max = Number(o.max);
    if (!Number.isFinite(max) || max < min) {
      return { ok: false, error: `Step ${index + 1} max must be ≥ min` };
    }
  }
  let id = typeof o.id === "string" ? o.id.trim() : "";
  if (!id) id = `step-${index + 1}`;
  if (usedIds.has(id)) id = `${id}-${index + 1}`;
  usedIds.add(id);
  const label =
    typeof o.label === "string" && o.label.trim()
      ? o.label.trim()
      : max == null
        ? `$${Math.round(min / 1_000_000)}M+`
        : `Band ${index + 1}`;
  const step: PriceBucketDef = {
    id,
    label,
    min: Math.round(min),
    max: max == null ? null : Math.round(max),
  };
  if (o.hidden === true) step.hidden = true;
  return { ok: true, step };
}

export function normalizeInventorySegmentBandsConfig(
  input: unknown,
):
  | { ok: true; config: InventorySegmentBandsConfig }
  | { ok: false; error: string } {
  if (!input || typeof input !== "object") {
    return { ok: false, error: "Config must be an object" };
  }
  const segmentsRaw = (input as { segments?: unknown }).segments;
  if (!Array.isArray(segmentsRaw) || segmentsRaw.length === 0) {
    return { ok: false, error: "segments must be a non-empty array" };
  }

  const byId = new Map<string, unknown>();
  for (const row of segmentsRaw) {
    if (!row || typeof row !== "object") continue;
    const id = String((row as { id?: unknown }).id ?? "");
    if (INVENTORY_SEGMENT_IDS.includes(id as InventorySegmentId)) {
      byId.set(id, row);
    }
  }

  const segments: InventorySegmentDef[] = [];
  for (const id of INVENTORY_SEGMENT_IDS) {
    const fallback = DEFAULT_INVENTORY_SEGMENT_BANDS.segments.find(
      (s) => s.id === id,
    )!;
    const raw = byId.get(id) as Record<string, unknown> | undefined;
    const min = Number(raw?.min ?? fallback.min);
    if (!Number.isFinite(min) || min < 0) {
      return { ok: false, error: `${fallback.label}: invalid min` };
    }
    let max: number | null = fallback.max;
    if (raw && "max" in raw) {
      if (raw.max == null || raw.max === "") max = null;
      else {
        max = Number(raw.max);
        if (!Number.isFinite(max) || max < min) {
          return { ok: false, error: `${fallback.label}: max must be ≥ min` };
        }
      }
    }
    const label =
      typeof raw?.label === "string" && raw.label.trim()
        ? raw.label.trim()
        : fallback.label;

    const stepsRaw = Array.isArray(raw?.steps) ? raw.steps : fallback.steps;
    if (stepsRaw.length === 0) {
      return { ok: false, error: `${label}: add at least one step` };
    }
    const usedIds = new Set<string>();
    const steps: PriceBucketDef[] = [];
    for (let i = 0; i < stepsRaw.length; i++) {
      const n = normalizeStep(stepsRaw[i], usedIds, i);
      if (!n.ok) return n;
      steps.push(n.step);
    }
    if (visiblePriceBuckets(steps).length < 1) {
      return { ok: false, error: `${label}: keep at least one visible step` };
    }

    segments.push({
      id,
      label,
      min: Math.round(min),
      max: max == null ? null : Math.round(max),
      steps,
    });
  }

  return { ok: true, config: { segments } };
}

export function getInventorySegment(
  config: InventorySegmentBandsConfig,
  id: InventorySegmentId,
): InventorySegmentDef {
  return (
    config.segments.find((s) => s.id === id) ??
    DEFAULT_INVENTORY_SEGMENT_BANDS.segments.find((s) => s.id === id)!
  );
}

export function luxuryFloorFromConfig(
  config: InventorySegmentBandsConfig,
): number {
  return getInventorySegment(config, "luxury").min;
}

export function luxuryStepsFromConfig(
  config: InventorySegmentBandsConfig,
): PriceBucketDef[] {
  return visiblePriceBuckets(getInventorySegment(config, "luxury").steps);
}

export function classifySegmentStepPrice(
  price: number | null | undefined,
  steps: readonly PriceBucketDef[],
): string {
  return classifySalePrice(price, steps);
}

export function emptySegmentStepCounts(
  steps: readonly PriceBucketDef[],
): Record<string, number> {
  return emptyPriceCounts(steps);
}

export function suggestSegmentStepId(
  label: string,
  used: Set<string>,
): string {
  const base =
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 24) || "step";
  let id = base;
  let n = 2;
  while (used.has(id)) {
    id = `${base}-${n}`;
    n += 1;
  }
  return id;
}
