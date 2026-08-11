"use client";

import { Fragment, useCallback, useMemo, useState } from "react";
import type { InventorySnapshot } from "@/lib/db/listings-repo";

type RowStatus = "match" | "low" | "empty" | "missing" | "no-snapshot";

type SortKey =
  | "table"
  | "current"
  | "snapshot"
  | "delta"
  | "upserted60m"
  | "lastUpdated";

type SortDir = "asc" | "desc";

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

function rowStatus(current: number, ref: number | undefined): RowStatus {
  if (ref === undefined) return "no-snapshot";
  if (current === 0 && ref > 0) return "empty";
  if (ref === 0) return current === 0 ? "match" : "no-snapshot";
  const ratio = current / ref;
  if (ratio < 0.9) return "low";
  return "match";
}

function statusDot(s: RowStatus) {
  if (s === "match")
    return <span className="w-1.5 h-1.5 rounded-full bg-sage inline-block" />;
  if (s === "low")
    return <span className="w-1.5 h-1.5 rounded-full bg-gold inline-block" />;
  if (s === "empty")
    return (
      <span className="w-1.5 h-1.5 rounded-full bg-coral animate-pulse inline-block" />
    );
  return (
    <span className="w-1.5 h-1.5 rounded-full bg-charcoal/20 inline-block" />
  );
}

function formatLastUpdated(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
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
    return JSON.stringify(value, null, 0);
  } catch {
    return String(value);
  }
}

function SampleCell({ value }: { value: unknown }) {
  const text = formatCell(value);
  return (
    <td className="px-2.5 py-1 align-top font-mono text-[10px] text-charcoal/70 min-w-[8rem] max-w-[28rem]">
      <pre
        className="m-0 max-h-40 overflow-auto whitespace-pre-wrap break-all leading-snug"
        title={text.length > 500 ? text.slice(0, 2000) : text}
      >
        {text}
      </pre>
    </td>
  );
}

/**
 * Compares live Neon table row counts to the snapshot taken after the last
 * successful full resync. Also shows upserts in the last 60 minutes and
 * on-demand sample rows (+/−).
 */
