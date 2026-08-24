"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

export type AdminListingAlertRow = {
  id: string;
  email: string | null;
  visitorId?: string | null;
  criteriaLabel: string;
  criteriaFingerprint?: string;
  cadence: "immediate" | "daily" | "weekly";
  cadenceLabel: string;
  channel: "email" | "sms";
  active: boolean;
  lastNotifiedAt: string | null;
  createdAt: string;
  isDuplicate?: boolean;
};

type UserGroup = {
  key: string;
  email: string;
  alerts: AdminListingAlertRow[];
  activeCount: number;
  duplicateCount: number;
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

function userKey(email: string | null): string {
  const trimmed = email?.trim().toLowerCase() ?? "";
  return trimmed || "(no email)";
}

function groupAlerts(alerts: AdminListingAlertRow[]): UserGroup[] {
  const map = new Map<string, AdminListingAlertRow[]>();
  for (const alert of alerts) {
    const key = userKey(alert.email);
    const list = map.get(key);
    if (list) list.push(alert);
    else map.set(key, [alert]);
  }
  const groups: UserGroup[] = [];
  for (const [key, rows] of map) {
    rows.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    groups.push({
      key,
      email: key,
      alerts: rows,
      activeCount: rows.filter((r) => r.active).length,
      duplicateCount: rows.filter((r) => r.isDuplicate).length,
    });
  }
  groups.sort((a, b) => {
    const aDup = a.duplicateCount > 0 ? 0 : 1;
    const bDup = b.duplicateCount > 0 ? 0 : 1;
    if (aDup !== bDup) return aDup - bDup;
    return a.email.localeCompare(b.email);
  });
  return groups;
}

/**
 * End-user listing alerts from /latest → saved_search_alerts.
 * Manage: activate / disable / delete; grouped by email with duplicate flags.
 */
export default function AdminListingAlertsPanel({
  initial,
}: {
  initial?: AdminListingAlertRow[];
}) {
  const [alerts, setAlerts] = useState<AdminListingAlertRow[]>(initial ?? []);
  const [loading, setLoading] = useState(!initial);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const groups = useMemo(() => groupAlerts(alerts), [alerts]);
  const duplicateTotal = useMemo(
    () => alerts.filter((a) => a.isDuplicate).length,
    [alerts],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/saved-search-alerts?limit=200", {
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

  async function processDue() {
    setProcessing(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/saved-search-alerts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const raw = await res.text();
      let body: {
        ok?: boolean;
        error?: string;
        checked?: number;
        sent?: number;
        listings?: number;
        alerts?: AdminListingAlertRow[];
      };
      try {
        body = JSON.parse(raw);
      } catch {
        setError(
          `Process failed — server returned HTTP ${res.status} instead of JSON.`,
        );
        return;
      }
      if (!res.ok || !body.ok) {
        setError(body.error ?? `Process failed (HTTP ${res.status})`);
        return;
      }
      if (body.alerts) setAlerts(body.alerts);
      const sent = body.sent ?? 0;
      const listings = body.listings ?? 0;
      setMessage(
        sent > 0
          ? `Sent ${sent} alert${sent === 1 ? "" : "s"} · ${listings} listing${listings === 1 ? "" : "s"} (checked ${body.checked ?? 0})`
          : `No new matches to send (checked ${body.checked ?? 0} active alert${(body.checked ?? 0) === 1 ? "" : "s"})`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Process failed");
    } finally {
      setProcessing(false);
    }
  }

  function toggleUser(key: string) {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function setActive(id: string, active: boolean) {
    setBusyId(id);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/saved-search-alerts", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, active }),
      });
      const body = (await res.json()) as {
        alerts?: AdminListingAlertRow[];
        error?: string;
      };
      if (!res.ok) {
        setError(body.error ?? "Update failed");
        return;
      }
      if (body.alerts) setAlerts(body.alerts);
      setMessage(active ? "Alert activated" : "Alert disabled");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusyId(null);
    }
  }

  async function removeAlert(id: string, label: string) {
    if (
      !window.confirm(
        `Delete this listing alert?\n\n${label}\n\nThis cannot be undone.`,
      )
    ) {
      return;
    }
    setBusyId(id);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/saved-search-alerts", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const body = (await res.json()) as {
        alerts?: AdminListingAlertRow[];
        error?: string;
      };
      if (!res.ok) {
        setError(body.error ?? "Delete failed");
        return;
      }
      if (body.alerts) setAlerts(body.alerts);
      else setAlerts((prev) => prev.filter((a) => a.id !== id));
      setMessage("Alert deleted");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusyId(null);
    }
  }

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
            End-user alerts from Latest (Neon{" "}
            <span className="font-mono text-[11px]">saved_search_alerts</span>
            ). Grouped by email — expand to activate, disable, or delete.
            Duplicates = same email + same search criteria. Last notified
            updates when a digest actually goes out — Process now catches up
            missed daily/weekly windows.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void processDue()}
            disabled={processing || loading}
            className="font-mono text-[10px] tracking-[0.12em] uppercase rounded-full px-3 py-1.5 border border-gold/40 text-navy bg-gold/10 hover:bg-gold/20 disabled:opacity-40 disabled:pointer-events-none"
          >
            {processing ? "Processing…" : "Process now"}
          </button>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading || processing}
            className="bg-transparent p-0 m-0 border-0 cursor-pointer font-mono text-[11px] tracking-[0.12em] uppercase text-navy underline decoration-navy/25 underline-offset-2 hover:text-gold hover:decoration-gold/50 transition-colors disabled:opacity-40"
          >
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
      </div>

      {error ? (
        <p className="px-5 sm:px-6 py-3 text-sm text-coral border-b border-charcoal/[0.06]">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="px-5 sm:px-6 py-3 font-mono text-[11px] text-sage border-b border-charcoal/[0.06]">
          {message}
        </p>
      ) : null}

      <div className="overflow-x-auto">
        {loading && alerts.length === 0 ? (
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
          <div className="divide-y divide-charcoal/[0.06]">
            {groups.map((group) => {
              const open = expanded[group.key] === true;
              return (
                <div key={group.key}>
                  <button
                    type="button"
                    onClick={() => toggleUser(group.key)}
                    className="flex w-full items-center gap-3 px-4 sm:px-5 py-3 text-left hover:bg-cream/40 transition-colors"
                    aria-expanded={open}
                  >
                    <span
                      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border border-charcoal/15 font-mono text-[13px] text-navy"
                      aria-hidden
                    >
                      {open ? "−" : "+"}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="font-mono text-[12px] text-navy break-all">
                        {group.email}
                      </span>
                      <span className="ml-2 font-mono text-[10px] tracking-[0.1em] uppercase text-charcoal/45">
                        {group.alerts.length} alert
                        {group.alerts.length === 1 ? "" : "s"}
                        {" · "}
                        {group.activeCount} active
                      </span>
                    </span>
                    {group.duplicateCount > 0 ? (
                      <span className="shrink-0 rounded-full border border-coral/35 bg-coral/10 px-2 py-0.5 font-mono text-[9px] tracking-[0.12em] uppercase text-coral">
                        {group.duplicateCount} duplicate
                        {group.duplicateCount === 1 ? "" : "s"}
                      </span>
                    ) : null}
                  </button>

                  {open ? (
                    <div className="border-t border-charcoal/[0.05] bg-cream/15">
                      <table className="w-full min-w-[52rem] text-left">
                        <thead>
                          <tr className="border-b border-charcoal/[0.06] font-mono text-[10px] tracking-[0.12em] uppercase text-charcoal/45">
                            <th className="px-4 sm:px-5 py-2 font-normal">
                              Criteria
                            </th>
                            <th className="px-3 py-2 font-normal">Cadence</th>
                            <th className="px-3 py-2 font-normal">Created</th>
                            <th className="px-3 py-2 font-normal">
                              Last notified
                            </th>
                            <th className="px-3 py-2 font-normal">Status</th>
                            <th className="px-4 sm:px-5 py-2 font-normal text-right">
                              Actions
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-charcoal/[0.05]">
                          {group.alerts.map((row) => {
                            const busy = busyId === row.id;
                            return (
                              <tr key={row.id} className="align-top text-sm">
                                <td className="px-4 sm:px-5 py-3 text-charcoal/75 max-w-[18rem]">
                                  <div className="flex flex-wrap items-start gap-2">
                                    <span>{row.criteriaLabel}</span>
                                    {row.isDuplicate ? (
                                      <span className="shrink-0 rounded-full border border-coral/35 bg-coral/10 px-1.5 py-0.5 font-mono text-[8px] tracking-[0.12em] uppercase text-coral">
                                        Duplicate
                                      </span>
                                    ) : null}
                                  </div>
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
                                <td className="px-3 py-3">
                                  <span
                                    className={`font-mono text-[10px] tracking-[0.12em] uppercase ${
                                      row.active
                                        ? "text-sage"
                                        : "text-charcoal/40"
                                    }`}
                                  >
                                    {row.active ? "Active" : "Off"}
                                  </span>
                                </td>
                                <td className="px-4 sm:px-5 py-3">
                                  <div className="flex flex-wrap items-center justify-end gap-2">
                                    {row.active ? (
                                      <button
                                        type="button"
                                        disabled={busy}
                                        onClick={() =>
                                          void setActive(row.id, false)
                                        }
                                        className="font-mono text-[10px] tracking-[0.12em] uppercase rounded-full px-3 py-1.5 border border-charcoal/20 text-charcoal/70 hover:border-navy/40 hover:text-navy disabled:opacity-40"
                                      >
                                        Disable
                                      </button>
                                    ) : (
                                      <button
                                        type="button"
                                        disabled={busy}
                                        onClick={() =>
                                          void setActive(row.id, true)
                                        }
                                        className="font-mono text-[10px] tracking-[0.12em] uppercase rounded-full px-3 py-1.5 border border-sage/40 text-sage bg-sage/10 hover:bg-sage/20 disabled:opacity-40"
                                      >
                                        Activate
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      disabled={busy}
                                      onClick={() =>
                                        void removeAlert(
                                          row.id,
                                          `${group.email} · ${row.criteriaLabel}`,
                                        )
                                      }
                                      className="font-mono text-[10px] tracking-[0.12em] uppercase rounded-full px-3 py-1.5 border border-coral/35 text-coral hover:bg-coral/10 disabled:opacity-40"
                                    >
                                      Delete
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
      {alerts.length > 0 ? (
        <div className="px-5 sm:px-6 py-2.5 border-t border-charcoal/[0.06] bg-cream/20 font-mono text-[10px] tracking-[0.1em] uppercase text-charcoal/40 flex flex-wrap gap-x-3 gap-y-1">
          <span>
            {alerts.length} alert{alerts.length === 1 ? "" : "s"} ·{" "}
            {groups.length} user{groups.length === 1 ? "" : "s"}
          </span>
          {duplicateTotal > 0 ? (
            <span className="text-coral">
              {duplicateTotal} in duplicate set
              {duplicateTotal === 1 ? "" : "s"}
            </span>
          ) : (
            <span>No duplicates</span>
          )}
        </div>
      ) : null}
    </div>
  );
}
