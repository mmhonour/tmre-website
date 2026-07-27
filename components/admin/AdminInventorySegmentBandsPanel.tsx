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

type EditorTab = "all" | InventorySegmentId;

type FlatStepRow = {
  stepId: string;
  segmentId: InventorySegmentId;
  step: PriceBucketDef;
};

const SEGMENT_TAB_LABEL: Record<InventorySegmentId, string> = {
  value: "Value",
  mid: "Mid-market",
  luxury: "Luxury",
  discount: "Discount",
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

function syncSegmentExtents(segment: InventorySegmentDef): InventorySegmentDef {
  if (segment.steps.length === 0) return segment;
  const min = Math.min(...segment.steps.map((s) => s.min));
  const hasOpen = segment.steps.some((s) => s.max == null);
  const max = hasOpen
    ? null
    : Math.max(...segment.steps.map((s) => s.max as number));
  return { ...segment, min, max };
}

function sortSteps(steps: PriceBucketDef[]): PriceBucketDef[] {
  return [...steps].sort(
    (a, b) =>
      a.min - b.min ||
      (a.max ?? Number.POSITIVE_INFINITY) -
        (b.max ?? Number.POSITIVE_INFINITY) ||
      a.id.localeCompare(b.id),
  );
}

/**
 * Admin editor for Market Bands (Value / Mid-market / Luxury / Discount)
 * stored in Postgres sync_meta. All-bands tab assigns each step via pick list.
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
  const [activeTab, setActiveTab] = useState<EditorTab>("all");

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

  const activeSegmentId: InventorySegmentId | null =
    activeTab === "all" ? null : activeTab;

  const segment: InventorySegmentDef | null = useMemo(() => {
    if (!draft || !activeSegmentId) return null;
    return draft.segments.find((s) => s.id === activeSegmentId) ?? null;
  }, [draft, activeSegmentId]);

  const allRows: FlatStepRow[] = useMemo(() => {
    if (!draft) return [];
    const rows: FlatStepRow[] = [];
    for (const s of draft.segments) {
      for (const step of s.steps) {
        rows.push({ stepId: step.id, segmentId: s.id, step });
      }
    }
    return rows.sort(
      (a, b) =>
        a.step.min - b.step.min ||
        (a.step.max ?? Number.POSITIVE_INFINITY) -
          (b.step.max ?? Number.POSITIVE_INFINITY) ||
        a.stepId.localeCompare(b.stepId),
    );
  }, [draft]);

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

  function patchStepById(stepId: string, patch: Partial<PriceBucketDef>) {
    setDraft((prev) => {
      if (!prev) return prev;
      return {
        segments: prev.segments.map((s) => ({
          ...s,
          steps: s.steps.map((b) => {
            if (b.id !== stepId) return b;
            const next = { ...b, ...patch };
            if (patch.hidden === false) delete next.hidden;
            return next;
          }),
        })),
      };
    });
  }

  function moveStepToSegment(stepId: string, toSegment: InventorySegmentId) {
    setDraft((prev) => {
      if (!prev) return prev;
      let moving: PriceBucketDef | null = null;
      const stripped = prev.segments.map((s) => {
        const keep = s.steps.filter((b) => {
          if (b.id !== stepId) return true;
          moving = { ...b };
          return false;
        });
        return { ...s, steps: keep };
      });
      if (!moving) return prev;

      const nextSegments = stripped.map((s) => {
        if (s.id !== toSegment) return syncSegmentExtents(s);
        const steps = sortSteps([...s.steps, moving!]);
        return syncSegmentExtents({ ...s, steps });
      });

      // Ensure every segment still has ≥1 step (validation requires it).
      for (const s of nextSegments) {
        if (s.steps.length === 0) return prev;
      }
      return { segments: nextSegments };
    });
  }

  function addStep(segmentId: InventorySegmentId) {
    setDraft((prev) => {
      if (!prev) return prev;
      return {
        segments: prev.segments.map((s) => {
          if (s.id !== segmentId) return s;
          const used = new Set(
            prev.segments.flatMap((seg) => seg.steps.map((b) => b.id)),
          );
          const last = s.steps[s.steps.length - 1];
          const min =
            last?.max != null ? last.max + 1 : (last?.min ?? s.min) + 1_000_000;
          const label = `New step ${s.steps.length + 1}`;
          const id = suggestSegmentStepId(label, used);
          const steps = sortSteps([
            ...s.steps,
            { id, label, min, max: min + 999_999 },
          ]);
          return syncSegmentExtents({ ...s, steps });
        }),
      };
    });
  }

  function removeStepById(stepId: string) {
    setDraft((prev) => {
      if (!prev) return prev;
      const owner = prev.segments.find((s) =>
        s.steps.some((b) => b.id === stepId),
      );
      if (!owner || owner.steps.length <= 1) return prev;
      return {
        segments: prev.segments.map((s) => {
          if (s.id !== owner.id) return s;
          const steps = s.steps.filter((b) => b.id !== stepId);
          return syncSegmentExtents({ ...s, steps });
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
        "Reset Value, Mid-market, Luxury, and Discount ranges/steps to code defaults?",
      )
    ) {
      return;
    }
    setDraft(cloneInventorySegmentBandsConfig(defaults));
  }

  const stepEditorRows: FlatStepRow[] =
    activeTab === "all"
      ? allRows
      : segment
        ? segment.steps.map((step) => ({
            stepId: step.id,
            segmentId: segment.id,
            step,
          }))
        : [];

  return (
    <div
      id="admin-inventory-segment-bands"
      className="scroll-mt-24 rounded-2xl border border-charcoal/[0.08] bg-white shadow-sm overflow-hidden"
    >
      <div className="px-5 sm:px-6 py-4 border-b border-charcoal/[0.08] bg-cream/20">
        <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
          Market Bands
        </p>
        <p className="mt-1 text-sm text-slate max-w-3xl">
          Value, Mid-market, Luxury, and Discount ranges plus fine steps for
          Intelligence inventory charts. Use the{" "}
          <span className="font-medium text-navy">All bands</span> tab to see
          every step and assign a band with the Segment pick list. Stored in
          Postgres (
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
        {error ? <p className="text-sm text-coral">{error}</p> : null}
        {notice ? <p className="text-sm text-sage">{notice}</p> : null}

        {draft ? (
          <>
            <div
              role="tablist"
              aria-label="Inventory segment bands"
              className="flex flex-wrap gap-1 border-b border-charcoal/[0.1]"
            >
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "all"}
                onClick={() => setActiveTab("all")}
                className={`-mb-px border-b-2 px-3 py-2 font-mono text-[10px] tracking-[0.14em] uppercase ${
                  activeTab === "all"
                    ? "border-gold text-navy"
                    : "border-transparent text-charcoal/50 hover:text-navy"
                }`}
              >
                All bands
              </button>
              {INVENTORY_SEGMENT_IDS.map((id) => {
                const row = draft.segments.find((s) => s.id === id)!;
                const active = activeTab === id;
                return (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setActiveTab(id)}
                    className={`-mb-px border-b-2 px-3 py-2 font-mono text-[10px] tracking-[0.14em] uppercase ${
                      active
                        ? "border-gold text-navy"
                        : "border-transparent text-charcoal/50 hover:text-navy"
                    }`}
                  >
                    {row.label}
                    <span className="ml-1.5 tabular-nums text-charcoal/35">
                      ({row.steps.length})
                    </span>
                  </button>
                );
              })}
            </div>

            {activeTab === "all" ? (
              <p className="text-xs text-charcoal/55 leading-snug max-w-3xl">
                Every inventory step across segments. Change the{" "}
                <span className="font-medium text-navy">Segment</span> pick list
                to associate a band with Value, Mid-market, or Luxury — range
                floors/ceilings update from the steps in each segment.
              </p>
            ) : segment ? (
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="block text-xs text-charcoal/60">
                  Label
                  <input
                    type="text"
                    value={segment.label}
                    onChange={(e) =>
                      patchSegment(segment.id, { label: e.target.value })
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
                      patchSegment(segment.id, {
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
                      patchSegment(segment.id, {
                        max: v === "" ? null : Number(v) || 0,
                      });
                    }}
                    className="mt-1 w-full rounded border border-charcoal/15 bg-cream/30 px-2 py-1.5 font-mono text-[12px] text-navy"
                  />
                </label>
              </div>
            ) : null}

            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-left">
                <thead>
                  <tr className="font-mono text-[10px] tracking-[0.12em] uppercase text-charcoal/45">
                    <th className="py-2 pr-2">Label</th>
                    <th className="py-2 pr-2">Min</th>
                    <th className="py-2 pr-2">Max</th>
                    <th className="py-2 pr-2">Preview</th>
                    <th className="py-2 pr-2">Segment</th>
                    <th className="py-2"> </th>
                  </tr>
                </thead>
                <tbody>
                  {stepEditorRows.map((row) => {
                    const owner = draft.segments.find(
                      (s) => s.id === row.segmentId,
                    );
                    const canDelete = (owner?.steps.length ?? 0) > 1;
                    return (
                      <tr
                        key={row.stepId}
                        className="border-t border-charcoal/[0.06]"
                      >
                        <td className="py-2 pr-2">
                          <input
                            type="text"
                            value={row.step.label}
                            onChange={(e) =>
                              patchStepById(row.stepId, {
                                label: e.target.value,
                              })
                            }
                            className="w-full min-w-[7rem] rounded border border-charcoal/15 bg-cream/30 px-2 py-1 font-mono text-[11px]"
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <input
                            type="number"
                            value={row.step.min}
                            onChange={(e) =>
                              patchStepById(row.stepId, {
                                min: Number(e.target.value) || 0,
                              })
                            }
                            className="w-28 rounded border border-charcoal/15 bg-cream/30 px-2 py-1 font-mono text-[11px]"
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <input
                            type="number"
                            value={row.step.max ?? ""}
                            onChange={(e) => {
                              const v = e.target.value.trim();
                              patchStepById(row.stepId, {
                                max: v === "" ? null : Number(v) || 0,
                              });
                            }}
                            className="w-28 rounded border border-charcoal/15 bg-cream/30 px-2 py-1 font-mono text-[11px]"
                            placeholder="open"
                          />
                        </td>
                        <td className="py-2 pr-2 font-mono text-[11px] text-charcoal/55 whitespace-nowrap">
                          {bandRangeLabel(row.step)}
                        </td>
                        <td className="py-2 pr-2">
                          <select
                            value={row.segmentId}
                            onChange={(e) =>
                              moveStepToSegment(
                                row.stepId,
                                e.target.value as InventorySegmentId,
                              )
                            }
                            aria-label={`Segment for ${row.step.label}`}
                            className="min-w-[8.5rem] rounded border border-charcoal/15 bg-cream/30 px-2 py-1 font-mono text-[11px] text-navy"
                          >
                            {INVENTORY_SEGMENT_IDS.map((id) => (
                              <option key={id} value={id}>
                                {draft.segments.find((s) => s.id === id)
                                  ?.label ?? SEGMENT_TAB_LABEL[id]}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2">
                          <button
                            type="button"
                            onClick={() => removeStepById(row.stepId)}
                            disabled={!canDelete}
                            className="font-mono text-[10px] uppercase tracking-wide text-coral/80 hover:text-coral disabled:opacity-30"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              {activeTab === "all" ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-mono text-[10px] uppercase tracking-wide text-charcoal/45">
                    Add step to
                  </span>
                  {INVENTORY_SEGMENT_IDS.map((id) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => addStep(id)}
                      className="rounded-full border border-navy/20 bg-white px-3 py-1.5 font-mono text-[10px] tracking-[0.12em] uppercase text-navy hover:bg-cream/80"
                    >
                      {SEGMENT_TAB_LABEL[id]}
                    </button>
                  ))}
                </div>
              ) : activeSegmentId ? (
                <button
                  type="button"
                  onClick={() => addStep(activeSegmentId)}
                  className="rounded-full border border-navy/20 bg-white px-3 py-1.5 font-mono text-[10px] tracking-[0.12em] uppercase text-navy hover:bg-cream/80"
                >
                  Add step
                </button>
              ) : null}
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
