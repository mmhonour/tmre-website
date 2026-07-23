"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  clonePriceBucketsConfig,
  suggestPriceBucketId,
  type PriceBucketDef,
  type PriceBucketsConfig,
} from "@/lib/price-buckets-shared";

type ApiPayload = {
  config: PriceBucketsConfig;
  default: PriceBucketsConfig;
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
 * Admin editor for Stats → Sales by price bands (lib/price-buckets defaults +
 * Postgres sync_meta overrides).
 */
export default function AdminPriceBucketsPanel() {
  const [saved, setSaved] = useState<PriceBucketsConfig | null>(null);
  const [draft, setDraft] = useState<PriceBucketsConfig | null>(null);
  const [defaults, setDefaults] = useState<PriceBucketsConfig | null>(null);
  const [isDefault, setIsDefault] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const applyPayload = useCallback((body: ApiPayload) => {
    setSaved(clonePriceBucketsConfig(body.config));
    setDraft(clonePriceBucketsConfig(body.config));
    setDefaults(clonePriceBucketsConfig(body.default));
    setIsDefault(body.isDefault);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/price-buckets", { cache: "no-store" });
      const body = (await res.json()) as ApiPayload;
      if (!res.ok) {
        setError(body.error ?? "Failed to load price bands");
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
    return JSON.stringify(draft.sale) !== JSON.stringify(saved.sale);
  }, [draft, saved]);

  function patchBand(index: number, patch: Partial<PriceBucketDef>) {
    setDraft((prev) => {
      if (!prev) return prev;
      const sale = prev.sale.map((b, i) =>
        i === index ? { ...b, ...patch } : b,
      );
      return { sale };
    });
  }

  function addBand() {
    setDraft((prev) => {
      if (!prev) return prev;
      const used = new Set(prev.sale.map((b) => b.id));
      const last = prev.sale[prev.sale.length - 1];
      const min = last?.max != null ? last.max + 1 : (last?.min ?? 0) + 1_000_000;
      const label = last?.max == null ? "New band" : `Up to ${fmtMoney(min + 999_999)}`;
      const id = suggestPriceBucketId(label, used);
      return {
        sale: [
          ...prev.sale,
          { id, label, min, max: min + 999_999 },
        ],
      };
    });
  }

  function removeBand(index: number) {
    setDraft((prev) => {
      if (!prev || prev.sale.length <= 1) return prev;
      return { sale: prev.sale.filter((_, i) => i !== index) };
    });
  }

  function moveBand(index: number, dir: -1 | 1) {
    setDraft((prev) => {
      if (!prev) return prev;
      const j = index + dir;
      if (j < 0 || j >= prev.sale.length) return prev;
      const sale = [...prev.sale];
      const tmp = sale[index]!;
      sale[index] = sale[j]!;
      sale[j] = tmp;
      return { sale };
    });
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/price-buckets", {
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
          "Saved. Rebuild Stats cache so Sales by price charts use the new bands.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function resetDraftToDefault() {
    if (!defaults) return;
    setDraft(clonePriceBucketsConfig(defaults));
    setNotice(null);
  }

  function revertDraft() {
    if (!saved) return;
    setDraft(clonePriceBucketsConfig(saved));
    setNotice(null);
  }

  return (
    <div
      id="admin-stats-price-buckets"
      className="scroll-mt-24 rounded-2xl border border-charcoal/[0.08] bg-white shadow-sm overflow-hidden"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3 px-5 sm:px-6 py-4 border-b border-charcoal/[0.08] bg-cream/20">
        <div className="min-w-0">
          <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
            Sales by price bands
          </p>
          <p className="mt-1 text-sm text-slate max-w-2xl">
            Catalog for the Stats{" "}
            <span className="font-medium text-navy">Sales by price</span> chart
            (sale mode). Not shown elsewhere on Admin until this panel — rent
            bands stay in code. After saving, run{" "}
            <span className="font-mono text-[11px]">stats cache</span> rebuild
            on Database → Sync.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {!isDefault ? (
            <span className="rounded-full border border-gold/35 bg-gold/10 px-2.5 py-1 font-mono text-[9px] tracking-[0.12em] uppercase text-gold">
              Custom
            </span>
          ) : (
            <span className="rounded-full border border-charcoal/15 bg-cream px-2.5 py-1 font-mono text-[9px] tracking-[0.12em] uppercase text-charcoal/50">
              Defaults
            </span>
          )}
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading || saving}
            className="rounded-lg border border-charcoal/15 bg-cream/40 px-3 py-1.5 font-mono text-[10px] tracking-[0.14em] uppercase text-navy hover:bg-cream disabled:opacity-50"
          >
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
      </div>

      <div className="px-5 sm:px-6 py-4 space-y-4">
        {error ? (
          <p className="font-mono text-[11px] text-coral">{error}</p>
        ) : null}
        {notice ? (
          <p className="rounded-lg border border-sage/30 bg-sage/[0.08] px-3 py-2 text-sm text-navy">
            {notice}
          </p>
        ) : null}

        {loading && !draft ? (
          <p className="text-sm text-slate/70">Loading price bands…</p>
        ) : draft ? (
          <>
            <div className="overflow-x-auto rounded-xl border border-charcoal/[0.08]">
              <table className="w-full min-w-[720px] border-collapse text-sm">
                <thead>
                  <tr className="bg-cream/40">
                    {(
                      [
                        "Order",
                        "Id",
                        "Label",
                        "Min $",
                        "Max $",
                        "Range",
                        "",
                      ] as const
                    ).map((h) => (
                      <th
                        key={h || "actions"}
                        className="px-3 py-2 text-left font-mono text-[10px] tracking-[0.12em] uppercase text-charcoal/45 border-b border-charcoal/[0.08]"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {draft.sale.map((band, index) => (
                    <tr
                      key={`${band.id}-${index}`}
                      className="border-b border-charcoal/[0.06] last:border-0"
                    >
                      <td className="px-3 py-2 whitespace-nowrap">
                        <div className="flex gap-1">
                          <button
                            type="button"
                            aria-label="Move up"
                            disabled={index === 0}
                            onClick={() => moveBand(index, -1)}
                            className="rounded border border-charcoal/15 px-1.5 py-0.5 font-mono text-[10px] disabled:opacity-30"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            aria-label="Move down"
                            disabled={index === draft.sale.length - 1}
                            onClick={() => moveBand(index, 1)}
                            className="rounded border border-charcoal/15 px-1.5 py-0.5 font-mono text-[10px] disabled:opacity-30"
                          >
                            ↓
                          </button>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          value={band.id}
                          onChange={(e) =>
                            patchBand(index, {
                              id: e.target.value.toLowerCase().trim(),
                            })
                          }
                          className="w-28 rounded border border-charcoal/15 bg-white px-2 py-1 font-mono text-[11px] text-navy"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          value={band.label}
                          onChange={(e) =>
                            patchBand(index, { label: e.target.value })
                          }
                          className="w-40 rounded border border-charcoal/15 bg-white px-2 py-1 text-[13px] text-navy"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min={0}
                          step={1000}
                          value={band.min}
                          onChange={(e) =>
                            patchBand(index, {
                              min: Number(e.target.value) || 0,
                            })
                          }
                          className="w-28 rounded border border-charcoal/15 bg-white px-2 py-1 font-mono text-[12px] tabular-nums"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min={0}
                          step={1000}
                          placeholder="open"
                          value={band.max ?? ""}
                          onChange={(e) => {
                            const raw = e.target.value.trim();
                            patchBand(index, {
                              max: raw === "" ? null : Number(raw) || 0,
                            });
                          }}
                          className="w-28 rounded border border-charcoal/15 bg-white px-2 py-1 font-mono text-[12px] tabular-nums"
                        />
                      </td>
                      <td className="px-3 py-2 font-mono text-[11px] text-charcoal/55 whitespace-nowrap">
                        {bandRangeLabel(band)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => removeBand(index)}
                          disabled={draft.sale.length <= 1}
                          className="font-mono text-[10px] uppercase tracking-[0.1em] text-coral/80 hover:text-coral disabled:opacity-30"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="text-xs text-slate/70 max-w-2xl">
              Leave Max empty for an open-ended top band (e.g. $10M+). Bands are
              sorted by min on save. Changing ids breaks deep-links that used the
              old bucket id until charts are rebuilt.
            </p>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={addBand}
                className="rounded-lg border border-navy/20 bg-white px-3 py-1.5 font-mono text-[10px] tracking-[0.14em] uppercase text-navy hover:bg-cream/60"
              >
                Add band
              </button>
              <button
                type="button"
                onClick={resetDraftToDefault}
                className="rounded-lg border border-charcoal/15 bg-cream/30 px-3 py-1.5 font-mono text-[10px] tracking-[0.14em] uppercase text-charcoal/70 hover:bg-cream"
              >
                Reset to code defaults
              </button>
              <button
                type="button"
                onClick={revertDraft}
                disabled={!dirty}
                className="rounded-lg border border-charcoal/15 px-3 py-1.5 font-mono text-[10px] tracking-[0.14em] uppercase text-charcoal/60 disabled:opacity-40"
              >
                Discard edits
              </button>
              <button
                type="button"
                onClick={() => void save()}
                disabled={saving || !dirty}
                className="rounded-lg bg-navy px-3 py-1.5 font-mono text-[10px] tracking-[0.14em] uppercase text-white hover:bg-navy/90 disabled:opacity-40"
              >
                {saving ? "Saving…" : "Save bands"}
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
