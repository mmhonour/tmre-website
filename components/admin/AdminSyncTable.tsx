"use client";

import { useCallback, useEffect, useState } from "react";
import type { AdminSyncActionId } from "@/lib/admin-sync-types";
import type { AdminSyncPanelRowId } from "@/lib/admin-sync-schedule-format";
import { formatAdminNextSyncAt } from "@/lib/admin-sync-schedule-format";
import { adminSyncImpactedPages } from "@/lib/admin-sync-pages";
import Link from "next/link";

export type AdminSyncRow = {
  id: string;
  label: string;
  value: string;
  detail?: string;
  actionId?: AdminSyncActionId;
  startedAt?: string | null;
  finishedAt?: string | null;
  nextRunAt?: string | null;
};

type SyncStats = {
  lastFullSync: string | null;
  lastFullSyncStarted: string | null;
  lastIncrementalSync: string | null;
  lastIncrementalSyncStarted: string | null;
  lastListingScores: string | null;
  lastListingScoresStarted: string | null;
  lastStatsCache: string | null;
  lastStatsCacheStarted: string | null;
  lastDealOfTheDayCache: string | null;
  lastDealOfTheDayCacheStarted: string | null;
};

type SyncTiming = {
  started: string | null;
  finished: string | null;
};

type PanelStatus = {
  refreshing: boolean;
  lastRefreshFinished: string | null;
  lastRefreshStarted: string | null;
  latestListingUpdate: string | null;
  propertyAddressesSyncedAt?: string | null;
  stats: SyncStats;
  nextRuns?: Partial<Record<AdminSyncPanelRowId, string | null>>;
  rets?: {
    configured: boolean;
    status: string;
    ok: boolean;
    message: string;
    checkedAt: string | null;
    detail?: string;
  };
  syncFailures?: {
    town: string;
    statusBucket: string;
    error: string;
    finishedAt: string;
    startedAt: string;
  }[];
};

function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function timingForRow(row: AdminSyncRow, status: PanelStatus | null): SyncTiming {
  if (row.startedAt != null || row.finishedAt != null) {
    return { started: row.startedAt ?? null, finished: row.finishedAt ?? null };
  }

  if (!status) {
    return { started: null, finished: null };
  }

  switch (row.id) {
    case "full-resync":
      return {
        started: status.stats.lastFullSyncStarted,
        finished: status.stats.lastFullSync,
      };
    case "incremental":
      return {
        started: status.stats.lastIncrementalSyncStarted,
        finished: status.stats.lastIncrementalSync,
      };
    case "latest-mls":
      return { started: null, finished: status.latestListingUpdate };
    case "listing-scores":
      return {
        started: status.stats.lastListingScoresStarted,
        finished: status.stats.lastListingScores,
      };
    case "refresh-finished":
      return {
        started: status.lastRefreshStarted,
        finished: status.lastRefreshFinished,
      };
    case "stats-cache":
      return {
        started: status.stats.lastStatsCacheStarted,
        finished: status.stats.lastStatsCache,
      };
    case "deal-of-the-day":
      return {
        started: status.stats.lastDealOfTheDayCacheStarted,
        finished: status.stats.lastDealOfTheDayCache,
      };
    case "property-addresses":
      return { started: null, finished: status.propertyAddressesSyncedAt ?? null };
    default:
      return { started: null, finished: null };
  }
}