export default function AdminInventoryComparisonPanel({
  initialSnapshot = null,
  initialLiveCounts = {},
  initialActivity = {},
}: {
  initialSnapshot?: InventorySnapshot | null;
  /** Exact COUNT(*) per table from admin page SSR (refreshes on full page load). */
  initialLiveCounts?: Record<string, number>;
  initialActivity?: Record<string, TableActivity>;
}) {
  const [open, setOpen] = useState(true);
  const [liveCounts, setLiveCounts] =
    useState<Record<string, number>>(initialLiveCounts);
  const [activity, setActivity] =
    useState<Record<string, TableActivity>>(initialActivity);
  const [snapshotCounts, setSnapshotCounts] = useState<Record<string, number>>(
    initialSnapshot?.counts ?? {},
  );
  const [capturedAt, setCapturedAt] = useState<string | null>(
    initialSnapshot?.capturedAt ?? null,
  );
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(
    Object.keys(initialLiveCounts).length > 0 ? new Date().toISOString() : null,
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("upserted60m");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [samples, setSamples] = useState<Record<string, TableSample>>({});
  const [sampleLoading, setSampleLoading] = useState<Record<string, boolean>>(
    {},
  );
  const [sampleError, setSampleError] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setRefreshing(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/admin/inventory-snapshot", {
        cache: "no-store",
      });
      if (!res.ok) {
        setLoadError(`Refresh failed (HTTP ${res.status})`);
        return;
      }
      const data = (await res.json()) as {
        snapshot: InventorySnapshot | null;
        liveCounts: Record<string, number>;
        activity?: Record<string, TableActivity>;
        at: string;
        error?: string;
      };
      setLiveCounts(data.liveCounts ?? {});
      setActivity(data.activity ?? {});
      setSnapshotCounts(data.snapshot?.counts ?? {});
      setCapturedAt(data.snapshot?.capturedAt ?? null);
      setLastRefreshedAt(data.at);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Refresh failed");
    } finally {
      setRefreshing(false);
    }
  }, []);

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

  const hasSnapshot = capturedAt != null;

  const allTables = useMemo(() => {
    if (Object.keys(liveCounts).length > 0 || Object.keys(activity).length > 0) {
      return Array.from(
        new Set([
          ...Object.keys(liveCounts),
          ...Object.keys(snapshotCounts),
          ...Object.keys(activity),
        ]),
      );
    }
    return Object.keys(snapshotCounts);
  }, [liveCounts, snapshotCounts, activity]);

  const sortedTables = useMemo(() => {
    const rows = allTables.map((table) => {
      const current = liveCounts[table] ?? 0;
      const snapshot = snapshotCounts[table];
      const delta = snapshot !== undefined ? current - snapshot : null;
      const act = activity[table];
      return {
        table,
        current,
        snapshot,
        delta,
        upserted60m: act?.upsertedLast60m ?? null,
        lastUpdated: act?.lastUpdated ?? null,
        timestampColumn: act?.timestampColumn ?? null,
      };
    });
    const dir = sortDir === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "table":
          cmp = a.table.localeCompare(b.table);
          break;
        case "current":
          cmp = a.current - b.current;
          break;
        case "snapshot": {
          const av = a.snapshot ?? Number.NEGATIVE_INFINITY;
          const bv = b.snapshot ?? Number.NEGATIVE_INFINITY;
          cmp = av - bv;
          break;
        }
        case "delta": {
          const av = a.delta ?? Number.NEGATIVE_INFINITY;
          const bv = b.delta ?? Number.NEGATIVE_INFINITY;
          cmp = av - bv;
          break;
        }
        case "upserted60m": {
          const av = a.upserted60m ?? Number.NEGATIVE_INFINITY;
          const bv = b.upserted60m ?? Number.NEGATIVE_INFINITY;
          cmp = av - bv;
          break;
        }
        case "lastUpdated": {
          const av = a.lastUpdated ? Date.parse(a.lastUpdated) : Number.NEGATIVE_INFINITY;
          const bv = b.lastUpdated ? Date.parse(b.lastUpdated) : Number.NEGATIVE_INFINITY;
          cmp = av - bv;
          break;
        }
      }
      if (cmp !== 0) return cmp * dir;
      return a.table.localeCompare(b.table);
    });
    return rows;
  }, [allTables, liveCounts, snapshotCounts, activity, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir(key === "table" ? "asc" : "desc");
  }

  function sortIndicator(key: SortKey): string {
    if (sortKey !== key) return "";
    return sortDir === "asc" ? " ↑" : " ↓";
  }

  const hasAnyMismatch = allTables.some((t) => {
    const s = rowStatus(liveCounts[t] ?? 0, snapshotCounts[t]);
    return s === "empty" || s === "low";
  });

  const overallDot = !hasSnapshot ? (
    <span className="w-1.5 h-1.5 rounded-full bg-charcoal/20 inline-block" />
  ) : hasAnyMismatch ? (
    <span className="w-1.5 h-1.5 rounded-full bg-coral animate-pulse inline-block" />
  ) : (
    <span className="w-1.5 h-1.5 rounded-full bg-sage inline-block" />
  );

  const colSpan = 8;

  return (
    <div
      id="admin-inventory-comparison"
      className="scroll-mt-24 rounded-2xl border border-charcoal/[0.08] bg-white shadow-sm shadow-charcoal/[0.04] overflow-hidden"
    >
      <div className="flex items-center justify-between gap-4 px-5 sm:px-6 py-4">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2.5 min-w-0 text-left hover:opacity-90 transition-opacity"
        >
          {overallDot}
          <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
            Inventory comparison
          </p>
          {hasSnapshot ? (
            <span className="font-mono text-[9px] tracking-[0.12em] uppercase text-charcoal/40 border border-charcoal/15 rounded-full px-2 py-0.5 shrink-0">
              snapshot{" "}
              {new Date(capturedAt as string).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </span>
          ) : (
            <span className="font-mono text-[9px] tracking-[0.12em] uppercase text-charcoal/30 border border-charcoal/10 rounded-full px-2 py-0.5 shrink-0">
              no snapshot yet — run a full resync
            </span>
          )}
          <span className="font-mono text-[10px] text-charcoal/40 shrink-0">
            {open ? "−" : "+"}
          </span>
        </button>
        <button
          type="button"
          onClick={() => void load()}
          disabled={refreshing}
          className="shrink-0 rounded-full border border-charcoal/15 px-4 py-2 font-mono text-[10px] tracking-[0.12em] uppercase text-charcoal/60 transition-colors hover:border-charcoal/30 hover:text-navy disabled:opacity-40"
        >
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {open && (
        <div className="border-t border-charcoal/[0.06]">
          <p className="px-5 sm:px-6 py-3 text-sm text-charcoal/65 leading-relaxed w-full">
            Live Neon table counts (after each table name and in Current) vs the
            post–full-resync snapshot, plus how many rows were written in the last
            60 minutes (by{" "}
            <span className="font-mono text-[11px]">synced_at</span> /{" "}
            <span className="font-mono text-[11px]">updated_at</span> when
            present). Counts load with the admin page; use Refresh for a fresh
            pull without reloading. Use{" "}
            <span className="font-mono text-[11px]">+</span> /{" "}
            <span className="font-mono text-[11px]">−</span> to load up to 100
            newest rows on demand — nothing is polled in the background.
          </p>
          {loadError ? (
            <p className="px-5 sm:px-6 pb-2 font-mono text-[10px] text-coral">
              {loadError}
            </p>
          ) : null}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left min-w-[960px]">
              <thead>
                <tr className="bg-cream/40">
                  <th className="px-3 sm:px-4 py-2 font-mono text-[9px] tracking-[0.16em] uppercase text-charcoal/40 w-8" />
                  <th className="px-2 py-2 font-mono text-[9px] tracking-[0.16em] uppercase text-charcoal/40 w-8">
                    Rows
                  </th>
                  {(
                    [
                      { key: "table", label: "Table", align: "left" },
                      { key: "current", label: "Current", align: "right" },
                      { key: "snapshot", label: "Snapshot", align: "right" },
                      { key: "delta", label: "Δ", align: "right" },
                      {
                        key: "upserted60m",
                        label: "Upserted 60m",
                        align: "right",
                      },
                      {
                        key: "lastUpdated",
                        label: "Last updated",
                        align: "right",
                      },
                    ] as const
                  ).map((col) => {
                    const active = sortKey === col.key;
                    return (
                      <th
                        key={col.key}
                        className={`px-3 sm:px-4 py-2 font-mono text-[9px] tracking-[0.16em] uppercase ${
                          col.align === "right" ? "text-right tabular-nums" : ""
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => toggleSort(col.key)}
                          className={`inline-flex items-center gap-0.5 transition-colors ${
                            active
                              ? "text-navy"
                              : "text-charcoal/40 hover:text-navy"
                          } ${
                            col.align === "right" ? "w-full justify-end" : ""
                          }`}
                          aria-sort={
                            active
                              ? sortDir === "asc"
                                ? "ascending"
                                : "descending"
                              : "none"
                          }
                        >
                          {col.label}
                          {sortIndicator(col.key)}
                        </button>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-charcoal/[0.04]">
                {sortedTables.length === 0 ? (
                  <tr>
                    <td
                      colSpan={colSpan}
                      className="px-5 sm:px-6 py-6 text-sm text-charcoal/50"
                    >
                      {Object.keys(snapshotCounts).length === 0
                        ? "No Neon tables found yet — refresh the admin page after Postgres is connected."
                        : "Snapshot only — no live tables returned. Refresh the admin page or click Refresh."}
                    </td>
                  </tr>
                ) : (
                  sortedTables.map(
                    ({
                      table,
                      current,
                      snapshot: ref,
                      delta,
                      upserted60m,
                      lastUpdated,
                      timestampColumn,
                    }) => {
                      const s = rowStatus(current, ref);
                      const isOpen = expanded.has(table);
                      const sample = samples[table];
                      const hasLive = Object.keys(liveCounts).length > 0;
                      return (
                        <Fragment key={table}>
                          <tr
                            className={
                              s === "empty"
                                ? "bg-coral/[0.04]"
                                : s === "low"
                                  ? "bg-gold/[0.04]"
                                  : ""
                            }
                          >
                            <td className="pl-3 sm:pl-4 pr-1 py-2">
                              {statusDot(s)}
                            </td>
                            <td className="px-1 py-2">
                              <button
                                type="button"
                                onClick={() => toggleExpand(table)}
                                className="inline-flex h-6 w-6 items-center justify-center rounded border border-charcoal/15 font-mono text-[12px] leading-none text-navy hover:border-navy/40 hover:bg-cream/50"
                                aria-expanded={isOpen}
                                aria-label={
                                  isOpen
                                    ? `Hide sample rows for ${table}`
                                    : `Show sample rows for ${table}`
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
                            <td className="px-3 sm:px-4 py-2 font-mono text-[11px] text-navy">
                              {table}
                              <span className="ml-2 tabular-nums text-charcoal/45">
                                {hasLive
                                  ? current < 0
                                    ? "count failed"
                                    : current.toLocaleString()
                                  : "—"}
                              </span>
                            </td>
                            <td
                              className={`px-3 sm:px-4 py-2 font-mono text-[11px] tabular-nums text-right ${
                                s === "empty"
                                  ? "text-coral font-semibold"
                                  : s === "low"
                                    ? "text-gold font-semibold"
                                    : "text-charcoal/70"
                              }`}
                            >
                              {hasLive
                                ? current < 0
                                  ? "—"
                                  : current.toLocaleString()
                                : "—"}
                            </td>
                            <td className="px-3 sm:px-4 py-2 font-mono text-[11px] tabular-nums text-right text-charcoal/45">
                              {ref !== undefined ? ref.toLocaleString() : "—"}
                            </td>
                            <td
                              className={`px-3 sm:px-4 py-2 font-mono text-[11px] tabular-nums text-right ${
                                delta === null
                                  ? "text-charcoal/25"
                                  : delta < 0
                                    ? "text-coral"
                                    : delta > 0
                                      ? "text-sage"
                                      : "text-charcoal/35"
                              }`}
                            >
                              {delta === null
                                ? "—"
                                : delta === 0
                                  ? "="
                                  : delta > 0
                                    ? `+${delta.toLocaleString()}`
                                    : delta.toLocaleString()}
                            </td>
                            <td
                              className={`px-3 sm:px-4 py-2 font-mono text-[11px] tabular-nums text-right ${
                                upserted60m != null && upserted60m > 0
                                  ? "text-navy font-semibold"
                                  : "text-charcoal/45"
                              }`}
                              title={
                                timestampColumn
                                  ? `COUNT where ${timestampColumn} ≥ now() − 60 minutes`
                                  : "No synced_at / updated_at column on this table"
                              }
                            >
                              {upserted60m == null
                                ? "—"
                                : upserted60m.toLocaleString()}
                            </td>
                            <td
                              className="px-3 sm:px-4 py-2 font-mono text-[11px] tabular-nums text-right text-charcoal/60"
                              title={lastUpdated ?? undefined}
                            >
                              {formatLastUpdated(lastUpdated)}
                            </td>
                          </tr>
                          {isOpen ? (
                            <tr className="bg-cream/[0.35]">
                              <td colSpan={colSpan} className="px-4 sm:px-5 py-3">
                                {sampleLoading[table] ? (
                                  <p className="font-mono text-[10px] text-charcoal/50">
                                    Loading up to 100 rows…
                                  </p>
                                ) : sampleError[table] ? (
                                  <p className="font-mono text-[10px] text-coral">
                                    {sampleError[table]}
                                  </p>
                                ) : sample ? (
                                  <div className="space-y-2">
                                    <p className="font-mono text-[9px] tracking-[0.12em] uppercase text-charcoal/45">
                                      {sample.rows.length.toLocaleString()} row
                                      {sample.rows.length === 1 ? "" : "s"}
                                      {" · "}
                                      {sample.columns.length.toLocaleString()}{" "}
                                      column
                                      {sample.columns.length === 1 ? "" : "s"}
                                      {sampleOrderLabel(sample)}
                                      {" · all fields (large jsonb capped at 64k chars/cell)"}
                                    </p>
                                    <div className="max-h-[36rem] overflow-auto rounded-lg border border-charcoal/[0.08] bg-white">
                                      <table className="w-full border-collapse text-left min-w-max">
                                        <thead className="sticky top-0 bg-cream/90 z-[1]">
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
                                            sample.rows.map((row, idx) => (
                                              <tr
                                                key={`${table}-r-${idx}`}
                                                className="border-b border-charcoal/[0.04] last:border-0"
                                              >
                                                {sample.columns.map((col) => (
                                                  <SampleCell
                                                    key={col}
                                                    value={row[col]}
                                                  />
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
                    },
                  )
                )}
              </tbody>
            </table>
          </div>
          <p className="px-5 sm:px-6 py-3 font-mono text-[9px] text-charcoal/35 border-t border-charcoal/[0.04]">
            Snapshot = exact counts after last successful full resync · Current /
            name count = live exact COUNT(*) (admin page load or Refresh) ·
            Upserted 60m / Last updated = same · Sample rows = on + only
            {lastRefreshedAt
              ? ` · counts as of ${new Date(lastRefreshedAt).toLocaleTimeString(
                  "en-US",
                  { hour: "numeric", minute: "2-digit" },
                )}`
              : " · no live counts yet"}
          </p>
        </div>
      )}
    </div>
  );
}
