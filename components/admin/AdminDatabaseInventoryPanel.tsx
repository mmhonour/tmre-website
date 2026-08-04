"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import type { AdminDatabaseSyncStats } from "@/lib/admin-sync-types";
import { formatBytes } from "@/lib/sqlite-schema-diagram-types";

const TH =
  "px-3 py-2.5 text-left font-mono text-[10px] tracking-[0.12em] uppercase text-charcoal/50 border-b border-r";
const TD = "px-3 py-3 align-top border-b border-r";

type TableActivity = {
  table: string;
  timestampColumn: string | null;
  upsertedLast60m: number | null;
  lastUpdated: string | null;
};

type TableSample = {
  table: string;
  timestampColumn: string | null;
  orderBy?: {
    column: string;
    direction: "desc";
    source: "preferred" | "timestamp" | "identity";
  } | null;
  columns: string[];
  rows: Record<string, unknown>[];
  limit: number;
};

function sampleOrderLabel(sample: TableSample): string {
  const col = sample.orderBy?.column ?? sample.timestampColumn;
  if (!col) return " · unordered (no timestamp or identity column)";
  const via =
    sample.orderBy?.source === "identity"
      ? "identity"
      : sample.orderBy?.source === "timestamp"
        ? "timestamp"
        : null;
  return via
    ? ` · newest by ${col} DESC (${via})`
    : ` · newest by ${col} DESC`;
}

function parseActivityMs(iso: string | null | undefined): number {
  if (!iso) return NaN;
  const direct = Date.parse(iso);
  if (!Number.isNaN(direct)) return direct;
  // Tolerate Postgres-style "YYYY-MM-DD HH:MM:SS+00" if any slip through.
  const spaced = iso.includes("T") ? iso : iso.trim().replace(" ", "T");
  const withColonTz = spaced.replace(/([+-]\d{2})$/, "$1:00");
  for (const candidate of [spaced, withColonTz]) {
    const ms = Date.parse(candidate);
    if (!Number.isNaN(ms)) return ms;
  }
  return NaN;
}

function formatLastUpdated(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = parseActivityMs(iso);
  if (Number.isNaN(t)) return iso;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(t));
}