function SyncTimestamp({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  return (
    <div className="min-w-0">
      <p className="font-mono text-[10px] tracking-wide text-charcoal/45 uppercase">{label}</p>
      <p className="font-mono text-xs tabular-nums text-navy font-semibold whitespace-nowrap">
        {formatTimestamp(value)}
      </p>
    </div>
  );
}

function nextRunForRow(
  row: AdminSyncRow,
  status: PanelStatus | null,
): string | null {
  if (status?.nextRuns && row.id in status.nextRuns) {
    return status.nextRuns[row.id as AdminSyncPanelRowId] ?? null;
  }
  return row.nextRunAt ?? null;
}

const ACTION_ROW_ID: Record<AdminSyncActionId, string> = {
  "full-resync": "full-resync",
  incremental: "incremental",
  "listing-scores": "listing-scores",
  "publish-snapshot": "refresh-finished",
  "stats-cache": "stats-cache",
  "deal-of-the-day": "deal-of-the-day",
  "property-addresses": "property-addresses",
};

/** Started-but-not-finished older than this → hung (pink). */
const HANG_THRESHOLD_MS = 45 * 60 * 1000;

type SyncRowVisualStatus = "running" | "ok" | "alert" | "idle";

function parseIsoMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

function isTimingInProgress(timing: SyncTiming, nowMs: number): boolean {
  const startedMs = parseIsoMs(timing.started);
  if (startedMs == null) return false;
  const finishedMs = parseIsoMs(timing.finished);
  if (finishedMs != null && finishedMs >= startedMs) return false;
  return nowMs - startedMs < HANG_THRESHOLD_MS;
}

function isTimingHung(timing: SyncTiming, nowMs: number): boolean {
  const startedMs = parseIsoMs(timing.started);
  if (startedMs == null) return false;
  const finishedMs = parseIsoMs(timing.finished);
  if (finishedMs != null && finishedMs >= startedMs) return false;
  return nowMs - startedMs >= HANG_THRESHOLD_MS;
}

function isScheduleBreached(
  nextRunAt: string | null,
  finishedAt: string | null,
  nowMs: number,
): boolean {
  const dueMs = parseIsoMs(nextRunAt);
  if (dueMs == null || nowMs <= dueMs) return false;
  const finishedMs = parseIsoMs(finishedAt);
  if (finishedMs == null) return true;
  return finishedMs < dueMs;
}

function resolveSyncRowVisualStatus(options: {
  row: AdminSyncRow;
  timing: SyncTiming;
  nextRunAt: string | null;
  status: PanelStatus | null;
  isRunning: boolean;
  syncAllRunning: boolean;
  message?: string;
  nowMs: number;
}): SyncRowVisualStatus {
  const { row, timing, nextRunAt, status, isRunning, syncAllRunning, message, nowMs } =
    options;

  const refreshRowRunning =
    row.id === "refresh-finished" && Boolean(status?.refreshing);
  const refreshRowHung =
    row.id === "refresh-finished" &&
    Boolean(status?.refreshing) &&
    (() => {
      const startedMs = parseIsoMs(status?.lastRefreshStarted);
      return startedMs != null && nowMs - startedMs >= HANG_THRESHOLD_MS;
    })();

  const inProgress =
    isRunning ||
    (syncAllRunning && row.actionId != null) ||
    refreshRowRunning ||
    isTimingInProgress(timing, nowMs);

  if (inProgress && !refreshRowHung) return "running";

  const failed = Boolean(message?.toLowerCase().includes("fail"));
  const hung = refreshRowHung || isTimingHung(timing, nowMs);
  const breached =
    row.nextRunAt != null || nextRunAt != null
      ? isScheduleBreached(nextRunAt, timing.finished, nowMs)
      : false;

  if (failed || hung || breached) return "alert";

  if (timing.finished) return "ok";

  return "idle";
}

function syncRowClassName(visual: SyncRowVisualStatus, stripe: boolean): string {
  switch (visual) {
    case "running":
      return "bg-gold/30 animate-pulse";
    case "ok":
      return "bg-sage/15";
    case "alert":
      return "bg-rose-100/90";
    default:
      return stripe ? "bg-cream/[0.18]" : "bg-white";
  }
}

function SyncImpactedPages({ rowId }: { rowId: string }) {
  const pages = adminSyncImpactedPages(rowId);
  if (pages.length === 0) {
    return <span className="font-mono text-[10px] text-charcoal/30">—</span>;
  }

  return (
    <ul className="flex flex-wrap gap-1.5 min-w-0 list-none p-0 m-0">
      {pages.map((page) => (
        <li key={page.href}>
          <Link
            href={page.href}
            className="inline-block font-mono text-[10px] tracking-[0.08em] uppercase text-navy/70 hover:text-gold border border-charcoal/10 hover:border-gold/40 rounded-full px-2 py-0.5 bg-white transition-colors whitespace-nowrap"
          >
            {page.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}

const TH =
  "px-4 py-2.5 text-left font-mono text-[10px] tracking-[0.14em] uppercase text-charcoal/40 border-r border-b border-transparent bg-cream/30 whitespace-nowrap";
const TD =
  "px-4 py-3 align-top text-left border-r border-b border-transparent last:border-r-0";

export default function AdminSyncTable({
  rows,
  initialRefreshing,
}: {
  rows: AdminSyncRow[];
  initialRefreshing: boolean;
}) {
  const [status, setStatus] = useState<PanelStatus | null>(null);
  const [refreshing, setRefreshing] = useState(initialRefreshing);
  const [runningId, setRunningId] = useState<AdminSyncActionId | "sync-all-caches" | null>(
    null,
  );
  const [messages, setMessages] = useState<Partial<Record<string, string>>>({});
  const [runTimings, setRunTimings] = useState<Partial<Record<string, SyncTiming>>>({});
  const [syncAllSummary, setSyncAllSummary] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const tickMs = refreshing || runningId != null ? 5_000 : 60_000;
    const id = window.setInterval(() => setNow(new Date()), tickMs);
    return () => window.clearInterval(id);
  }, [refreshing, runningId]);

  const refreshStatus = useCallback(async () => {
    const res = await fetch("/api/admin/sync", { cache: "no-store" });
    if (!res.ok) return;
    const body = (await res.json()) as PanelStatus;
    setStatus(body);
    setRefreshing(body.refreshing);
  }, []);

  useEffect(() => {
    void refreshStatus();
    const pollMs = refreshing || runningId != null ? 5_000 : 60_000;
    const id = window.setInterval(() => void refreshStatus(), pollMs);
    return () => window.clearInterval(id);
  }, [refreshStatus, refreshing, runningId]);

  const runSync = useCallback(
    async (row: AdminSyncRow) => {
      if (!row.actionId || runningId) return;
      const startedAt = new Date().toISOString();
      setRunningId(row.actionId);
      setMessages((prev) => ({ ...prev, [row.id]: undefined }));
      setRunTimings((prev) => ({
        ...prev,
        [row.id]: { started: startedAt, finished: null },
      }));

      try {
        const res = await fetch("/api/admin/sync", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: row.actionId }),
        });
        const body = (await res.json()) as PanelStatus & {
          ok?: boolean;
          message?: string;
          detail?: string;
          error?: string;
          startedAt?: string;
          finishedAt?: string;
        };

        if (!res.ok) {
          setMessages((prev) => ({
            ...prev,
            [row.id]: body.detail ?? body.error ?? "Sync failed",
          }));
          setRunTimings((prev) => ({
            ...prev,
            [row.id]: {
              started: body.startedAt ?? startedAt,
              finished: body.finishedAt ?? new Date().toISOString(),
            },
          }));
          return;
        }

        setStatus(body);
        setRefreshing(body.refreshing);
        setRunTimings((prev) => ({
          ...prev,
          [row.id]: {
            started: body.startedAt ?? startedAt,
            finished: body.finishedAt ?? new Date().toISOString(),
          },
        }));
        setMessages((prev) => ({
          ...prev,
          [row.id]: body.message ?? "Complete",
        }));
      } catch (err) {
        setMessages((prev) => ({
          ...prev,
          [row.id]: err instanceof Error ? err.message : "Sync failed",
        }));
        setRunTimings((prev) => ({
          ...prev,
          [row.id]: { started: startedAt, finished: new Date().toISOString() },
        }));
      } finally {
        setRunningId(null);
        void refreshStatus();
      }
    },
    [runningId, refreshStatus],
  );

  const runSyncAll = useCallback(async () => {
    if (runningId) return;
    setRunningId("sync-all-caches");
    setSyncAllSummary(null);
    setMessages({});
    setRunTimings({});

    try {
      const res = await fetch("/api/admin/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "sync-all-caches" }),
      });
      const body = (await res.json()) as PanelStatus & {
        ok?: boolean;
        message?: string;
        detail?: string;
        error?: string;
        steps?: {
          ok: boolean;
          action: AdminSyncActionId;
          message: string;
          stepLabel?: string;
          startedAt?: string;
          finishedAt?: string;
        }[];
      };

      if (!res.ok) {
        setSyncAllSummary(body.detail ?? body.error ?? "Sync all failed");
        return;
      }

      setStatus(body);
      setRefreshing(body.refreshing);

      if (body.steps?.length) {
        const nextMessages: Partial<Record<string, string>> = {};
        const nextTimings: Partial<Record<string, SyncTiming>> = {};
        for (const step of body.steps) {
          const rowId = ACTION_ROW_ID[step.action];
          if (rowId && !step.stepLabel) {
            nextMessages[rowId] = step.message;
            if (step.startedAt || step.finishedAt) {
              nextTimings[rowId] = {
                started: step.startedAt ?? null,
                finished: step.finishedAt ?? null,
              };
            }
          }
        }
        setMessages(nextMessages);
        setRunTimings(nextTimings);
      }

      setSyncAllSummary(body.message ?? "Sync all complete");
    } catch (err) {
      setSyncAllSummary(err instanceof Error ? err.message : "Sync all failed");
    } finally {
      setRunningId(null);
      void refreshStatus();
    }
  }, [runningId, refreshStatus]);

  const globalBusy = refreshing || runningId != null;
  const syncAllRunning = runningId === "sync-all-caches";
  const rets = status?.rets;
  const syncFailures = status?.syncFailures ?? [];
  const showRetsAlert = rets && !rets.ok;

  return (
    <>
      {rets ? (
        <div
          className={`px-5 sm:px-6 py-3 border-b border-charcoal/[0.08] ${
            rets.ok ? "bg-sage/10" : "bg-rose-50/90"
          }`}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono text-[10px] tracking-[0.16em] uppercase text-charcoal/50 mb-1">
                MLS / RETS connection
              </p>
              <p
                className={`text-sm font-medium leading-snug ${
                  rets.ok ? "text-sage" : "text-rose-800"
                }`}
              >
                {rets.message}
              </p>
              {rets.detail && !rets.ok ? (
                <p className="mt-1 font-mono text-[10px] text-rose-700/80 break-words">
                  {rets.detail}
                </p>
              ) : null}
            </div>
            <p className="font-mono text-[10px] text-charcoal/45 shrink-0">
              {rets.checkedAt ? `Checked ${formatTimestamp(rets.checkedAt)}` : "Not checked yet"}
            </p>
          </div>
        </div>
      ) : null}
      {showRetsAlert && syncFailures.length > 0 ? (
        <div className="px-5 sm:px-6 py-3 border-b border-charcoal/[0.08] bg-white">
          <p className="font-mono text-[10px] tracking-[0.16em] uppercase text-charcoal/50 mb-2">
            Recent sync failures
          </p>
          <ul className="space-y-1.5">
            {syncFailures.slice(0, 4).map((row, i) => (
              <li
                key={`${row.town}-${row.statusBucket}-${row.finishedAt}-${i}`}
                className="font-mono text-[10px] text-coral leading-snug"
              >
                <span className="text-navy/70">
                  {formatTimestamp(row.finishedAt)} · {row.town} {row.statusBucket}:
                </span>{" "}
                {row.error}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-5 sm:px-6 py-3 border-b border-charcoal/[0.08] bg-cream/20">
        <p className="text-xs text-slate leading-relaxed max-w-2xl">
          Sync all runs a full MLS resync, scores, stats, Deal of the Day, intelligence
          board, Latest feeds, property addresses, Deal of the Week, then publishes the read
          snapshot — serially.
        </p>
        <button
          type="button"
          onClick={() => void runSyncAll()}
          disabled={globalBusy}
          className="font-mono text-[10px] tracking-[0.12em] uppercase rounded-full px-4 py-2 border border-gold/40 text-navy bg-gold/15 hover:bg-gold/25 disabled:opacity-40 disabled:pointer-events-none transition-colors shrink-0 self-start sm:self-auto"
        >
          {syncAllRunning ? "Syncing all…" : "Sync all"}
        </button>
      </div>
      {syncAllSummary ? (
        <div className="px-5 sm:px-6 py-2 border-b border-charcoal/[0.08] bg-white">
          <p
            className={`font-mono text-[10px] tracking-wide ${
              syncAllSummary.toLowerCase().includes("fail") ||
              syncAllSummary.toLowerCase().includes("stopped")
                ? "text-coral"
                : "text-sage"
            }`}
          >
            {syncAllSummary}
          </p>
        </div>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1080px] border-collapse table-fixed">
          <colgroup>
            <col className="w-[7.5rem]" />
            <col className="w-[9.5rem]" />
            <col />
            <col className="w-[11rem]" />
            <col className="w-[10.5rem]" />
            <col className="w-[10.5rem]" />
            <col className="w-[11rem]" />
          </colgroup>
          <thead>
            <tr>
              <th className={TH}>Action</th>
              <th className={TH}>Sync</th>
              <th className={TH}>Description</th>
              <th className={TH}>Pages</th>
              <th className={TH}>Start</th>
              <th className={TH}>End</th>
              <th className={`${TH} border-r-0`}>Next scheduled</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const isRunning = row.actionId != null && runningId === row.actionId;
              const message = messages[row.id];
              const disabled = !row.actionId || globalBusy;
              const timing = runTimings[row.id] ?? timingForRow(row, status);
              const showSingleTimestamp =
                row.id === "latest-mls" || row.id === "property-addresses";
              const nextRunAt = nextRunForRow(row, status);
              const nowMs = now.getTime();
              const visual = resolveSyncRowVisualStatus({
                row,
                timing,
                nextRunAt,
                status,
                isRunning,
                syncAllRunning,
                message,
                nowMs,
              });
              const rowHung =
                isTimingHung(timing, nowMs) ||
                (row.id === "refresh-finished" &&
                  Boolean(status?.refreshing) &&
                  (() => {
                    const startedMs = parseIsoMs(status?.lastRefreshStarted);
                    return startedMs != null && nowMs - startedMs >= HANG_THRESHOLD_MS;
                  })());
              const rowOverdue =
                visual === "alert" &&
                !rowHung &&
                isScheduleBreached(nextRunAt, timing.finished, nowMs);

              return (
                <tr
                  key={row.id}
                  className={`transition-colors duration-500 ${syncRowClassName(visual, index % 2 === 1)}`}
                >
                  <td className={TD}>
                    {row.actionId ? (
                      <button
                        type="button"
                        onClick={() => void runSync(row)}
                        disabled={disabled}
                        className="font-mono text-[10px] tracking-[0.12em] uppercase rounded-full px-3 py-1.5 border border-navy/20 text-navy bg-white hover:bg-cream/80 disabled:opacity-40 disabled:pointer-events-none transition-colors whitespace-nowrap"
                      >
                        {isRunning ? "Syncing…" : "Sync now"}
                      </button>
                    ) : (
                      <span className="font-mono text-[10px] tracking-wide text-charcoal/30">—</span>
                    )}
                  </td>
                  <td className={TD}>
                    <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-charcoal/60 leading-snug">
                      {row.label}
                    </p>
                  </td>
                  <td className={TD}>
                    <p className="text-sm text-slate leading-snug">{row.detail ?? ""}</p>
                    {message ? (
                      <p
                        className={`mt-1 font-mono text-[10px] tracking-wide ${
                          message.toLowerCase().includes("fail") ? "text-coral" : "text-sage"
                        }`}
                      >
                        {message}
                      </p>
                    ) : isRunning ? (
                      <p className="mt-1 font-mono text-[10px] tracking-wide text-gold">Running…</p>
                    ) : null}
                  </td>
                  <td className={TD}>
                    <SyncImpactedPages rowId={row.id} />
                  </td>
                  {showSingleTimestamp ? (
                    <td className={TD} colSpan={2}>
                      <SyncTimestamp label="Updated" value={timing.finished} />
                    </td>
                  ) : (
                    <>
                      <td className={TD}>
                        <SyncTimestamp label="Start" value={timing.started} />
                      </td>
                      <td className={TD}>
                        <SyncTimestamp label="End" value={timing.finished} />
                      </td>
                    </>
                  )}
                  <td className={`${TD} border-r-0`}>
                    <p
                      className={`font-mono text-xs tabular-nums font-semibold whitespace-nowrap ${
                        visual === "alert" && nextRunAt && nowMs > (parseIsoMs(nextRunAt) ?? 0)
                          ? "text-rose-700"
                          : "text-navy"
                      }`}
                    >
                      {formatAdminNextSyncAt(nextRunAt, now)}
                    </p>
                    {visual === "alert" ? (
                      <p className="mt-0.5 font-mono text-[9px] tracking-wide text-rose-600/80 uppercase">
                        {isTimingHung(timing, nowMs) ||
                        (row.id === "refresh-finished" && status?.refreshing)
                          ? "Hung"
                          : "Overdue"}
                      </p>
                    ) : visual === "ok" ? (
                      <p className="mt-0.5 font-mono text-[9px] tracking-wide text-sage/80 uppercase">
                        On schedule
                      </p>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
