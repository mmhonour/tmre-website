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
 * Postgres sync_meta overrides). Bands can be hidden from charts or deleted.
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
  /** Compact list vs full editor. */
  const [editing, setEditing] = useState(false);
  /** Storage location details — off until asked. */
  const [showStorage, setShowStorage] = useState(false);
  /** Include hidden bands in the compact view. */
  const [showHidden, setShowHidden] = useState(false);

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

  const hiddenCount = draft?.sale.filter((b) => b.hidden).length ?? 0;
  const visibleCount = (draft?.sale.length ?? 0) - hiddenCount;

  const listedBands = useMemo(() => {
    if (!draft) return [] as { band: PriceBucketDef; index: number }[];
    return draft.sale
      .map((band, index) => ({ band, index }))
      .filter(({ band }) => showHidden || !band.hidden);
  }, [draft, showHidden]);

  function patchBand(index: number, patch: Partial<PriceBucketDef>) {
    setDraft((prev) => {
      if (!prev) return prev;
      const sale = prev.sale.map((b, i) => {
        if (i !== index) return b;
        const next = { ...b, ...patch };
        if (patch.hidden === false) delete next.hidden;
        return next;
      });
      return { sale };
    });
  }

  function setBandVisible(index: number, visible: boolean) {
    patchBand(index, { hidden: visible ? false : true });
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
    setEditing(true);
  }

  function removeBand(index: number) {
    setDraft((prev) => {
      if (!prev || prev.sale.length <= 1) return prev;
      const target = prev.sale[index];
      if (!target) return prev;
      const visibleLeft = prev.sale.filter(
        (b, i) => i !== index && !b.hidden,
      ).length;
      if (visibleLeft < 1 && !target.hidden) {
        setError("Keep at least one visible band, or hide instead of delete.");
        return prev;
      }
      return { sale: prev.sale.filter((_, i) => i !== index) };
    });
  }

  function confirmRemoveBand(index: number, label: string) {
    if (
      !window.confirm(
        `Delete band “${label}”? This removes it from the catalog. Hide it instead if you may want it later.`,
      )
    ) {
      return;
    }
    setError(null);
    removeBand(index);
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
    setError(null);
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
            and Intelligence{" "}
            <span className="font-medium text-navy">inventory by price</span>{" "}
            mini chart (sale mode). The Intelligence{" "}
            <span className="font-medium text-navy">luxury inventory</span>{" "}
            mini chart keys off the top 3 visible bands by price and counts
            actives in $1M steps ($4–10M) and $5M steps ($10M+). Hide a band to
            keep it without showing it on charts, or delete it. Rent bands stay
            in{" "}
            <span className="font-mono text-[11px]">lib/rent-buckets.ts</span>.
            After saving, run{" "}
            <span className="font-mono text-[11px]">stats cache</span> rebuild
            on Syncs → Sync configure.
          </p>
          <div className="mt-2">
            <button
              type="button"
              onClick={() => setShowStorage((v) => !v)}
              className="font-mono text-[10px] tracking-[0.12em] uppercase text-navy/70 underline decoration-navy/25 underline-offset-2 hover:text-navy hover:decoration-gold"
              aria-expanded={showStorage}
            >
              {showStorage ? "Hide where stored" : "Show where stored"}
            </button>
            {showStorage ? (
              <dl className="mt-2 grid gap-1 font-mono text-[10px] leading-snug text-slate/80 sm:grid-cols-[auto_1fr] sm:gap-x-3">
                <dt className="uppercase tracking-[0.12em] text-charcoal/45">
                  Stored in
                </dt>
                <dd>
                  Postgres{" "}
                  <span className="text-navy">sync_meta</span> key{" "}
                  <span className="text-navy">stats_sale_price_buckets</span>
                  {" "}
                  (
                  <span className="text-charcoal/70">
                    lib/price-buckets-config.ts
                  </span>
                  )
                </dd>
                <dt className="uppercase tracking-[0.12em] text-charcoal/45">
                  Defaults
                </dt>
                <dd>
                  <span className="text-charcoal/70">
                    lib/price-buckets-shared.ts
                  </span>{" "}
                  when sync_meta is empty
                </dd>
                <dt className="uppercase tracking-[0.12em] text-charcoal/45">
                  Inventory cache
                </dt>
                <dd>
                  <span className="text-navy">stats_cache</span>{" "}
                  <span className="text-charcoal/70">
                    active-by-price:{"{town|All}"}:{"{sale|rental}"}
                  </span>
                  {" · "}
                  closed sales{" "}
                  <span className="text-charcoal/70">
                    sales-by-price:{"{town|All}"}:{"{sale|rental}"}
                  </span>
                </dd>
              </dl>
            ) : null}
          </div>
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
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-mono text-[10px] tracking-[0.14em] uppercase text-charcoal/45">
                {visibleCount} on charts
                {hiddenCount > 0 ? ` · ${hiddenCount} hidden` : ""}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {hiddenCount > 0 ? (
                  <button
                    type="button"
                    onClick={() => setShowHidden((v) => !v)}
                    className="rounded-lg border border-charcoal/15 px-3 py-1.5 font-mono text-[10px] tracking-[0.14em] uppercase text-charcoal/70 hover:bg-cream/60"
                  >
                    {showHidden ? "Hide hidden bands" : "Show hidden bands"}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setEditing((v) => !v)}
                  className="rounded-lg border border-navy/20 bg-white px-3 py-1.5 font-mono text-[10px] tracking-[0.14em] uppercase text-navy hover:bg-cream/60"
                >
                  {editing ? "Done editing" : "Edit bands"}
                </button>
              </div>
            </div>

            {!editing ? (
              <ul className="divide-y divide-charcoal/[0.08] rounded-xl border border-charcoal/[0.1] overflow-hidden">
                {listedBands.length === 0 ? (
                  <li className="px-4 py-3 text-sm text-charcoal/55">
                    No bands to show.{" "}
                    {hiddenCount > 0
                      ? "Turn on “Show hidden bands”."
                      : "Add a band to get started."}
                  </li>
                ) : (
                  listedBands.map(({ band, index }) => (
                    <li
                      key={`${band.id}-${index}`}
                      className={`flex flex-wrap items-center gap-3 px-4 py-3 ${
                        band.hidden ? "bg-charcoal/[0.03]" : "bg-white"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <p
                          className={`text-sm ${
                            band.hidden
                              ? "text-charcoal/45 line-through"
                              : "text-navy"
                          }`}
                        >
                          {band.label}
                        </p>
                        <p className="mt-0.5 font-mono text-[10px] text-charcoal/45">
                          {band.id} · {bandRangeLabel(band)}
                          {band.hidden ? " · hidden from charts" : ""}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            setBandVisible(index, Boolean(band.hidden))
                          }
                          className="rounded-lg border border-charcoal/15 px-2.5 py-1 font-mono text-[10px] tracking-[0.12em] uppercase text-navy hover:bg-cream/60"
                        >
                          {band.hidden ? "Show on charts" : "Hide"}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            confirmRemoveBand(index, band.label)
                          }
                          disabled={draft.sale.length <= 1}
                          className="rounded-lg border border-coral/25 px-2.5 py-1 font-mono text-[10px] tracking-[0.12em] uppercase text-coral hover:bg-coral/5 disabled:opacity-30"
                        >
                          Delete
                        </button>
                      </div>
                    </li>
                  ))
                )}
              </ul>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-charcoal/[0.08]">
                <table className="w-full min-w-[780px] border-collapse text-sm">
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
                          "Charts",
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
                        className={`border-b border-charcoal/[0.06] last:border-0 ${
                          band.hidden ? "bg-charcoal/[0.03]" : ""
                        }`}
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
                        <td className="px-3 py-2">
                          <label className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-navy cursor-pointer">
                            <input
                              type="checkbox"
                              checked={!band.hidden}
                              onChange={(e) =>
                                setBandVisible(index, e.target.checked)
                              }
                              className="rounded border-charcoal/30"
                            />
                            Show
                          </label>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            onClick={() =>
                              confirmRemoveBand(index, band.label)
                            }
                            disabled={draft.sale.length <= 1}
                            className="font-mono text-[10px] uppercase tracking-[0.1em] text-coral/80 hover:text-coral disabled:opacity-30"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <p className="text-xs text-slate/70 max-w-2xl">
              Hide keeps the band in this catalog but drops it from charts until
              you show it again. Delete removes it permanently. Leave Max empty
              for an open-ended top band (e.g. $10M+). Changing ids breaks
              deep-links that used the old bucket id until charts are rebuilt.
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
