"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  StatsInventoryCategory,
  StatsInventoryEntry,
  StatsStorageMedium,
} from "@/lib/admin-stats-inventory";
import {
  statsInventoryKeyFieldLabel,
  statsInventoryPostgresTable,
} from "@/lib/admin-stats-inventory";
import { adminPostgresTableHref } from "@/lib/admin-nav";

type MediumMeta = Record<StatsStorageMedium, { label: string; short: string }>;

type LiveCounts = {
  measuredAt: string;
  byEntryId: Record<string, number | null>;
};

type InventoryResponse = {
  groups: { category: StatsInventoryCategory; entries: StatsInventoryEntry[] }[];
  mediums: MediumMeta;
  live: LiveCounts | null;
  error?: string;
};

const MEDIUM_PILL: Record<StatsStorageMedium, string> = {
  postgres: "border-sage/40 bg-sage/[0.12] text-sage",
  memory: "border-coral/35 bg-coral/[0.1] text-coral",
  file: "border-gold/40 bg-gold/[0.12] text-gold",
  r2: "border-navy/30 bg-navy/[0.08] text-navy",
  blobs: "border-charcoal/25 bg-charcoal/[0.06] text-charcoal/70",
  browser: "border-charcoal/20 bg-cream text-charcoal/60",
};

/**
 * Admin → Cookies → Ephemeral: memory / browser cache catalog (from stats inventory).
 */
export default function AdminEphemeralCachesPanel() {
  const [group, setGroup] = useState<{
    category: StatsInventoryCategory;
    entries: StatsInventoryEntry[];
  } | null>(null);
  const [mediums, setMediums] = useState<MediumMeta | null>(null);
  const [live, setLive] = useState<LiveCounts | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/stats-inventory", { cache: "no-store" });
      const body = (await res.json()) as InventoryResponse;
      if (!res.ok && !body.groups) {
        setError(body.error ?? "Failed to load ephemeral catalog");
        return;
      }
      const ephemeral = body.groups?.find((g) => g.category.id === "ephemeral");
      setGroup(ephemeral ?? null);
      setMediums(body.mediums ?? null);
      setLive(body.live);
      if (body.error) setError(body.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div id="admin-stats-ephemeral" className="scroll-mt-24 space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
            Ephemeral (memory / browser)
          </p>
          <p className="mt-1 text-sm text-slate max-w-2xl">
            Per-instance or client-only caches — not durable across deploys.
            Cookie prefs and the live jar live on the Cookies sub-tab.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="shrink-0 rounded-lg border border-charcoal/15 bg-cream/40 px-3 py-1.5 font-mono text-[10px] tracking-[0.14em] uppercase text-navy hover:bg-cream disabled:opacity-50"
        >
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {error ? <p className="text-sm text-coral">{error}</p> : null}

      {loading && !group ? (
        <p className="font-mono text-[11px] text-charcoal/45">Loading…</p>
      ) : null}

      {group ? (
        <div className="overflow-hidden rounded-2xl border border-charcoal/[0.08] bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left">
              <thead>
                <tr className="border-b border-charcoal/[0.08] font-mono text-[10px] tracking-[0.14em] uppercase text-charcoal/40">
                  <th className="px-5 sm:px-6 py-2.5 font-medium">Name</th>
                  <th className="px-3 py-2.5 font-medium">Stored in</th>
                  <th className="px-3 py-2.5 font-medium">Table</th>
                  <th className="px-3 py-2.5 font-medium">Key</th>
                  <th className="px-3 py-2.5 font-medium text-right">Rows</th>
                  <th className="px-5 sm:px-6 py-2.5 font-medium">Code</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-charcoal/[0.06]">
                {group.entries.map((entry) => {
                  const count = live?.byEntryId[entry.id];
                  const mediumLabel =
                    mediums?.[entry.medium]?.short ?? entry.medium;
                  const table = statsInventoryPostgresTable(entry);
                  const keyField = statsInventoryKeyFieldLabel(entry);
                  return (
                    <tr key={entry.id} className="align-top">
                      <td className="px-5 sm:px-6 py-3">
                        <p className="text-sm font-medium leading-snug text-navy">
                          {entry.name}
                        </p>
                        {entry.notes ? (
                          <p className="mt-1 max-w-xs text-xs leading-snug text-charcoal/50">
                            {entry.notes}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[10px] tracking-[0.12em] uppercase whitespace-nowrap ${MEDIUM_PILL[entry.medium]}`}
                        >
                          {mediumLabel}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        {table ? (
                          <a
                            href={adminPostgresTableHref(table)}
                            className="font-mono text-[11px] text-navy underline decoration-navy/25 underline-offset-2 hover:decoration-navy"
                            onClick={(e) => {
                              e.preventDefault();
                              const url = new URL(
                                adminPostgresTableHref(table),
                                window.location.origin,
                              );
                              window.history.pushState(
                                null,
                                "",
                                `${url.pathname}${url.search}${url.hash}`,
                              );
                              window.dispatchEvent(new PopStateEvent("popstate"));
                            }}
                          >
                            {table}
                          </a>
                        ) : (
                          <span className="font-mono text-[11px] text-charcoal/35">
                            —
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <p className="mb-0.5 font-mono text-[9px] tracking-[0.12em] uppercase text-charcoal/35">
                          {keyField}
                        </p>
                        <code className="break-all font-mono text-[11px] text-charcoal/70">
                          {entry.keyPattern}
                        </code>
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-sm tabular-nums text-navy">
                        {count == null ? "—" : count.toLocaleString()}
                      </td>
                      <td className="px-5 sm:px-6 py-3">
                        <code className="break-all font-mono text-[10px] text-charcoal/55">
                          {entry.owner}
                        </code>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