function formatCell(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function newestActivityIso(
  activity: Record<string, TableActivity>,
): string | null {
  let best: string | null = null;
  let bestMs = -1;
  for (const row of Object.values(activity)) {
    if (!row.lastUpdated) continue;
    const ms = parseActivityMs(row.lastUpdated);
    if (!Number.isNaN(ms) && ms > bestMs) {
      bestMs = ms;
      best = row.lastUpdated;
    }
  }
  return best;
}

export default function AdminDatabaseInventoryPanel({
  initial,
  initialActivity = {},
}: {
  initial: AdminDatabaseSyncStats[];
  initialActivity?: Record<string, TableActivity>;
}) {
  const [databaseStats, setDatabaseStats] = useState(initial);
  const [activity, setActivity] =
    useState<Record<string, TableActivity>>(initialActivity);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [samples, setSamples] = useState<Record<string, TableSample>>({});
  const [sampleLoading, setSampleLoading] = useState<Record<string, boolean>>(
    {},
  );
  const [sampleError, setSampleError] = useState<Record<string, string>>({});

  const loadSample = useCallback(async (table: string) => {
    setSampleLoading((prev) => ({ ...prev, [table]: true }));
    setSampleError((prev) => {
      const next = { ...prev };
      delete next[table];
      return next;
    });
    try {
      const params = new URLSearchParams({ table, limit: "100" });
      const res = await fetch(
        `/api/admin/inventory-table-rows?${params.toString()}`,
        { cache: "no-store" },
      );
      const body = (await res.json()) as {
        sample?: TableSample;
        error?: string;
      };
      if (!res.ok || !body.sample) {
        setSampleError((prev) => ({
          ...prev,
          [table]: body.error ?? `HTTP ${res.status}`,
        }));
        return;
      }
      setSamples((prev) => ({ ...prev, [table]: body.sample! }));
    } catch (err) {
      setSampleError((prev) => ({
        ...prev,
        [table]: err instanceof Error ? err.message : "Failed to load rows",
      }));
    } finally {
      setSampleLoading((prev) => ({ ...prev, [table]: false }));
    }
  }, []);

  const toggleExpand = useCallback(
    (table: string) => {
      const opening = !expanded.has(table);
      setExpanded((prev) => {
        const next = new Set(prev);
        if (opening) next.add(table);
        else next.delete(table);
        return next;
      });
      if (opening && !samples[table] && !sampleLoading[table]) {
        void loadSample(table);
      }
    },
    [expanded, loadSample, sampleLoading, samples],
  );

  const loadActivity = useCallback(async (): Promise<boolean> => {
    const activityRes = await fetch("/api/admin/inventory-table-activity", {
      cache: "no-store",
    });
    const activityBody = (await activityRes.json()) as {
      activity?: Record<string, TableActivity>;
      error?: string;
    };
    if (!activityRes.ok) {
      setError(
        activityBody.error ??
          `Last updated failed (HTTP ${activityRes.status})`,
      );
      return false;
    }
    setActivity(activityBody.activity ?? {});
    return true;
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const [syncRes, activityOk] = await Promise.all([
        fetch("/api/admin/sync", { cache: "no-store" }),
        loadActivity(),
      ]);
      const syncBody = (await syncRes.json()) as {
        databaseStats?: AdminDatabaseSyncStats[];
        error?: string;
      };
      if (!syncRes.ok) {
        setError(syncBody.error ?? `Refresh failed (HTTP ${syncRes.status})`);
        return;
      }
      if (syncBody.databaseStats) setDatabaseStats(syncBody.databaseStats);
      if (!activityOk && syncRes.ok) {
        /* loadActivity already set error */
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refresh failed");
    } finally {
      setRefreshing(false);
    }
  }, [loadActivity]);

  // Populate last-updated / 60m upserts once if SSR missed them (no polling).
  useEffect(() => {
    if (Object.keys(initialActivity).length > 0) return;
    void loadActivity();
  }, [initialActivity, loadActivity]);

  const neonTables = useMemo(() => {
    const neon = databaseStats.find((db) => db.id === "listings");
    const fromStats = neon?.tables ?? [];
    if (fromStats.length > 0) {
      return [...fromStats].sort((a, b) => a.table.localeCompare(b.table));
    }
    return Object.keys(activity)
      .sort((a, b) => a.localeCompare(b))
      .map((table) => ({
        table,
        rowCount: 0,
      }));
  }, [databaseStats, activity]);

  const dbLastUpdated = newestActivityIso(activity);

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
            Connected stores and Neon table activity. Last updated and upserts
            in the last 60 minutes load with the page (Refresh to reload).{" "}
            <span className="font-mono text-[11px]">+</span> /{" "}
            <span className="font-mono text-[11px]">−</span> loads up to 100
            newest rows on demand.
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
        <table className="w-full min-w-[820px] border-collapse">
          <thead>
            <tr>
              <th className={`${TH} border-charcoal/[0.08]`}>Database</th>
              <th className={`${TH} border-charcoal/[0.08]`}>Location</th>
              <th className={`${TH} border-charcoal/[0.08]`}>Rows</th>
              <th className={`${TH} border-charcoal/[0.08] border-r-0`}>
                Last updated
              </th>
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
                <td className={`${TD} border-charcoal/[0.06]`}>
                  <p className="text-sm leading-snug text-slate">{db.summary}</p>
                </td>
                <td className={`${TD} border-charcoal/[0.06] border-r-0`}>
                  <p className="font-mono text-[11px] tabular-nums text-charcoal/65">
                    {db.id === "listings"
                      ? formatLastUpdated(dbLastUpdated)
                      : "—"}
                  </p>
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

      {neonTables.length > 0 ? (
        <div className="border-t border-charcoal/[0.08] px-5 py-4 sm:px-6">
          <p className="mb-3 font-mono text-[10px] tracking-[0.16em] uppercase text-charcoal/45">
            Neon tables
            {Object.keys(activity).length === 0
              ? " · loading last updated…"
              : ""}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left">
              <thead>
                <tr className="bg-cream/40">
                  <th className="px-2 py-2 font-mono text-[9px] tracking-[0.14em] uppercase text-charcoal/40 w-8">
                    Rows
                  </th>
                  <th className="px-3 py-2 font-mono text-[9px] tracking-[0.14em] uppercase text-charcoal/40">
                    Table
                  </th>
                  <th className="px-3 py-2 font-mono text-[9px] tracking-[0.14em] uppercase text-charcoal/40 text-right">
                    Total
                  </th>
                  <th className="px-3 py-2 font-mono text-[9px] tracking-[0.14em] uppercase text-charcoal/40 text-right">
                    Upserted 60m
                  </th>
                  <th className="px-3 py-2 font-mono text-[9px] tracking-[0.14em] uppercase text-charcoal/40 text-right">
                    Last updated
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-charcoal/[0.04]">
                {neonTables.map((row) => {
                  const act = activity[row.table];
                  const upserted = act?.upsertedLast60m ?? null;
                  const lastUpdated = act?.lastUpdated ?? null;
                  const isOpen = expanded.has(row.table);
                  const sample = samples[row.table];
                  return (
                    <Fragment key={row.table}>
                      <tr>
                        <td className="px-2 py-2">
                          <button
                            type="button"
                            onClick={() => toggleExpand(row.table)}
                            className="inline-flex h-6 w-6 items-center justify-center rounded border border-charcoal/15 font-mono text-[12px] leading-none text-navy hover:border-navy/40 hover:bg-cream/50"
                            aria-expanded={isOpen}
                            aria-label={
                              isOpen
                                ? `Hide sample rows for ${row.table}`
                                : `Show sample rows for ${row.table}`
                            }
                            title={
                              isOpen
                                ? "Hide sample rows"
                                : "Show up to 100 newest rows"
                            }
                          >
                            {isOpen ? "−" : "+"}
                          </button>
                        </td>
                        <td className="px-3 py-2 font-mono text-[11px] text-navy">
                          {row.table}
                        </td>
                        <td className="px-3 py-2 font-mono text-[11px] tabular-nums text-right text-charcoal/70">
                          {row.rowCount.toLocaleString()}
                        </td>
                        <td
                          className={`px-3 py-2 font-mono text-[11px] tabular-nums text-right ${
                            upserted != null && upserted > 0
                              ? "text-navy font-semibold"
                              : "text-charcoal/45"
                          }`}
                          title={
                            act?.timestampColumn
                              ? `COUNT where ${act.timestampColumn} ≥ now() − 60 minutes`
                              : Object.keys(activity).length === 0
                                ? "Refresh to load"
                                : "No timestamp column"
                          }
                        >
                          {Object.keys(activity).length === 0
                            ? "—"
                            : upserted == null
                              ? "—"
                              : upserted.toLocaleString()}
                        </td>
                        <td
                          className="px-3 py-2 font-mono text-[11px] tabular-nums text-right text-charcoal/60"
                          title={lastUpdated ?? undefined}
                        >
                          {formatLastUpdated(lastUpdated)}
                        </td>
                      </tr>
                      {isOpen ? (
                        <tr className="bg-cream/[0.35]">
                          <td colSpan={5} className="px-3 py-3">
                            {sampleLoading[row.table] ? (
                              <p className="font-mono text-[10px] text-charcoal/50">
                                Loading up to 100 rows…
                              </p>
                            ) : sampleError[row.table] ? (
                              <p className="font-mono text-[10px] text-coral">
                                {sampleError[row.table]}
                              </p>
                            ) : sample ? (
                              <div className="space-y-2">
                                <p className="font-mono text-[9px] tracking-[0.12em] uppercase text-charcoal/45">
                                  {sample.rows.length.toLocaleString()} row
                                  {sample.rows.length === 1 ? "" : "s"}
                                  {sampleOrderLabel(sample)}
                                </p>
                                <div className="max-h-[28rem] overflow-auto rounded-lg border border-charcoal/[0.08] bg-white">
                                  <table className="w-full border-collapse text-left min-w-max">
                                    <thead className="sticky top-0 bg-cream/90">
                                      <tr>
                                        {sample.columns.map((col) => (
                                          <th
                                            key={col}
                                            className="px-2.5 py-1.5 font-mono text-[9px] tracking-[0.1em] uppercase text-charcoal/45 border-b border-charcoal/[0.08] whitespace-nowrap"
                                          >
                                            {col}
                                          </th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {sample.rows.length === 0 ? (
                                        <tr>
                                          <td
                                            colSpan={Math.max(
                                              sample.columns.length,
                                              1,
                                            )}
                                            className="px-2.5 py-4 font-mono text-[10px] text-charcoal/45"
                                          >
                                            Table is empty.
                                          </td>
                                        </tr>
                                      ) : (
                                        sample.rows.map((sampleRow, idx) => (
                                          <tr
                                            key={`${row.table}-r-${idx}`}
                                            className="border-b border-charcoal/[0.04] last:border-0"
                                          >
                                            {sample.columns.map((col) => (
                                              <td
                                                key={col}
                                                className="px-2.5 py-1 font-mono text-[10px] text-charcoal/70 max-w-[16rem] truncate"
                                                title={formatCell(sampleRow[col])}
                                              >
                                                {formatCell(sampleRow[col])}
                                              </td>
                                            ))}
                                          </tr>
                                        ))
                                      )}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            ) : (
                              <p className="font-mono text-[10px] text-charcoal/45">
                                No rows loaded yet.
                              </p>
                            )}
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
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
