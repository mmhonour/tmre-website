"use client";

import { useMemo, useState } from "react";
import type { AdminSyncActionId } from "@/lib/admin-sync-types";
import {
  ADMIN_MANUAL_SYNC_ORDER_BY_ROW,
  ADMIN_SYNC_ACTIONS,
} from "@/lib/admin-sync-types";
import {
  adminSyncOrderDisplay,
  formatAdminNextSyncAt,
  formatAdminNextSyncCountdown,
  formatAdminSyncTimeOnly,
  type AdminSyncPanelRowId,
} from "@/lib/admin-sync-schedule-format";
import { SCHEDULED_SYNC_JOB_BY_ROW } from "@/lib/scheduled-sync-jobs";
import {
  evaluateIncrementalHealth,
  isMlsSyncDoorbellError,
} from "@/lib/incremental-sync-health";
import {
  frequencyLabel,
  orderNumberByRow,
  resolveJobScheduler,
  resolveWeekdayEt,
  schedulerProviderLabel,
  SYNC_SCHEDULE_WEEKDAYS,
  type SyncJobScheduleConfig,
  type SyncScheduleConfig,
} from "@/lib/sync-schedule-config-shared";

type HeatmapRow = {
  id: string;
  label: string;
  detail?: string;
  actionId?: AdminSyncActionId;
  finishedAt?: string | null;
};

type HeatmapStatus = {
  lastMlsSyncHeartbeat?: string | null;
  lastIncrementalUpsertsLabel?: string | null;
  incrementalLive?: unknown;
  incrementalLiveStatus?: string | null;
  latestListingUpdate?: string | null;
  lastRefreshFinished?: string | null;
  lastRefreshStarted?: string | null;
  propertyAddressesSyncedAt?: string | null;
  visionAddressesSyncedAt?: string | null;
  zipBoundariesSyncedAt?: string | null;
  zipBoundariesSyncStartedAt?: string | null;
  fomcLastSyncedAt?: string | null;
  cpiLastSyncedAt?: string | null;
  marketDigestLastSentAt?: string | null;
  nextRuns?: Partial<Record<AdminSyncPanelRowId, string | null>>;
  stats: {
    lastFullSync: string | null;
    lastFullSyncStarted?: string | null;
    lastIncrementalSync: string | null;
    lastIncrementalSyncStarted?: string | null;
    lastListingScores: string | null;
    lastListingScoresStarted?: string | null;
    lastListingEdgeScores?: string | null;
    lastStatsCache: string | null;
    lastStatsCacheStarted?: string | null;
    lastDealOfTheDayCache: string | null;
    lastDealOfTheDayCacheStarted?: string | null;
  };
};

type Visual = "running" | "ok" | "alert" | "idle";

function parseIsoMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

