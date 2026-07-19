"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatRunDuration } from "@/components/admin/AdminSyncTable";
import {
  glomSyncHistoryRuns,
  type SyncHistoryRawRow,
} from "@/lib/admin-sync-history-glom";

type SyncHistoryResponse = {
  runs: SyncHistoryRawRow[];
  total: number;
  limit: number;
  offset: number;
  error?: string;
};

type OkFilter = "all" | "ok" | "fail";

const PAGE_SIZE = 50;

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
 * (admin, cron, overdue catch-up). Display gloms towns that ran together into
 * one line per status bucket (Active / Closed / Expired).
 */
export default function AdminSyncHistoryPanel({
  initial,
}: {
  initial?: SyncHistoryResponse | null;
}) {
  const [filter, setFilter] = useState<OkFilter>("all");
  const [runs, setRuns] = useState<SyncHistoryRawRow[]>(initial?.runs ?? []);
  const [total, setTotal] = useState(initial?.total ?? 0);
  const [loading, setLoading] = useState(initial == null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const skipInitialFetchRef = useRef(initial != null);

  const load = useCallback(async (opts: { ok: OkFilter; offset: number; append: boolean }) => {
    if (opts.append) setLoadingMore(true);
    else setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(opts.offset),
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
      setRuns((prev) => (opts.append ? [...prev, ...body.runs] : body.runs));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sync history");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    if (skipInitialFetchRef.current && filter === "all") {
      skipInitialFetchRef.current = false;
      return;
    }
    skipInitialFetchRef.current = false;
    void load({ ok: filter, offset: 0, append: false });
  }, [filter, load]);

  const glommed = useMemo(() => glomSyncHistoryRuns(runs), [runs]);
  const hasMore = runs.length < total;

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
            MLS syncs from Admin, cron, and overdue catch-up — towns that ran together
            are glommed into one line per status bucket (Active, Closed, Expired). Newest
            first.
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
            onClick={() => void load({ ok: filter, offset: 0, append: false })}
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
            : `${total.toLocaleString()} town run${total === 1 ? "" : "s"}${
                filter !== "all" ? ` · showing ${filter}` : ""
              } · ${glommed.length.toLocaleString()} bucket line${
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
            No sync runs recorded yet. After a full or incremental sync, bucket lines
            appear here with towns glommed together.
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
              {glommed.map((run, index) => (
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
                  <td className="px-4 py-2.5 align-top font-mono text-[11px] tabular-nums text-slate whitespace-nowrap">
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
              ))}
            </tbody>
          </table>
        )}
      </div>

      {hasMore ? (
        <div className="px-5 sm:px-6 py-3 border-t border-charcoal/[0.08] bg-cream/10">
          <button
            type="button"
            onClick={() =>
              void load({ ok: filter, offset: runs.length, append: true })
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
