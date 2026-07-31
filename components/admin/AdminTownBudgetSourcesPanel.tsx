"use client";

import { useEffect, useMemo, useState } from "react";
import {
  budgetFetchYearOptions,
  currentBudgetFetchYear,
  DEFAULT_TOWN_BUDGET_SOURCES,
  type TownBudgetSourceSlot,
  type TownBudgetSourcesConfig,
} from "@/lib/town-budget-sources-shared";

type Payload = TownBudgetSourcesConfig & {
  default: TownBudgetSourcesConfig;
};

/**
 * Admin slots for town budget source URLs (one per TMRE town).
 * Save links + fetch year now; parse / sync logic connects later.
 */
export default function AdminTownBudgetSourcesPanel({
  initial,
}: {
  initial?: TownBudgetSourcesConfig;
}) {
  const thisYear = currentBudgetFetchYear();
  const yearOptions = useMemo(() => budgetFetchYearOptions(), []);

  const [slots, setSlots] = useState<TownBudgetSourceSlot[]>(
    initial?.slots ?? DEFAULT_TOWN_BUDGET_SOURCES.slots,
  );
  const [baseline, setBaseline] = useState<TownBudgetSourceSlot[]>(
    initial?.slots ?? DEFAULT_TOWN_BUDGET_SOURCES.slots,
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
        setMessage(body.error ?? "Save failed");
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
          Seven slots — one per TMRE town. Paste the official budget page or
          document URL and choose the year to fetch (defaults to {thisYear}).
          Save here now; Sync will pull and parse later.
        </p>
      </div>
      <div className="px-5 sm:px-6 py-4 space-y-5">
        {slots.map((row, index) => (
          <div
            key={row.town}
            className="rounded-xl border border-charcoal/[0.08] bg-cream/20 px-4 py-3 space-y-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-mono text-[11px] tracking-[0.16em] uppercase text-navy">
                {row.town}
              </p>
              <button
                type="button"
                onClick={() => stubSync(row.town)}
                disabled={!row.sourceUrl.trim()}
                className="font-mono text-[10px] tracking-[0.12em] uppercase rounded-full px-3 py-1.5 border border-navy/25 text-navy bg-white hover:bg-cream disabled:opacity-40 disabled:pointer-events-none transition-colors"
              >
                Sync
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,8.5rem)_minmax(0,1fr)]">
              <label className="flex flex-col gap-1">
                <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-charcoal/50">
                  Year
                </span>
                <select
                  value={row.year}
                  onChange={(e) =>
                    update(index, { year: Number(e.target.value) })
                  }
                  className="w-full rounded-lg border border-charcoal/15 px-3 py-2 font-mono text-sm text-navy bg-white focus:border-navy focus:outline-none"
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
              </label>
              <label className="flex flex-col gap-1">
                <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-charcoal/50">
                  Source URL
                </span>
                <input
                  type="url"
                  value={row.sourceUrl}
                  onChange={(e) =>
                    update(index, { sourceUrl: e.target.value })
                  }
                  className="w-full rounded-lg border border-charcoal/15 px-3 py-2 font-mono text-sm text-navy focus:border-navy focus:outline-none"
                  placeholder="https://town.gov/…/budget"
                />
              </label>
            </div>
            <label className="flex flex-col gap-1">
              <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-charcoal/50">
                Notes
              </span>
              <input
                type="text"
                value={row.notes}
                onChange={(e) => update(index, { notes: e.target.value })}
                className="w-full rounded-lg border border-charcoal/15 px-3 py-2 text-sm text-navy focus:border-navy focus:outline-none"
                placeholder="FY label, PDF vs HTML, etc."
              />
            </label>
          </div>
        ))}

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || !dirty}
            className="font-mono text-[10px] tracking-[0.12em] uppercase rounded-full px-4 py-2 border border-navy/30 text-navy bg-cream/40 hover:bg-cream disabled:opacity-40 disabled:pointer-events-none transition-colors"
          >
            {saving ? "Saving…" : "Save sources"}
          </button>
          <button
            type="button"
            onClick={() => stubSync()}
            className="font-mono text-[10px] tracking-[0.12em] uppercase rounded-full px-4 py-2 border border-charcoal/20 text-charcoal/70 bg-white hover:bg-cream transition-colors"
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
    </div>
  );
}