function formatAgeAgo(iso: string | null | undefined, nowMs: number): string {
  const ms = parseIsoMs(iso);
  if (ms == null) return "—";
  const sec = Math.max(0, Math.floor((nowMs - ms) / 1000));
  if (sec < 60) return "just now";
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

function chipClass(visual: Visual): string {
  switch (visual) {
    case "running":
      return "bg-gold/40 text-navy animate-pulse";
    case "ok":
      return "bg-sage/30 text-navy";
    case "alert":
      return "bg-rose-200 text-rose-900";
    default:
      return "bg-charcoal/10 text-charcoal/50";
  }
}

function rowShellClass(visual: Visual): string {
  switch (visual) {
    case "running":
      return "border-gold/40 bg-gold/15";
    case "ok":
      return "border-sage/30 bg-sage/10";
    case "alert":
      return "border-rose-300 bg-rose-50";
    default:
      return "border-charcoal/10 bg-white";
  }
}

function finishedForRow(
  row: HeatmapRow,
  status: HeatmapStatus | null,
): string | null {
  if (row.finishedAt) return row.finishedAt;
  if (!status) return null;
  switch (row.id) {
    case "full-resync":
      return status.stats.lastFullSync;
    case "incremental":
      return status.stats.lastIncrementalSync;
    case "listing-scores":
      return status.stats.lastListingScores;
    case "edge-scores":
      return status.stats.lastListingEdgeScores ?? null;
    case "refresh-finished":
      return status.lastRefreshFinished ?? null;
    case "stats-cache":
      return status.stats.lastStatsCache;
    case "deal-of-the-day":
      return status.stats.lastDealOfTheDayCache;
    case "property-addresses":
      return status.propertyAddressesSyncedAt ?? null;
    case "vision-addresses":
      return status.visionAddressesSyncedAt ?? null;
    case "zip-boundaries":
      return status.zipBoundariesSyncedAt ?? null;
    case "fomc-sync":
      return status.fomcLastSyncedAt ?? null;
    case "cpi-sync":
      return status.cpiLastSyncedAt ?? null;
    case "market-digest":
      return status.marketDigestLastSentAt ?? null;
    case "latest-mls":
      return status.latestListingUpdate ?? null;
    default:
      return null;
  }
}

function startedForRow(
  row: HeatmapRow,
  status: HeatmapStatus | null,
): string | null {
  if (!status) return null;
  switch (row.id) {
    case "full-resync":
      return status.stats.lastFullSyncStarted ?? null;
    case "incremental":
      return status.stats.lastIncrementalSyncStarted ?? null;
    case "listing-scores":
      return status.stats.lastListingScoresStarted ?? null;
    case "refresh-finished":
      return status.lastRefreshStarted ?? null;
    case "stats-cache":
      return status.stats.lastStatsCacheStarted ?? null;
    case "deal-of-the-day":
      return status.stats.lastDealOfTheDayCacheStarted ?? null;
    case "zip-boundaries":
      return status.zipBoundariesSyncStartedAt ?? null;
    default:
      return null;
  }
}

function formatDurationMs(ms: number): string {
  const sec = Math.max(0, Math.round(ms / 1000));
  if (sec < 60) return `${Math.max(1, sec)}s`;
  if (sec < 3600) return `${Math.round(sec / 60)}m`;
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return m > 0 && h < 10 ? `${h}h ${m}m` : `${h}h`;
}

/** Last-run duration, or time in flight when Start is open. */
function formatRunElapsed(
  started: string | null,
  finished: string | null,
  nowMs: number,
): string | null {
  const startMs = parseIsoMs(started);
  const endMs = parseIsoMs(finished);
  if (startMs == null) return null;
  if (endMs != null && endMs >= startMs) {
    return formatDurationMs(endMs - startMs);
  }
  if (endMs == null || startMs > endMs) {
    return `${formatDurationMs(nowMs - startMs)} in`;
  }
  return null;
}

function formatFrequencyLine(
  job: SyncJobScheduleConfig | null | undefined,
): string | null {
  if (!job) return null;
  const freq = frequencyLabel(job.frequency);
  const scheduler = schedulerProviderLabel(resolveJobScheduler(job));
  if (job.frequency === "weekly") {
    const day =
      SYNC_SCHEDULE_WEEKDAYS[resolveWeekdayEt(job)]?.short ?? "Mon";
    return `${freq} · ${day} ${job.startTimeEt} ET · ${scheduler}`;
  }
  if (
    job.frequency === "daily" ||
    job.frequency === "monthly" ||
    job.frequency === "event"
  ) {
    return `${freq} · ${job.startTimeEt} ET · ${scheduler}`;
  }
  return `${freq} · ${scheduler}`;
}

export default function AdminSyncMobileHeatmap({
  rows,
  status,
  scheduleConfig,
  runningId,
  errors,
  now,
  onSyncNow,
}: {
  rows: HeatmapRow[];
  status: HeatmapStatus | null;
  scheduleConfig: SyncScheduleConfig;
  runningId: string | null;
  errors: Record<string, string | undefined>;
  now?: Date;
  onSyncNow: (row: HeatmapRow & { value?: string }) => void;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const nowMs = (now ?? new Date()).getTime();
  const nowDate = now ?? new Date();
  const orderByRow = orderNumberByRow(scheduleConfig);

  const ordered = useMemo(() => {
    return [...rows].sort((a, b) => {
      const aOrder =
        orderByRow[a.id] ?? ADMIN_MANUAL_SYNC_ORDER_BY_ROW[a.id] ?? 999;
      const bOrder =
        orderByRow[b.id] ?? ADMIN_MANUAL_SYNC_ORDER_BY_ROW[b.id] ?? 999;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return a.label.localeCompare(b.label);
    });
  }, [rows, orderByRow]);

  return (
    <div className="lg:hidden px-3 py-3 space-y-1.5">
      <p className="px-1 pb-1 font-mono text-[10px] uppercase tracking-[0.14em] text-charcoal/45">
        Sync heat map — tap red/yellow to expand
      </p>
      {ordered.map((row) => {
        const finished = finishedForRow(row, status);
        const err = errors[row.id];
        const isRunning =
          (row.actionId != null && runningId === row.actionId) ||
          (row.id === "incremental" &&
            Boolean(status?.incrementalLiveStatus || status?.incrementalLive));
        const incrementalHealth =
          row.id === "incremental"
            ? evaluateIncrementalHealth({
                scheduler: resolveJobScheduler(
                  scheduleConfig.jobs.incremental,
                ),
                heartbeatAt: status?.lastMlsSyncHeartbeat,
                finishedAt: finished,
                nowMs,
                liveInFlight: isRunning,
              })
            : null;
        const doorbellOnly =
          incrementalHealth?.processAlive === true &&
          isMlsSyncDoorbellError(err);

        let visual: Visual = "idle";
        if (isRunning || incrementalHealth?.inPull) visual = "running";
        else if (incrementalHealth) {
          visual = doorbellOnly
            ? incrementalHealth.row === "alert"
              ? "idle"
              : incrementalHealth.row
            : err
              ? "alert"
              : incrementalHealth.row;
        } else if (err) visual = "alert";
        else if (finished && row.id !== "latest-mls") visual = "ok";

        const orderNum =
          orderByRow[row.id] ?? ADMIN_MANUAL_SYNC_ORDER_BY_ROW[row.id];
        const orderLabel = adminSyncOrderDisplay(row.id, orderNum);
        const autoExpand = visual === "alert" || visual === "running";
        const open = expanded[row.id] ?? autoExpand;
        const age = formatAgeAgo(finished, nowMs);
        const started = startedForRow(row, status);
        const runElapsed = formatRunElapsed(started, finished, nowMs);
        const pauseJob =
          SCHEDULED_SYNC_JOB_BY_ROW[row.id as AdminSyncPanelRowId];
        const jobSchedule = pauseJob
          ? scheduleConfig.jobs[pauseJob]
          : null;
        const nextRunAt =
          status?.nextRuns && row.id in status.nextRuns
            ? status.nextRuns[row.id as AdminSyncPanelRowId] ?? null
            : null;
        const nextMs = parseIsoMs(nextRunAt);
        const nextOverdue = nextMs != null && nowMs > nextMs;
        const nextClock = nextRunAt
          ? nextOverdue
            ? formatAdminSyncTimeOnly(nextRunAt)
            : formatAdminNextSyncAt(nextRunAt, nowDate)
          : null;
        const nextCountdown = nextRunAt
          ? formatAdminNextSyncCountdown(nextRunAt, nowDate)
          : null;
        const freqLine = formatFrequencyLine(jobSchedule);
        const actionLabel =
          row.actionId != null
            ? ADMIN_SYNC_ACTIONS[row.actionId as AdminSyncActionId]?.label
            : null;

        const endBits = [
          finished ? formatAdminSyncTimeOnly(finished) : "—",
          runElapsed && !runElapsed.endsWith(" in") ? runElapsed : null,
          finished ? age : null,
          runElapsed?.endsWith(" in") ? runElapsed : null,
        ].filter(Boolean);
        const nextBits = nextRunAt
          ? [
              nextClock,
              nextOverdue ? "overdue" : nextCountdown !== nextClock ? nextCountdown : null,
            ].filter(Boolean)
          : [];

        return (
          <div
            key={row.id}
            className={`rounded-xl border ${rowShellClass(visual)}`}
          >
            <button
              type="button"
              className="flex w-full items-start gap-2 px-3 py-2.5 text-left"
              onClick={() =>
                setExpanded((prev) => ({
                  ...prev,
                  [row.id]: !(prev[row.id] ?? autoExpand),
                }))
              }
            >
              <span
                className={`mt-1.5 inline-flex h-2.5 w-2.5 shrink-0 rounded-full ${chipClass(visual)}`}
                aria-hidden
              />
              {orderLabel ? (
                <span className="mt-0.5 font-mono text-[10px] font-bold text-navy/70 w-6 shrink-0">
                  {orderLabel}
                </span>
              ) : (
                <span className="w-6 shrink-0" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-navy">
                  {row.label.replace(/\s*\(3[ab]\)$/, "")}
                </span>
                <span className="mt-0.5 block font-mono text-[10px] leading-snug text-charcoal/60">
                  End {endBits.join(" · ")}
                </span>
                {nextBits.length > 0 || freqLine ? (
                  <span
                    className={`mt-0.5 block font-mono text-[10px] leading-snug ${
                      nextOverdue ? "text-coral/80" : "text-charcoal/55"
                    }`}
                  >
                    {nextBits.length > 0
                      ? `Next ${nextBits.join(" · ")}`
                      : null}
                    {nextBits.length > 0 && freqLine ? " · " : null}
                    {freqLine}
                  </span>
                ) : null}
              </span>
              <span className="mt-0.5 shrink-0 font-mono text-[10px] text-charcoal/35">
                {open ? "▾" : "▸"}
              </span>
            </button>
            {open ? (
              <div className="border-t border-charcoal/10 px-3 py-2.5 space-y-2">
                <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                  <div>
                    <p className="font-mono text-[8px] uppercase tracking-[0.12em] text-charcoal/40">
                      End
                    </p>
                    <p className="font-mono text-[11px] text-navy">
                      {finished ? formatAdminSyncTimeOnly(finished) : "—"}
                    </p>
                    {finished ? (
                      <p className="font-mono text-[10px] text-charcoal/50">
                        {age}
                      </p>
                    ) : null}
                  </div>
                  <div>
                    <p className="font-mono text-[8px] uppercase tracking-[0.12em] text-charcoal/40">
                      Elapsed
                    </p>
                    <p className="font-mono text-[11px] text-navy">
                      {runElapsed
                        ? runElapsed.endsWith(" in")
                          ? runElapsed.replace(/ in$/, " in flight")
                          : runElapsed
                        : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="font-mono text-[8px] uppercase tracking-[0.12em] text-charcoal/40">
                      Next start
                    </p>
                    <p
                      className={`font-mono text-[11px] ${
                        nextOverdue ? "text-coral" : "text-navy"
                      }`}
                    >
                      {nextClock ?? "—"}
                    </p>
                    {nextRunAt && nextCountdown && nextCountdown !== nextClock ? (
                      <p
                        className={`font-mono text-[10px] ${
                          nextOverdue ? "text-coral/80" : "text-charcoal/50"
                        }`}
                      >
                        {nextOverdue ? "Overdue" : nextCountdown}
                      </p>
                    ) : null}
                  </div>
                  <div>
                    <p className="font-mono text-[8px] uppercase tracking-[0.12em] text-charcoal/40">
                      Frequency
                    </p>
                    <p className="font-mono text-[11px] leading-snug text-navy">
                      {freqLine ?? "—"}
                    </p>
                  </div>
                </div>
                {row.detail ? (
                  <p className="text-[11px] leading-snug text-charcoal/60">
                    {row.detail}
                  </p>
                ) : null}
                {err ? (
                  <p className="font-mono text-[10px] leading-snug text-rose-800 whitespace-pre-wrap">
                    {err}
                  </p>
                ) : null}
                {row.id === "incremental" && status?.lastMlsSyncHeartbeat ? (
                  <p className="font-mono text-[10px] text-charcoal/65">
                    Railway heartbeat{" "}
                    {formatAgeAgo(status.lastMlsSyncHeartbeat, nowMs)}
                    {incrementalHealth?.prefix
                      ? ` · ${incrementalHealth.prefix}`
                      : ""}
                    {status.lastIncrementalUpsertsLabel
                      ? ` · ${status.lastIncrementalUpsertsLabel}`
                      : ""}
                  </p>
                ) : null}
                {row.actionId ? (
                  <button
                    type="button"
                    disabled={isRunning}
                    onClick={() => onSyncNow(row)}
                    className="font-mono text-[8px] tracking-[0.1em] uppercase rounded-full px-2 py-0.5 border border-navy/20 text-navy bg-white disabled:opacity-40"
                  >
                    {isRunning
                      ? "Syncing"
                      : actionLabel
                        ? `Sync · ${actionLabel}`
                        : "Sync"}
                  </button>
                ) : null}
                {pauseJob ? (
                  <p className="font-mono text-[9px] text-charcoal/40">
                    Configure job: {pauseJob}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
