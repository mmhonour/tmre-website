"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { formatRunDuration } from "@/components/admin/AdminSyncTable";
import {
  ADMIN_SYNC_HISTORY_DEFAULT_DAYS,
  ADMIN_SYNC_HISTORY_MAX_LIMIT,
  glomSyncHistoryRuns,
  type SyncHistoryRawRow,
} from "@/lib/admin-sync-history-glom";

type SyncHistoryResponse = {
  runs: SyncHistoryRawRow[];
  total: number;
  limit: number;
  offset: number;
  since?: string | null;
  error?: string;
};

type OkFilter = "all" | "ok" | "fail";

function historySinceIso(days = ADMIN_SYNC_HISTORY_DEFAULT_DAYS): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function formatSyncDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(ms));
}

function formatSyncTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(ms));
}

/**
 * Durable log of every MLS town/bucket sync written to Postgres `sync_runs`
 * (admin, cron, overdue catch-up). Loads ≥1 week by default; display collapses
 * by sync type (Full / Incremental), then by status bucket.
 */
export default function AdminSyncHistoryPanel({
  initial,
}: {
  initial?: SyncHistoryResponse | null;
}) {
  const [filter, setFilter] = useState<OkFilter>("all");
  const [runs, setRuns] = useState<SyncHistoryRawRow[]>(initial?.runs ?? []);
  const [total, setTotal] = useState(initial?.total ?? 0);
  const [since, setSince] = useState<string | null>(
    initial?.since ?? historySinceIso(),
  );
  const [loading, setLoading] = useState(initial == null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const skipInitialFetchRef = useRef(initial != null);

  const load = useCallback(
    async (opts: {
      ok: OkFilter;
      offset: number;
      append: boolean;
      since: string | null;
    }) => {
      if (opts.append) setLoadingMore(true);
      else setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          limit: String(ADMIN_SYNC_HISTORY_MAX_LIMIT),
          offset: String(opts.offset),
          since: opts.since ?? "all",
        });
        if (opts.ok !== "all") params.set("ok", opts.ok);
        const res = await fetch(`/api/admin/sync-runs?${params}`, {
          cache: "no-store",
        });
        const body = (await res.json()) as SyncHistoryResponse;
        if (!res.ok) {
          setError(body.error ?? "Failed to load sync history");
          return;
        }
        setTotal(body.total);
        setSince(body.since ?? opts.since);
        setRuns((prev) => (opts.append ? [...prev, ...body.runs] : body.runs));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load sync history");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (skipInitialFetchRef.current && filter === "all") {
      skipInitialFetchRef.current = false;
      return;
    }
    skipInitialFetchRef.current = false;
    const windowSince = historySinceIso();
    void load({ ok: filter, offset: 0, append: false, since: windowSince });
  }, [filter, load]);

  const glommed = useMemo(() => glomSyncHistoryRuns(runs), [runs]);
  const hasMore = runs.length < total;

  type BucketGroup = {
    bucket: string;
    rows: typeof glommed;
    latestMs: number;
  };
  type SyncTypeGroup = {
    syncType: string;
    buckets: BucketGroup[];
    latestMs: number;
    lineCount: number;
    failCount: number;
  };

  /** Sync-type groups → bucket subgroups; newest entry rises to the top at each level. */
  const syncTypeGroups = useMemo((): SyncTypeGroup[] => {
    const byType = new Map<string, typeof glommed>();
    for (const row of glommed) {
      const list = byType.get(row.syncType) ?? [];
      list.push(row);
      byType.set(row.syncType, list);
    }

    const groups: SyncTypeGroup[] = [...byType.entries()].map(([syncType, typeRows]) => {
      const byBucket = new Map<string, typeof glommed>();
      for (const row of typeRows) {
        const list = byBucket.get(row.bucket) ?? [];
        list.push(row);
        byBucket.set(row.bucket, list);
      }
      const buckets: BucketGroup[] = [...byBucket.entries()].map(([bucket, rows]) => {
        const sorted = [...rows].sort((a, b) => {
          const da = Date.parse(a.startedAt);
          const db = Date.parse(b.startedAt);
          if (Number.isFinite(da) && Number.isFinite(db) && da !== db) {
            return db - da;
          }
          return 0;
        });
        const latestMs = Math.max(
          ...sorted.map((r) => Date.parse(r.startedAt)).filter(Number.isFinite),
          0,
        );
        return { bucket, rows: sorted, latestMs };
      });
      buckets.sort((a, b) => b.latestMs - a.latestMs);
      const latestMs = Math.max(...buckets.map((b) => b.latestMs), 0);
      return {
        syncType,
        buckets,
        latestMs,
        lineCount: typeRows.length,
        failCount: typeRows.filter((r) => !r.ok).length,
      };
    });
    groups.sort((a, b) => b.latestMs - a.latestMs);
    return groups;
  }, [glommed]);

  const [expandedTypes, setExpandedTypes] = useState<Record<string, boolean>>({});
  const [expandedBuckets, setExpandedBuckets] = useState<Record<string, boolean>>(
    {},
  );

  const bucketKey = (syncType: string, bucket: string) => `${syncType}:${bucket}`;

  // Keep sync-type (and bucket) groups collapsed by default as new types appear.
  useEffect(() => {
    if (syncTypeGroups.length === 0) return;
    setExpandedTypes((prev) => {
      const next = { ...prev };
      let touched = false;
      for (const g of syncTypeGroups) {
        if (next[g.syncType] === undefined) {
          next[g.syncType] = false;
          touched = true;
        }
      }
      return touched ? next : prev;
    });
    setExpandedBuckets((prev) => {
      const next = { ...prev };
      let touched = false;
      for (const typeGroup of syncTypeGroups) {
        for (const bucketGroup of typeGroup.buckets) {
          const key = bucketKey(typeGroup.syncType, bucketGroup.bucket);
          if (next[key] === undefined) {
            next[key] = false;
            touched = true;
          }
        }
      }
      return touched ? next : prev;
    });
  }, [syncTypeGroups]);

  const toggleType = (syncType: string) => {
    setExpandedTypes((prev) => ({
      ...prev,
      [syncType]: !prev[syncType],
    }));
  };

  const toggleBucket = (syncType: string, bucket: string) => {
    const key = bucketKey(syncType, bucket);
    setExpandedBuckets((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const windowLabel =
    since != null
      ? `last ${ADMIN_SYNC_HISTORY_DEFAULT_DAYS} days`
      : "all time";

  return (
    <div
      id="admin-sync-history"
      className="scroll-mt-24 rounded-2xl border border-charcoal/[0.08] bg-white shadow-sm overflow-hidden"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 sm:px-6 py-4 border-b border-charcoal/[0.08] bg-cream/20">
        <div className="min-w-0">
          <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
            Database sync history
          </p>
          <p className="mt-1 text-sm text-slate max-w-2xl">
            MLS syncs from Admin, cron, and overdue catch-up for the{" "}
            {windowLabel} — collapsed by sync type (Full, Incremental), then by
            status bucket (Active, Closed, Expired). Expand a type with + to see
            its runs.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div
            className="flex items-center gap-1 font-mono text-[10px] tracking-[0.08em] uppercase"
            role="group"
            aria-label="Filter sync history"
          >
            {(
              [
                { id: "all" as const, label: "All" },
                { id: "ok" as const, label: "OK" },
                { id: "fail" as const, label: "Failed" },
              ] as const
            ).map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setFilter(option.id)}
                className={`rounded-full px-2.5 py-1 border transition-colors ${
                  filter === option.id
                    ? "border-navy/30 bg-navy/10 text-navy"
                    : "border-charcoal/15 text-charcoal/45 hover:text-navy hover:border-navy/20"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() =>
              void load({
                ok: filter,
                offset: 0,
                append: false,
                since: historySinceIso(),
              })
            }
            disabled={loading}
            className="font-mono text-[10px] tracking-[0.12em] uppercase rounded-full px-3 py-1.5 border border-navy/20 text-navy bg-white hover:bg-cream/80 disabled:opacity-40 transition-colors"
          >
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
      </div>

      <div className="px-5 sm:px-6 py-3 border-b border-charcoal/[0.06] bg-white">
        <p className="font-mono text-[10px] text-charcoal/45">
          {loading && runs.length === 0
            ? "loading…"
            : `${total.toLocaleString()} town run${total === 1 ? "" : "s"} · ${windowLabel}${
                filter !== "all" ? ` · showing ${filter}` : ""
              } · ${syncTypeGroups.length.toLocaleString()} sync type${
                syncTypeGroups.length === 1 ? "" : "s"
              } · ${glommed.length.toLocaleString()} line${
                glommed.length === 1 ? "" : "s"
              } loaded`}
        </p>
        {error ? (
          <p className="mt-1 font-mono text-[10px] text-coral">{error}</p>
        ) : null}
      </div>

      <div className="overflow-x-auto">
        {runs.length === 0 && !loading ? (
          <p className="px-5 sm:px-6 py-6 text-sm text-slate/70">
            No sync runs in the {windowLabel}. After a full or incremental sync,
            bucket lines appear here grouped by sync type.
          </p>
        ) : (
          <table className="w-full min-w-[820px] border-collapse">
            <thead>
              <tr className="bg-cream/30">
                <th className="px-4 py-2.5 text-left font-mono text-[10px] tracking-[0.14em] uppercase text-charcoal/40 border-b border-charcoal/[0.08]">
                  Date
                </th>
                <th className="px-4 py-2.5 text-left font-mono text-[10px] tracking-[0.14em] uppercase text-charcoal/40 border-b border-charcoal/[0.08]">
                  Started
                </th>
                <th className="px-4 py-2.5 text-left font-mono text-[10px] tracking-[0.14em] uppercase text-charcoal/40 border-b border-charcoal/[0.08]">
                  End
                </th>
                <th className="px-4 py-2.5 text-left font-mono text-[10px] tracking-[0.14em] uppercase text-charcoal/40 border-b border-charcoal/[0.08]">
                  Bucket
                </th>
                <th className="px-4 py-2.5 text-left font-mono text-[10px] tracking-[0.14em] uppercase text-charcoal/40 border-b border-charcoal/[0.08]">
                  Towns
                </th>
                <th className="px-4 py-2.5 text-right font-mono text-[10px] tracking-[0.14em] uppercase text-charcoal/40 border-b border-charcoal/[0.08]">
                  Listings
                </th>
                <th className="px-4 py-2.5 text-right font-mono text-[10px] tracking-[0.14em] uppercase text-charcoal/40 border-b border-charcoal/[0.08]">
                  Duration
                </th>
                <th className="px-4 py-2.5 text-left font-mono text-[10px] tracking-[0.14em] uppercase text-charcoal/40 border-b border-charcoal/[0.08]">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {syncTypeGroups.map((typeGroup) => {
                const typeOpen = expandedTypes[typeGroup.syncType] ?? false;
                return (
                  <Fragment key={typeGroup.syncType}>
                    <tr className="bg-navy/[0.06] border-t border-charcoal/[0.12]">
                      <td colSpan={8} className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => toggleType(typeGroup.syncType)}
                          aria-expanded={typeOpen}
                          className="inline-flex items-center gap-2 font-mono text-[11px] tracking-[0.1em] uppercase text-navy hover:text-gold transition-colors"
                        >
                          <span
                            className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border border-navy/25 bg-white text-[13px] font-semibold leading-none tabular-nums"
                            aria-hidden
                          >
                            {typeOpen ? "−" : "+"}
                          </span>
                          <span className="font-semibold">{typeGroup.syncType}</span>
                          <span className="normal-case tracking-normal text-charcoal/45">
                            {typeGroup.buckets.length.toLocaleString()} bucket
                            {typeGroup.buckets.length === 1 ? "" : "s"}
                            {" · "}
                            {typeGroup.lineCount.toLocaleString()} line
                            {typeGroup.lineCount === 1 ? "" : "s"}
                            {typeGroup.failCount > 0
                              ? ` · ${typeGroup.failCount} failed`
                              : ""}
                            {typeGroup.latestMs > 0
                              ? ` · latest ${formatSyncDate(
                                  new Date(typeGroup.latestMs).toISOString(),
                                )} ${formatSyncTime(
                                  new Date(typeGroup.latestMs).toISOString(),
                                )}`
                              : ""}
                          </span>
                        </button>
                      </td>
                    </tr>
                    {typeOpen
                      ? typeGroup.buckets.map((bucketGroup) => {
                          const bKey = bucketKey(
                            typeGroup.syncType,
                            bucketGroup.bucket,
                          );
                          const bucketOpen = expandedBuckets[bKey] ?? false;
                          const failCount = bucketGroup.rows.filter(
                            (r) => !r.ok,
                          ).length;
                          return (
                            <Fragment key={bKey}>
                              <tr className="bg-navy/[0.03] border-t border-charcoal/[0.08]">
                                <td colSpan={8} className="px-3 py-1.5 pl-8">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      toggleBucket(
                                        typeGroup.syncType,
                                        bucketGroup.bucket,
                                      )
                                    }
                                    aria-expanded={bucketOpen}
                                    className="inline-flex items-center gap-2 font-mono text-[11px] tracking-[0.1em] uppercase text-navy/90 hover:text-gold transition-colors"
                                  >
                                    <span
                                      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border border-navy/20 bg-white text-[13px] font-semibold leading-none tabular-nums"
                                      aria-hidden
                                    >
                                      {bucketOpen ? "−" : "+"}
                                    </span>
                                    <span className="font-semibold">
                                      {bucketGroup.bucket}
                                    </span>
                                    <span className="normal-case tracking-normal text-charcoal/45">
                                      {bucketGroup.rows.length.toLocaleString()}{" "}
                                      line
                                      {bucketGroup.rows.length === 1
                                        ? ""
                                        : "s"}
                                      {failCount > 0
                                        ? ` · ${failCount} failed`
                                        : ""}
                                      {bucketGroup.latestMs > 0
                                        ? ` · latest ${formatSyncDate(
                                            new Date(
                                              bucketGroup.latestMs,
                                            ).toISOString(),
                                          )} ${formatSyncTime(
                                            new Date(
                                              bucketGroup.latestMs,
                                            ).toISOString(),
                                          )}`
                                        : ""}
                                    </span>
                                  </button>
                                </td>
                              </tr>
                              {bucketOpen
                                ? bucketGroup.rows.map((run, index) => (
                                    <tr
                                      key={run.key}
                                      className={
                                        !run.ok
                                          ? "bg-rose-50/80"
                                          : index % 2 === 1
                                            ? "bg-cream/[0.18]"
                                            : "bg-white"
                                      }
                                    >
                                      <td className="px-4 py-2.5 pl-12 align-top font-mono text-[11px] tabular-nums text-slate whitespace-nowrap">
                                        {formatSyncDate(run.startedAt)}
                                      </td>
                                      <td className="px-4 py-2.5 align-top font-mono text-[11px] tabular-nums text-slate whitespace-nowrap">
                                        {formatSyncTime(run.startedAt)}
                                      </td>
                                      <td className="px-4 py-2.5 align-top font-mono text-[11px] tabular-nums text-slate whitespace-nowrap">
                                        {formatSyncTime(run.finishedAt)}
                                      </td>
                                      <td className="px-4 py-2.5 align-top font-mono text-[11px] tracking-[0.06em] uppercase text-navy">
                                        {run.bucket}
                                      </td>
                                      <td className="px-4 py-2.5 align-top font-mono text-[11px] text-charcoal/70 leading-snug">
                                        {run.townsLabel}
                                      </td>
                                      <td className="px-4 py-2.5 align-top text-right font-mono text-[11px] tabular-nums text-navy">
                                        {run.listingsCount.toLocaleString()}
                                      </td>
                                      <td className="px-4 py-2.5 align-top text-right font-mono text-[11px] tabular-nums text-charcoal/50">
                                        {formatRunDuration(run.durationMs)}
                                      </td>
                                      <td className="px-4 py-2.5 align-top min-w-[10rem]">
                                        <p
                                          className={`font-mono text-[10px] tracking-[0.1em] uppercase ${
                                            run.ok ? "text-sage" : "text-coral"
                                          }`}
                                        >
                                          {run.ok ? "OK" : "Failed"}
                                        </p>
                                        {run.error ? (
                                          <p className="mt-0.5 font-mono text-[10px] leading-snug text-coral break-words whitespace-pre-line">
                                            {run.error}
                                          </p>
                                        ) : null}
                                      </td>
                                    </tr>
                                  ))
                                : null}
                            </Fragment>
                          );
                        })
                      : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {hasMore ? (
        <div className="px-5 sm:px-6 py-3 border-t border-charcoal/[0.08] bg-cream/10">
          <button
            type="button"
            onClick={() =>
              void load({
                ok: filter,
                offset: runs.length,
                append: true,
                since,
              })
            }
            disabled={loadingMore}
            className="font-mono text-[10px] tracking-[0.12em] uppercase rounded-full px-4 py-2 border border-navy/20 text-navy bg-white hover:bg-cream/80 disabled:opacity-40 transition-colors"
          >
            {loadingMore
              ? "Loading…"
              : `Load more (${(total - runs.length).toLocaleString()} remaining)`}
          </button>
        </div>
      ) : null}
    </div>
  );
}
