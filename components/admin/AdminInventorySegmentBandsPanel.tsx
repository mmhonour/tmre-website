"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  cloneInventorySegmentBandsConfig,
  INVENTORY_SEGMENT_IDS,
  suggestSegmentStepId,
  type InventorySegmentBandsConfig,
  type InventorySegmentId,
  type InventorySegmentDef,
} from "@/lib/inventory-segment-bands-shared";
import type { PriceBucketDef } from "@/lib/price-buckets-shared";

type ApiPayload = {
  config: InventorySegmentBandsConfig;
  default: InventorySegmentBandsConfig;
  isDefault: boolean;
  note?: string;
  error?: string;
};

function fmtMoney(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function bandRangeLabel(b: PriceBucketDef): string {
  if (b.max == null) return `${fmtMoney(b.min)}+`;
  return `${fmtMoney(b.min)} – ${fmtMoney(b.max)}`;
}

/**
 * Admin editor for Intelligence inventory segments (Value / Mid-market / Luxury)
 * stored in Postgres sync_meta. Luxury steps drive the Intelligence luxury chart.
 */
export default function AdminInventorySegmentBandsPanel() {
  const [saved, setSaved] = useState<InventorySegmentBandsConfig | null>(null);
  const [draft, setDraft] = useState<InventorySegmentBandsConfig | null>(null);
  const [defaults, setDefaults] = useState<InventorySegmentBandsConfig | null>(
    null,
  );
  const [isDefault, setIsDefault] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [activeSegment, setActiveSegment] =
    useState<InventorySegmentId>("luxury");

  const applyPayload = useCallback((body: ApiPayload) => {
    setSaved(cloneInventorySegmentBandsConfig(body.config));
    setDraft(cloneInventorySegmentBandsConfig(body.config));
    setDefaults(cloneInventorySegmentBandsConfig(body.default));
    setIsDefault(body.isDefault);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/inventory-segment-bands", {
        cache: "no-store",
      });
      const body = (await res.json()) as ApiPayload;
      if (!res.ok) {
        setError(body.error ?? "Failed to load inventory segments");
        return;
      }
      applyPayload(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [applyPayload]);

  useEffect(() => {
    void load();
  }, [load]);

  const dirty = useMemo(() => {
    if (!draft || !saved) return false;
    return JSON.stringify(draft) !== JSON.stringify(saved);
  }, [draft, saved]);

  const segment: InventorySegmentDef | null = useMemo(() => {
    if (!draft) return null;
    return draft.segments.find((s) => s.id === activeSegment) ?? null;
  }, [draft, activeSegment]);

  function patchSegment(
    id: InventorySegmentId,
    patch: Partial<Pick<InventorySegmentDef, "label" | "min" | "max">>,
  ) {
    setDraft((prev) => {
      if (!prev) return prev;
      return {
        segments: prev.segments.map((s) =>
          s.id === id
            ? {
                ...s,
                ...patch,
                max:
                  patch.max === undefined
                    ? s.max
                    : patch.max == null
                      ? null
                      : patch.max,
              }
            : s,
        ),
      };
    });
  }

  function patchStep(
    segmentId: InventorySegmentId,
    index: number,
    patch: Partial<PriceBucketDef>,
  ) {
    setDraft((prev) => {
      if (!prev) return prev;
      return {
        segments: prev.segments.map((s) => {
          if (s.id !== segmentId) return s;
          const steps = s.steps.map((b, i) => {
            if (i !== index) return b;
            const next = { ...b, ...patch };
            if (patch.hidden === false) delete next.hidden;
            return next;
          });
          return { ...s, steps };
        }),
      };
    });
  }

  function addStep(segmentId: InventorySegmentId) {
    setDraft((prev) => {
      if (!prev) return prev;
      return {
        segments: prev.segments.map((s) => {
          if (s.id !== segmentId) return s;
          const used = new Set(s.steps.map((b) => b.id));
          const last = s.steps[s.steps.length - 1];
          const min =
            last?.max != null ? last.max + 1 : (last?.min ?? s.min) + 1_000_000;
          const label = `New step ${s.steps.length + 1}`;
          const id = suggestSegmentStepId(label, used);
          return {
            ...s,
            steps: [...s.steps, { id, label, min, max: min + 999_999 }],
          };
        }),
      };
    });
  }

  function removeStep(segmentId: InventorySegmentId, index: number) {
    setDraft((prev) => {
      if (!prev) return prev;
      return {
        segments: prev.segments.map((s) => {
          if (s.id !== segmentId || s.steps.length <= 1) return s;
          return { ...s, steps: s.steps.filter((_, i) => i !== index) };
        }),
      };
    });
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/inventory-segment-bands", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: draft }),
      });
      const body = (await res.json()) as ApiPayload;
      if (!res.ok) {
        setError(body.error ?? "Save failed");
        return;
      }
      applyPayload(body);
      setNotice(
        body.note ??
          "Saved. Rebuild Stats cache so Intelligence charts use the new steps.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function resetToDefault() {
    if (!defaults) return;
    if (
      !window.confirm(
        "Reset Value, Mid-market, and Luxury ranges/steps to code defaults?",
      )
    ) {
      return;
    }
    setDraft(cloneInventorySegmentBandsConfig(defaults));
  }

  return (
    <div
      id="admin-inventory-segment-bands"
      className="scroll-mt-24 rounded-2xl border border-charcoal/[0.08] bg-white shadow-sm overflow-hidden"
    >
      <div className="px-5 sm:px-6 py-4 border-b border-charcoal/[0.08] bg-cream/20">
        <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
          Intelligence inventory bands
        </p>
        <p className="mt-1 text-sm text-slate max-w-3xl">
          Value, Mid-market, and Luxury ranges plus fine steps for Intelligence
          inventory charts. Luxury defaults: $1M steps ($4–10M), $5M steps
          ($10M+). Stored in Postgres (
          <span className="font-mono text-[11px]">
            intel_inventory_segment_bands
          </span>
          ). Rebuild Stats cache after saving.
        </p>
      </div>

      <div className="px-5 sm:px-6 py-4 space-y-4">
        {loading ? (
          <p className="font-mono text-[11px] text-charcoal/45">Loading…</p>
        ) : null}
        {error ? (
          <p className="text-sm text-coral">{error}</p>
        ) : null}
        {notice ? (
          <p className="text-sm text-sage">{notice}</p>
        ) : null}

        {draft && segment ? (
          <>
            <div
              role="tablist"
              aria-label="Inventory segments"
              className="flex flex-wrap gap-1 border-b border-charcoal/[0.1]"
            >
              {INVENTORY_SEGMENT_IDS.map((id) => {
                const row = draft.segments.find((s) => s.id === id)!;
                const active = activeSegment === id;
                return (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setActiveSegment(id)}
                    className={`-mb-px border-b-2 px-3 py-2 font-mono text-[10px] tracking-[0.14em] uppercase ${
                      active
                        ? "border-gold text-navy"
                        : "border-transparent text-charcoal/50 hover:text-navy"
                    }`}
                  >
                    {row.label}
                  </button>
                );
              })}
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block text-xs text-charcoal/60">
                Label
                <input
                  type="text"
                  value={segment.label}
                  onChange={(e) =>
                    patchSegment(activeSegment, { label: e.target.value })
                  }
                  className="mt-1 w-full rounded border border-charcoal/15 bg-cream/30 px-2 py-1.5 font-mono text-[12px] text-navy"
                />
              </label>
              <label className="block text-xs text-charcoal/60">
                Range min
                <input
                  type="number"
                  value={segment.min}
                  onChange={(e) =>
                    patchSegment(activeSegment, {
                      min: Number(e.target.value) || 0,
                    })
                  }
                  className="mt-1 w-full rounded border border-charcoal/15 bg-cream/30 px-2 py-1.5 font-mono text-[12px] text-navy"
                />
              </label>
              <label className="block text-xs text-charcoal/60">
                Range max (blank = open)
                <input
                  type="number"
                  value={segment.max ?? ""}
                  onChange={(e) => {
                    const v = e.target.value.trim();
                    patchSegment(activeSegment, {
                      max: v === "" ? null : Number(v) || 0,
                    });
                  }}
                  className="mt-1 w-full rounded border border-charcoal/15 bg-cream/30 px-2 py-1.5 font-mono text-[12px] text-navy"
                />
              </label>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-left">
                <thead>
                  <tr className="font-mono text-[10px] tracking-[0.12em] uppercase text-charcoal/45">
                    <th className="py-2 pr-2">Label</th>
                    <th className="py-2 pr-2">Min</th>
                    <th className="py-2 pr-2">Max</th>
                    <th className="py-2 pr-2">Preview</th>
                    <th className="py-2"> </th>
                  </tr>
                </thead>
                <tbody>
                  {segment.steps.map((step, index) => (
                    <tr
                      key={`${step.id}-${index}`}
                      className="border-t border-charcoal/[0.06]"
                    >
                      <td className="py-2 pr-2">
                        <input
                          type="text"
                          value={step.label}
                          onChange={(e) =>
                            patchStep(activeSegment, index, {
                              label: e.target.value,
                            })
                          }
                          className="w-full min-w-[7rem] rounded border border-charcoal/15 bg-cream/30 px-2 py-1 font-mono text-[11px]"
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <input
                          type="number"
                          value={step.min}
                          onChange={(e) =>
                            patchStep(activeSegment, index, {
                              min: Number(e.target.value) || 0,
                            })
                          }
                          className="w-28 rounded border border-charcoal/15 bg-cream/30 px-2 py-1 font-mono text-[11px]"
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <input
                          type="number"
                          value={step.max ?? ""}
                          onChange={(e) => {
                            const v = e.target.value.trim();
                            patchStep(activeSegment, index, {
                              max: v === "" ? null : Number(v) || 0,
                            });
                          }}
                          className="w-28 rounded border border-charcoal/15 bg-cream/30 px-2 py-1 font-mono text-[11px]"
                          placeholder="open"
                        />
                      </td>
                      <td className="py-2 pr-2 font-mono text-[11px] text-charcoal/55 whitespace-nowrap">
                        {bandRangeLabel(step)}
                      </td>
                      <td className="py-2">
                        <button
                          type="button"
                          onClick={() => removeStep(activeSegment, index)}
                          disabled={segment.steps.length <= 1}
                          className="font-mono text-[10px] uppercase tracking-wide text-coral/80 hover:text-coral disabled:opacity-30"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => addStep(activeSegment)}
                className="rounded-full border border-navy/20 bg-white px-3 py-1.5 font-mono text-[10px] tracking-[0.12em] uppercase text-navy hover:bg-cream/80"
              >
                Add step
              </button>
              <button
                type="button"
                onClick={() => void save()}
                disabled={!dirty || saving}
                className="rounded-full border border-gold/40 bg-gold/15 px-3 py-1.5 font-mono text-[10px] tracking-[0.12em] uppercase text-navy hover:bg-gold/25 disabled:opacity-40"
              >
                {saving ? "Saving…" : "Save to Postgres"}
              </button>
              <button
                type="button"
                onClick={resetToDefault}
                disabled={isDefault && !dirty}
                className="rounded-full border border-charcoal/15 px-3 py-1.5 font-mono text-[10px] tracking-[0.12em] uppercase text-charcoal/60 hover:bg-cream/60 disabled:opacity-40"
              >
                Reset defaults
              </button>
              {dirty ? (
                <span className="font-mono text-[10px] uppercase tracking-wide text-coral">
                  Unsaved changes
                </span>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
