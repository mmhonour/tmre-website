"use client";

import { useCallback, useState } from "react";
import type { AdminDatabaseSyncStats } from "@/lib/admin-sync-types";
import { formatBytes } from "@/lib/sqlite-schema-diagram-types";

const TH =
  "px-3 py-2.5 text-left font-mono text-[10px] tracking-[0.12em] uppercase text-charcoal/50 border-b border-r";
const TD = "px-3 py-3 align-top border-b border-r";

export default function AdminDatabaseInventoryPanel({
  initial,
}: {
  initial: AdminDatabaseSyncStats[];
}) {
  const [databaseStats, setDatabaseStats] = useState(initial);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/sync", { cache: "no-store" });
      const body = (await res.json()) as {
        databaseStats?: AdminDatabaseSyncStats[];
        error?: string;
      };
      if (!res.ok) {
        setError(body.error ?? `Refresh failed (HTTP ${res.status})`);
        return;
      }
      if (body.databaseStats) setDatabaseStats(body.databaseStats);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refresh failed");
    } finally {
      setRefreshing(false);
    }
  }, []);

  return (
    <div
      id="admin-database-inventory"
      className="scroll-mt-24 overflow-hidden rounded-2xl border border-charcoal/[0.08] bg-white shadow-sm shadow-charcoal/[0.04]"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-charcoal/[0.08] bg-cream/40 px-5 py-4 sm:px-6">
        <div>
          <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
            Database inventory
          </p>
          <p className="mt-1 max-w-2xl text-sm text-charcoal/65">
            Connected stores, paths/sizes, and row summaries for the listings
            databases used by sync.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={refreshing}
          className="shrink-0 rounded-full border border-charcoal/15 px-4 py-2 font-mono text-[10px] tracking-[0.12em] uppercase text-charcoal/60 transition-colors hover:border-charcoal/30 hover:text-navy disabled:opacity-40"
        >
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {error ? (
        <p className="border-b border-charcoal/[0.08] px-5 py-2 font-mono text-[10px] text-coral sm:px-6">
          {error}
        </p>
      ) : null}

      <div className="overflow-x-auto px-5 py-4 sm:px-6">
        <table className="w-full min-w-[720px] border-collapse">
          <thead>
            <tr>
              <th className={`${TH} border-charcoal/[0.08]`}>Database</th>
              <th className={`${TH} border-charcoal/[0.08]`}>Location</th>
              <th className={`${TH} border-charcoal/[0.08] border-r-0`}>Rows</th>
            </tr>
          </thead>
          <tbody>
            {databaseStats.map((db, index) => (
              <tr
                key={db.id}
                className={index % 2 === 1 ? "bg-cream/[0.18]" : "bg-white"}
              >
                <td className={`${TD} border-charcoal/[0.06]`}>
                  <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-navy">
                    {db.label}
                  </p>
                  <p className="mt-0.5 font-mono text-[10px] text-charcoal/45">
                    {db.available ? "Connected" : "Unavailable"}
                  </p>
                </td>
                <td className={`${TD} border-charcoal/[0.06]`}>
                  <p
                    className="break-all font-mono text-[11px] text-slate"
                    title={db.path}
                  >
                    {db.path}
                  </p>
                  <p className="mt-0.5 font-mono text-[10px] tabular-nums text-charcoal/45">
                    {formatBytes(db.sizeBytes)}
                    {db.exists ? "" : " · missing"}
                  </p>
                  {db.error ? (
                    <p className="mt-1 font-mono text-[10px] leading-snug text-coral">
                      {db.error}
                    </p>
                  ) : null}
                </td>
                <td className={`${TD} border-charcoal/[0.06] border-r-0`}>
                  <p className="text-sm leading-snug text-slate">{db.summary}</p>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {databaseStats.length === 0 ? (
          <p className="py-6 text-sm text-charcoal/55">
            No database inventory available yet.
          </p>
        ) : null}
      </div>
    </div>
  );
}
