"use client";

import { useMemo, useState } from "react";
import type { AdminSyncActionId } from "@/lib/admin-sync-types";
import {
  ADMIN_MANUAL_SYNC_ORDER_BY_ROW,
  ADMIN_SYNC_ACTIONS,
} from "@/lib/admin-sync-types";
import {
  adminSyncOrderDisplay,
  type AdminSyncPanelRowId,
} from "@/lib/admin-sync-schedule-format";
import { SCHEDULED_SYNC_JOB_BY_ROW } from "@/lib/scheduled-sync-jobs";
import {
  evaluateIncrementalHealth,
  isMlsSyncDoorbellError,
} from "@/lib/incremental-sync-health";
import {
  orderNumberByRow,
  resolveJobScheduler,
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
  propertyAddressesSyncedAt?: string | null;
  visionAddressesSyncedAt?: string | null;
  zipBoundariesSyncedAt?: string | null;
  fomcLastSyncedAt?: string | null;
  cpiLastSyncedAt?: string | null;
  marketDigestLastSentAt?: string | null;
  stats: {
    lastFullSync: string | null;
    lastIncrementalSync: string | null;
    lastListingScores: string | null;
    lastListingEdgeScores?: string | null;
    lastStatsCache: string | null;
    lastDealOfTheDayCache: string | null;
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

export default function AdminSyncMobileHeatmap({
  rows,
  status,
  scheduleConfig,
  runningId,
  errors,
  onSyncNow,
}: {
  rows: HeatmapRow[];
  status: HeatmapStatus | null;
  scheduleConfig: SyncScheduleConfig;
  runningId: string | null;
  errors: Record<string, string | undefined>;
  onSyncNow: (row: HeatmapRow & { value?: string }) => void;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const nowMs = Date.now();
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
        const pauseJob =
          SCHEDULED_SYNC_JOB_BY_ROW[row.id as AdminSyncPanelRowId];
        const actionLabel =
          row.actionId != null
            ? ADMIN_SYNC_ACTIONS[row.actionId as AdminSyncActionId]?.label
            : null;

        return (
          <div
            key={row.id}
            className={`rounded-xl border ${rowShellClass(visual)}`}
          >
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
              onClick={() =>
                setExpanded((prev) => ({
                  ...prev,
                  [row.id]: !(prev[row.id] ?? autoExpand),
                }))
              }
            >
              <span
                className={`inline-flex h-2.5 w-2.5 shrink-0 rounded-full ${chipClass(visual)}`}
                aria-hidden
              />
              {orderLabel ? (
                <span className="font-mono text-[10px] font-bold text-navy/70 w-6 shrink-0">
                  {orderLabel}
                </span>
              ) : (
                <span className="w-6 shrink-0" />
              )}
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-navy">
                {row.label.replace(/\s*\(3[ab]\)$/, "")}
              </span>
              <span className="shrink-0 font-mono text-[10px] text-charcoal/55">
                {age}
              </span>
              <span className="shrink-0 font-mono text-[10px] text-charcoal/35">
                {open ? "▾" : "▸"}
              </span>
            </button>
            {open ? (
              <div className="border-t border-charcoal/10 px-3 py-2.5 space-y-2">
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
                    className="font-mono text-[10px] tracking-[0.12em] uppercase rounded-full px-3 py-1.5 border border-navy/20 text-navy bg-white disabled:opacity-40"
                  >
                    {isRunning
                      ? "Running…"
                      : actionLabel
                        ? `Sync now · ${actionLabel}`
                        : "Sync now"}
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
