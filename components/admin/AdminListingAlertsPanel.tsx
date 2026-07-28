"use client";

import { useCallback, useEffect, useState } from "react";

export type AdminListingAlertRow = {
  id: string;
  email: string | null;
  criteriaLabel: string;
  cadence: "immediate" | "daily" | "weekly";
  cadenceLabel: string;
  channel: "email" | "sms";
  active: boolean;
  lastNotifiedAt: string | null;
  createdAt: string;
};

function fmtWhen(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * End-user listing alerts from /latest → saved_search_alerts.
 */
export default function AdminListingAlertsPanel({
  initial,
}: {
  initial?: AdminListingAlertRow[];
}) {
  const [alerts, setAlerts] = useState<AdminListingAlertRow[]>(initial ?? []);
  const [loading, setLoading] = useState(!initial);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/saved-search-alerts?limit=100", {
        cache: "no-store",
      });
      const body = (await res.json()) as {
        alerts?: AdminListingAlertRow[];
        error?: string;
      };
      if (!res.ok) {
        setError(body.error ?? "Could not load alerts");
        return;
      }
      setAlerts(body.alerts ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load alerts");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initial) return;
    void load();
  }, [initial, load]);

  return (
    <div
      id="admin-listing-alerts"
      className="scroll-mt-24 rounded-2xl border border-charcoal/[0.08] bg-white shadow-sm overflow-hidden"
    >
      <div className="px-5 sm:px-6 py-4 border-b border-charcoal/[0.08] bg-cream/40 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
            Listing alerts
          </p>
          <p className="mt-1 text-sm text-slate max-w-3xl">
            End-user alerts created from the Latest page (Neon{" "}
            <span className="font-mono text-[11px]">saved_search_alerts</span>
            ). Newest first.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="shrink-0 bg-transparent p-0 m-0 border-0 cursor-pointer font-mono text-[11px] tracking-[0.12em] uppercase text-navy underline decoration-navy/25 underline-offset-2 hover:text-gold hover:decoration-gold/50 transition-colors disabled:opacity-40"
        >
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      <div className="overflow-x-auto">
        {error ? (
          <p className="px-5 sm:px-6 py-8 text-sm text-coral">{error}</p>
        ) : loading && alerts.length === 0 ? (
          <p className="px-5 sm:px-6 py-8 font-mono text-[11px] text-charcoal/45">
            Loading alerts…
          </p>
        ) : alerts.length === 0 ? (
          <p className="px-5 sm:px-6 py-8 text-sm text-slate">
            No listing alerts yet. Visitors create them from{" "}
            <a
              href="/latest#latest-alerts"
              className="text-navy underline underline-offset-2"
            >
              Latest → Listing alerts
            </a>
            .
          </p>
        ) : (
          <table className="w-full min-w-[44rem] text-left">
            <thead>
              <tr className="border-b border-charcoal/[0.08] bg-cream/30 font-mono text-[10px] tracking-[0.12em] uppercase text-charcoal/45">
                <th className="px-4 sm:px-5 py-2.5 font-normal">Email</th>
                <th className="px-3 py-2.5 font-normal">Criteria</th>
                <th className="px-3 py-2.5 font-normal">Cadence</th>
                <th className="px-3 py-2.5 font-normal">Created</th>
                <th className="px-3 py-2.5 font-normal">Last notified</th>
                <th className="px-4 sm:px-5 py-2.5 font-normal">Active</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-charcoal/[0.06]">
              {alerts.map((row) => (
                <tr key={row.id} className="align-top text-sm">
                  <td className="px-4 sm:px-5 py-3 font-mono text-[12px] text-navy break-all">
                    {row.email ?? "—"}
                  </td>
                  <td className="px-3 py-3 text-charcoal/75 max-w-[16rem]">
                    {row.criteriaLabel}
                  </td>
                  <td className="px-3 py-3 font-mono text-[11px] text-charcoal/65 whitespace-nowrap">
                    {row.cadenceLabel}
                  </td>
                  <td className="px-3 py-3 font-mono text-[11px] text-charcoal/55 whitespace-nowrap">
                    {fmtWhen(row.createdAt)}
                  </td>
                  <td className="px-3 py-3 font-mono text-[11px] text-charcoal/55 whitespace-nowrap">
                    {fmtWhen(row.lastNotifiedAt)}
                  </td>
                  <td className="px-4 sm:px-5 py-3">
                    <span
                      className={`font-mono text-[10px] tracking-[0.12em] uppercase ${
                        row.active ? "text-sage" : "text-charcoal/40"
                      }`}
                    >
                      {row.active ? "Active" : "Off"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {alerts.length > 0 ? (
        <div className="px-5 sm:px-6 py-2.5 border-t border-charcoal/[0.06] bg-cream/20 font-mono text-[10px] tracking-[0.1em] uppercase text-charcoal/40">
          {alerts.length} alert{alerts.length === 1 ? "" : "s"}
        </div>
      ) : null}
    </div>
  );
}
