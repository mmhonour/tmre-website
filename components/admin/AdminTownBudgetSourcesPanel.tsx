"use client";

import { useEffect, useMemo, useState } from "react";
import {
  budgetFetchYearOptions,
  currentBudgetFetchYear,
  emptyTownBudgetSources,
  type TownBudgetSourceSlot,
  type TownBudgetSourcesConfig,
} from "@/lib/town-budget-sources-shared";

type Payload = TownBudgetSourcesConfig & {
  default?: TownBudgetSourcesConfig;
};

/**
 * One row per CT coverage–enabled town: Town · Source URL · Year.
 * Save links now; parse / sync logic connects later.
 */
export default function AdminTownBudgetSourcesPanel({
  initial,
}: {
  initial?: TownBudgetSourcesConfig;
}) {
  const thisYear = currentBudgetFetchYear();
  const yearOptions = useMemo(() => budgetFetchYearOptions(), []);

  const [slots, setSlots] = useState<TownBudgetSourceSlot[]>(
    initial?.slots ?? emptyTownBudgetSources().slots,
  );
  const [baseline, setBaseline] = useState<TownBudgetSourceSlot[]>(
    initial?.slots ?? emptyTownBudgetSources().slots,
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  useEffect(() => {
    if (initial) return;
    let cancelled = false;
    fetch("/api/admin/town-budget-sources", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: Payload | null) => {
        if (cancelled || !body?.slots) return;
        setSlots(body.slots);
        setBaseline(body.slots);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [initial]);

  const update = (index: number, patch: Partial<TownBudgetSourceSlot>) => {
    setSlots((prev) =>
      prev.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  };

  const dirty = JSON.stringify(slots) !== JSON.stringify(baseline);

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/town-budget-sources", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slots }),
      });
      const body = (await res.json()) as Payload & {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok) {
        setMessage(
          (body as { error?: string }).error ?? "Save failed",
        );
        return;
      }
      setSlots(body.slots);
      setBaseline(body.slots);
      setMessage("Saved — source URLs ready for a future budget sync");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const stubSync = (town?: string) => {
    setSyncMessage(
      town
        ? `Sync for ${town} is not wired yet — parsing comes later.`
        : "Sync all is not wired yet — save URLs now; parsing comes later.",
    );
  };

  return (
    <div
      id="admin-town-budget-sources"
      className="scroll-mt-24 rounded-2xl border border-charcoal/[0.08] bg-white shadow-sm overflow-hidden"
    >
      <div className="px-5 sm:px-6 py-4 border-b border-charcoal/[0.08] bg-cream/40">
        <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
          Town budget sources
        </p>
        <p className="mt-1 text-sm text-slate max-w-3xl">
          One row per town enabled in CT coverage. Paste the official budget URL
          and choose the year (defaults to {thisYear}). Rows appear or disappear
          when you toggle towns under CT coverage.
        </p>
        <p className="mt-2 font-mono text-[10px] text-charcoal/45">
          {slots.length.toLocaleString()} enabled town
          {slots.length === 1 ? "" : "s"}
        </p>
      </div>

      <div className="overflow-x-auto">
        {slots.length === 0 ? (
          <p className="px-5 sm:px-6 py-6 text-sm text-slate/70">
            No towns enabled yet. Activate towns in{" "}
            <span className="font-mono text-xs text-navy">
              Data controls → CT coverage
            </span>
            , then return here.
          </p>
        ) : (
          <table className="w-full min-w-[640px] border-collapse">
            <thead>
              <tr className="bg-cream/30">
                <th className="px-4 py-2.5 text-left font-mono text-[10px] tracking-[0.14em] uppercase text-charcoal/40 border-b border-charcoal/[0.08]">
                  Town
                </th>
                <th className="px-4 py-2.5 text-left font-mono text-[10px] tracking-[0.14em] uppercase text-charcoal/40 border-b border-charcoal/[0.08]">
                  Source URL
                </th>
                <th className="px-4 py-2.5 text-left font-mono text-[10px] tracking-[0.14em] uppercase text-charcoal/40 border-b border-charcoal/[0.08] w-[8.5rem]">
                  Year
                </th>
                <th className="px-4 py-2.5 text-right font-mono text-[10px] tracking-[0.14em] uppercase text-charcoal/40 border-b border-charcoal/[0.08] w-[5.5rem]">
                  Sync
                </th>
              </tr>
            </thead>
            <tbody>
              {slots.map((row, index) => (
                <tr
                  key={row.town}
                  className={
                    index % 2 === 1 ? "bg-cream/[0.18]" : "bg-white"
                  }
                >
                  <td className="px-4 py-2.5 align-middle font-mono text-[12px] tracking-[0.06em] uppercase text-navy whitespace-nowrap">
                    {row.town}
                  </td>
                  <td className="px-4 py-2.5 align-middle">
                    <input
                      type="url"
                      value={row.sourceUrl}
                      onChange={(e) =>
                        update(index, { sourceUrl: e.target.value })
                      }
                      className="w-full min-w-[12rem] rounded-lg border border-charcoal/15 px-3 py-2 font-mono text-sm text-navy focus:border-navy focus:outline-none"
                      placeholder="https://town.gov/…/budget"
                      aria-label={`${row.town} source URL`}
                    />
                  </td>
                  <td className="px-4 py-2.5 align-middle">
                    <select
                      value={row.year}
                      onChange={(e) =>
                        update(index, { year: Number(e.target.value) })
                      }
                      className="w-full rounded-lg border border-charcoal/15 px-2 py-2 font-mono text-sm text-navy bg-white focus:border-navy focus:outline-none"
                      aria-label={`${row.town} year`}
                    >
                      {yearOptions.map((y) => (
                        <option key={y} value={y}>
                          {y === thisYear ? `${y} (this year)` : String(y)}
                        </option>
                      ))}
                      {!yearOptions.includes(row.year) ? (
                        <option value={row.year}>{row.year}</option>
                      ) : null}
                    </select>
                  </td>
                  <td className="px-4 py-2.5 align-middle text-right">
                    <button
                      type="button"
                      onClick={() => stubSync(row.town)}
                      disabled={!row.sourceUrl.trim()}
                      className="font-mono text-[10px] tracking-[0.12em] uppercase rounded-full px-3 py-1.5 border border-navy/25 text-navy bg-white hover:bg-cream disabled:opacity-40 disabled:pointer-events-none transition-colors"
                    >
                      Sync
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 px-5 sm:px-6 py-4 border-t border-charcoal/[0.06]">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || !dirty || slots.length === 0}
          className="font-mono text-[10px] tracking-[0.12em] uppercase rounded-full px-4 py-2 border border-navy/30 text-navy bg-cream/40 hover:bg-cream disabled:opacity-40 disabled:pointer-events-none transition-colors"
        >
          {saving ? "Saving…" : "Save sources"}
        </button>
        <button
          type="button"
          onClick={() => stubSync()}
          disabled={slots.length === 0}
          className="font-mono text-[10px] tracking-[0.12em] uppercase rounded-full px-4 py-2 border border-charcoal/20 text-charcoal/70 bg-white hover:bg-cream disabled:opacity-40 disabled:pointer-events-none transition-colors"
        >
          Sync all
        </button>
        {message ? (
          <p className="font-mono text-[10px] text-sage">{message}</p>
        ) : null}
        {syncMessage ? (
          <p className="font-mono text-[10px] text-charcoal/55">{syncMessage}</p>
        ) : null}
      </div>
    </div>
  );
}
