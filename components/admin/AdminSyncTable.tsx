"use client";

import { useCallback, useEffect, useState } from "react";
import type { AdminSyncActionId, AdminDatabaseSyncStats, FullResyncFinalizeStepId } from "@/lib/admin-sync-types";
import {
  ADMIN_SYNC_ACTIONS,
  ADMIN_SYNC_ALL_CLIENT_STEPS,
  ADMIN_MANUAL_SYNC_ORDER_BY_ROW,
  ADMIN_SYNC_STEPS_AFTER_BACKGROUND_FULL,
  FULL_RESYNC_FINALIZE_STEPS,
} from "@/lib/admin-sync-types";
import type { AdminSyncPanelRowId } from "@/lib/admin-sync-schedule-format";
import { formatAdminNextSyncAt, formatAdminNextSyncCountdown } from "@/lib/admin-sync-schedule-format";
import type { AdminSyncScheduleHints } from "@/lib/admin-sync-schedule";
import { adminSyncImpactedPages } from "@/lib/admin-sync-pages";
import { formatBytes } from "@/lib/sqlite-schema-diagram-types";
import Link from "next/link";
import { TMRE_TOWNS } from "@/lib/tmre-towns";
import {
  formatFullResyncTownPending,
  formatFullResyncFinalizeStepPending,
} from "@/lib/admin-sync-progress";

function formatSyncDescription(message?: string, detail?: string): string | undefined {
  if (!message && !detail) return undefined;
  if (message && detail && message !== detail) return `${message} — ${detail}`;
  return message ?? detail;
}

function formatSyncError(
  res: Response,
  body: Pick<AdminSyncPostBody, "detail" | "error" | "message">,
  context?: string,
): string {
  const parts: string[] = [];
  if (context) parts.push(context);
  if (res.status) parts.push(`HTTP ${res.status}`);
  const detail = body.detail?.trim() || body.error?.trim() || body.message?.trim();
  if (detail) parts.push(detail);
  else if (!res.ok) parts.push(res.statusText || "Request failed");
  return parts.join(" · ");
}

function isSyncErrorText(text: string | undefined): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  return (
    lower.includes("fail") ||
    lower.includes("blocked") ||
    lower.includes("stopped") ||
    lower.includes("timeout") ||
    lower.includes("http 5") ||
    lower.includes("gateway") ||
    lower.includes("html error")
  );
}

async function postAdminSync(
  body: Record<string, unknown>,
): Promise<{ res: Response; body: AdminSyncPostBody }> {
  const res = await fetch("/api/admin/sync", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const parsed = await readAdminSyncPostResponse(res);
  return { res, body: parsed };
}

async function runFullResyncChunked(
  row: AdminSyncRow,
  hooks: {
    setRunningId: (id: AdminSyncActionId | "sync-all-caches" | null) => void;
    setDescriptions: React.Dispatch<React.SetStateAction<Partial<Record<string, string>>>>;
    setMessages: React.Dispatch<React.SetStateAction<Partial<Record<string, string>>>>;
    setErrors: React.Dispatch<React.SetStateAction<Partial<Record<string, string>>>>;
    setRunTimings: React.Dispatch<React.SetStateAction<Partial<Record<string, SyncTiming>>>>;
    setStatus: React.Dispatch<React.SetStateAction<PanelStatus | null>>;
    setRefreshing: React.Dispatch<React.SetStateAction<boolean>>;
    refreshStatus: () => Promise<void>;
    runningId: AdminSyncActionId | "sync-all-caches" | null;
  },
): Promise<boolean> {
  if (hooks.runningId) return false;
  const startedAt = new Date().toISOString();
  hooks.setRunningId("full-resync");
  hooks.setMessages((prev) => ({ ...prev, [row.id]: undefined }));
  hooks.setErrors((prev) => ({ ...prev, [row.id]: undefined }));
  hooks.setDescriptions((prev) => ({ ...prev, [row.id]: undefined }));
  hooks.setRunTimings((prev) => ({
    ...prev,
    [row.id]: { started: startedAt, finished: null },
  }));

  let sqliteTotal: number | null = null;

  try {
    for (let i = 0; i < TMRE_TOWNS.length; i++) {
      const town = TMRE_TOWNS[i];
      hooks.setDescriptions((prev) => ({
        ...prev,
        [row.id]: formatFullResyncTownPending({
          town,
          townIndex: i + 1,
          townCount: TMRE_TOWNS.length,
          sqliteTotal,
        }),
      }));
      const { res, body } = await postAdminSync({ action: "full-resync", town });
      if (!res.ok || body.ok === false) {
        const errText = formatSyncError(
          res,
          body,
          `${town} (town ${i + 1}/${TMRE_TOWNS.length})`,
        );
        hooks.setErrors((prev) => ({ ...prev, [row.id]: errText }));
        hooks.setDescriptions((prev) => ({
          ...prev,
          [row.id]: `Failed while syncing ${town}`,
        }));
        hooks.setRunTimings((prev) => ({
          ...prev,
          [row.id]: {
            started: body.startedAt ?? startedAt,
            finished: body.finishedAt ?? new Date().toISOString(),
          },
        }));
        return false;
      }
      hooks.setStatus((prev) =>
        body.stats
          ? {
              ...(prev ?? {
                refreshing: false,
                lastRefreshFinished: null,
                lastRefreshStarted: null,
                latestListingUpdate: null,
                stats: body.stats,
              }),
              stats: body.stats,
              refreshing: Boolean(body.refreshing ?? prev?.refreshing),
            }
          : prev,
      );
      sqliteTotal = body.stats?.total ?? sqliteTotal;
      hooks.setDescriptions((prev) => ({
        ...prev,
        [row.id]:
          body.detail ??
          formatSyncDescription(body.message, undefined) ??
          `${town} synced`,
      }));
    }

    // Finalize runs as one POST per step (mirrors the per-town chunking above) so each request
    // stays well under serverless Lambda timeouts. Steps already marked complete (from a prior
    // partial failure) are skipped so a retry resumes rather than restarts from scratch.
    const stepCount = FULL_RESYNC_FINALIZE_STEPS.length;
    let finalizeStepsCompleted: string[] = [];
    let finish: AdminSyncPostBody | null = null;
    let finishRes: Response | null = null;

    for (let i = 0; i < FULL_RESYNC_FINALIZE_STEPS.length; i++) {
      const stepId: FullResyncFinalizeStepId = FULL_RESYNC_FINALIZE_STEPS[i];
      const stepIndex = i + 1;
      if (finalizeStepsCompleted.includes(stepId)) continue;

      hooks.setDescriptions((prev) => ({
        ...prev,
        [row.id]: formatFullResyncFinalizeStepPending({ stepId, stepIndex, stepCount }),
      }));
      const { res, body } = await postAdminSync({
        action: "full-resync",
        finalizeStep: stepId,
      });
      finishRes = res;
      finish = body;
      finalizeStepsCompleted = body.finalizeStepsCompleted ?? finalizeStepsCompleted;

      if (!res.ok || body.ok === false) {
        const errText = formatSyncError(
          res,
          body,
          `Finalize step ${stepIndex}/${stepCount} (${stepId})`,
        );
        hooks.setErrors((prev) => ({ ...prev, [row.id]: errText }));
        hooks.setDescriptions((prev) => ({
          ...prev,
          [row.id]: `Full resync finalize failed at step ${stepIndex}/${stepCount} (${stepId})`,
        }));
        hooks.setRunTimings((prev) => ({
          ...prev,
          [row.id]: {
            started: body.startedAt ?? startedAt,
            finished: body.finishedAt ?? new Date().toISOString(),
          },
        }));
        return false;
      }

      if (body.stats) {
        hooks.setStatus((prev) =>
          prev
            ? {
                ...prev,
                stats: body.stats!,
                refreshing: Boolean(body.refreshing ?? prev.refreshing),
              }
            : null,
        );
      }
      if (stepIndex < stepCount) {
        hooks.setDescriptions((prev) => ({
          ...prev,
          [row.id]:
            formatSyncDescription(body.message, undefined) ??
            `Finalize step ${stepIndex}/${stepCount} complete`,
        }));
      }
    }

    if (!finish || !finishRes) {
      // All finalize steps were already marked complete (e.g. a stale resume) — nothing to run.
      return true;
    }

    hooks.setRefreshing(Boolean(finish.refreshing));
    const ok = finishRes.ok && finish.ok !== false;
    hooks.setRunTimings((prev) => ({
      ...prev,
      [row.id]: {
        started: finish!.startedAt ?? startedAt,
        finished: ok ? (finish!.finishedAt ?? new Date().toISOString()) : new Date().toISOString(),
      },
    }));
    if (ok) {
      hooks.setErrors((prev) => ({ ...prev, [row.id]: undefined }));
      hooks.setMessages((prev) => ({ ...prev, [row.id]: finish!.message ?? "Complete" }));
      hooks.setDescriptions((prev) => ({
        ...prev,
        [row.id]:
          formatSyncDescription(finish!.message, finish!.detail) ??
          finish!.message ??
          "Full resync complete",
      }));
    } else {
      hooks.setErrors((prev) => ({
        ...prev,
        [row.id]: formatSyncError(finishRes!, finish!, "Finalize full resync"),
      }));
      hooks.setDescriptions((prev) => ({
        ...prev,
        [row.id]: "Full resync finalize failed",
      }));
    }
    return ok;
  } catch (err) {
    const errText = err instanceof Error ? err.message : "Sync failed";
    hooks.setErrors((prev) => ({ ...prev, [row.id]: errText }));
    hooks.setDescriptions((prev) => ({
      ...prev,
      [row.id]: "Full resync interrupted",
    }));
    hooks.setRunTimings((prev) => ({
      ...prev,
      [row.id]: { started: startedAt, finished: new Date().toISOString() },
    }));
    return false;
  } finally {
    hooks.setRunningId(null);
    void hooks.refreshStatus();
  }
}

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
  total: number;
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
  scheduleHints?: AdminSyncScheduleHints;
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
  databaseStats?: AdminDatabaseSyncStats[];
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

type AdminSyncPostBody = PanelStatus & {
  ok?: boolean;
  message?: string;
  detail?: string;
  recordsFetched?: number;
  error?: string;
  backgroundQueued?: boolean;
  startedAt?: string;
  finishedAt?: string;
  finalizeStepsCompleted?: string[];
  steps?: {
    ok: boolean;
    action: AdminSyncActionId;
    message: string;
    stepLabel?: string;
    startedAt?: string;
    finishedAt?: string;
  }[];
};

async function readAdminSyncPostResponse(res: Response): Promise<AdminSyncPostBody> {
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    const text = await res.text();
    const html = text.trimStart().startsWith("<");
    const error = html
      ? "Gateway timeout or server error (HTML response — sync step likely exceeded the Lambda time limit). Retry this row or run towns individually."
      : text.slice(0, 240) || `Unexpected response (${res.status})`;
    return { ok: false, error, message: error } as AdminSyncPostBody;
  }
  const body = (await res.json()) as AdminSyncPostBody;
  if (!res.ok && body.ok !== false) body.ok = false;
  return body;
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
  error?: string;
  nowMs: number;
}): SyncRowVisualStatus {
  const { row, timing, nextRunAt, status, isRunning, syncAllRunning, error, nowMs } = options;

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

  const failed = isSyncErrorText(error);
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
    <p className="min-w-0 font-mono text-[10px] tracking-[0.08em] uppercase leading-snug">
      {pages.map((page, index) => (
        <span key={page.href}>
          <Link
            href={page.href}
            className="text-navy/70 hover:text-gold transition-colors"
          >
            {page.label}
          </Link>
          {index < pages.length - 1 ? <span className="text-charcoal/40">, </span> : null}
        </span>
      ))}
    </p>
  );
}

const TH =
  "px-4 py-2.5 text-left font-mono text-[10px] tracking-[0.14em] uppercase text-charcoal/40 border-r border-b border-transparent bg-cream/30 whitespace-nowrap";
const TD =
  "px-4 py-3 align-top text-left border-r border-b border-transparent last:border-r-0";

export default function AdminSyncTable({
  rows,
  initialRefreshing,
  initialDatabaseStats,
}: {
  rows: AdminSyncRow[];
  initialRefreshing: boolean;
  initialDatabaseStats: AdminDatabaseSyncStats[];
}) {
  const [status, setStatus] = useState<PanelStatus | null>(null);
  const [databaseStats, setDatabaseStats] = useState(initialDatabaseStats);
  const [refreshing, setRefreshing] = useState(initialRefreshing);
  const [runningId, setRunningId] = useState<AdminSyncActionId | "sync-all-caches" | null>(
    null,
  );
  const [messages, setMessages] = useState<Partial<Record<string, string>>>({});
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [descriptions, setDescriptions] = useState<Partial<Record<string, string>>>({});
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
    if (body.databaseStats) setDatabaseStats(body.databaseStats);
  }, []);

  useEffect(() => {
    void refreshStatus();
    const pollMs = refreshing || runningId != null ? 5_000 : 60_000;
    const id = window.setInterval(() => void refreshStatus(), pollMs);
    return () => window.clearInterval(id);
  }, [refreshStatus, refreshing, runningId]);

  const runSync = useCallback(
    async (row: AdminSyncRow) => {
      const actionId = row.actionId;
      if (!actionId || runningId) return;
      if (actionId === "full-resync") {
        await runFullResyncChunked(row, {
          setRunningId,
          setDescriptions,
          setMessages,
          setErrors,
          setRunTimings,
          setStatus,
          setRefreshing,
          refreshStatus,
          runningId,
        });
        return;
      }

      const startedAt = new Date().toISOString();
      setRunningId(actionId);
      setMessages((prev) => ({ ...prev, [row.id]: undefined }));
      setErrors((prev) => ({ ...prev, [row.id]: undefined }));
      setDescriptions((prev) => ({
        ...prev,
        [row.id]: `${ADMIN_SYNC_ACTIONS[actionId]?.description ?? row.label}…`,
      }));
      setRunTimings((prev) => ({
        ...prev,
        [row.id]: { started: startedAt, finished: null },
      }));

      try {
        const res = await fetch("/api/admin/sync", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: actionId }),
        });
        const body = await readAdminSyncPostResponse(res);

        if (!res.ok || body.ok === false) {
          const errText = formatSyncError(res, body, row.label);
          setErrors((prev) => ({ ...prev, [row.id]: errText }));
          setRunTimings((prev) => ({
            ...prev,
            [row.id]: {
              started: body.startedAt ?? startedAt,
              finished: body.finishedAt ?? new Date().toISOString(),
            },
          }));
          return;
        }

        setErrors((prev) => ({ ...prev, [row.id]: undefined }));
        setStatus(body);
        setRefreshing(body.refreshing);
        if (body.databaseStats) setDatabaseStats(body.databaseStats);
        const queued = Boolean(body.backgroundQueued);
        setRunTimings((prev) => ({
          ...prev,
          [row.id]: {
            started: body.startedAt ?? startedAt,
            finished: queued ? null : (body.finishedAt ?? new Date().toISOString()),
          },
        }));
        setMessages((prev) => ({
          ...prev,
          [row.id]: body.message ?? "Complete",
        }));
        setDescriptions((prev) => ({
          ...prev,
          [row.id]:
            formatSyncDescription(body.message, body.detail) ??
            body.message ??
            row.detail ??
            "",
        }));
      } catch (err) {
        setErrors((prev) => ({
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
    setErrors({});
    setRunTimings({});

    let skipChainedAfterFull = false;
    let completed = 0;
    const totalSteps = ADMIN_SYNC_ALL_CLIENT_STEPS.length;
    let currentRowId: string | null = null;

    try {
      for (const actionId of ADMIN_SYNC_ALL_CLIENT_STEPS) {
        if (skipChainedAfterFull && ADMIN_SYNC_STEPS_AFTER_BACKGROUND_FULL.has(actionId)) {
          continue;
        }

        if (actionId === "full-resync") {
          const row = rows.find((r) => r.actionId === "full-resync");
          if (!row) continue;
          completed += 1;
          setSyncAllSummary(`Step ${completed}/${totalSteps}: Full resync (town-by-town)…`);
          const ok = await runFullResyncChunked(row, {
            setRunningId,
            setDescriptions,
            setMessages,
            setErrors,
            setRunTimings,
            setStatus,
            setRefreshing,
            refreshStatus,
            runningId: "sync-all-caches",
          });
          if (!ok) {
            setSyncAllSummary("Sync all stopped during full resync");
            return;
          }
          continue;
        }

        completed += 1;
        const rowId = ACTION_ROW_ID[actionId];
        currentRowId = rowId ?? null;
        const label = ADMIN_SYNC_ACTIONS[actionId]?.label ?? actionId;
        setSyncAllSummary(`Step ${completed}/${totalSteps}: ${label}…`);

        const startedAt = new Date().toISOString();
        if (rowId) {
          setRunTimings((prev) => ({
            ...prev,
            [rowId]: { started: startedAt, finished: null },
          }));
        }

        const res = await fetch("/api/admin/sync", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: actionId }),
        });
        const body = await readAdminSyncPostResponse(res);

        if (!res.ok || body.ok === false) {
          if (rowId) {
            setErrors((prev) => ({
              ...prev,
              [rowId]: formatSyncError(res, body, label),
            }));
            setRunTimings((prev) => ({
              ...prev,
              [rowId]: {
                started: body.startedAt ?? startedAt,
                finished: body.finishedAt ?? new Date().toISOString(),
              },
            }));
          }
          setSyncAllSummary(`Sync all stopped at ${label}: ${formatSyncError(res, body)}`);
          return;
        }

        if (rowId) {
          setErrors((prev) => ({ ...prev, [rowId]: undefined }));
          setMessages((prev) => ({ ...prev, [rowId]: body.message ?? "Complete" }));
          setDescriptions((prev) => ({
            ...prev,
            [rowId]:
              formatSyncDescription(body.message, body.detail) ??
              body.message ??
              rows.find((r) => r.id === rowId)?.detail ??
              "",
          }));
          const queued = Boolean(body.backgroundQueued);
          setRunTimings((prev) => ({
            ...prev,
            [rowId]: {
              started: body.startedAt ?? startedAt,
              finished: queued ? null : (body.finishedAt ?? new Date().toISOString()),
            },
          }));
        }

        setStatus(body);
        setRefreshing(body.refreshing);
        if (body.databaseStats) setDatabaseStats(body.databaseStats);

        if (body.backgroundQueued) {
          skipChainedAfterFull = true;
        }
      }

      setSyncAllSummary("Sync all complete");
    } catch (err) {
      const errText = err instanceof Error ? err.message : "Sync all failed";
      setSyncAllSummary(errText);
      if (currentRowId) {
        setErrors((prev) => ({ ...prev, [currentRowId!]: errText }));
      }
    } finally {
      setRunningId(null);
      void refreshStatus();
    }
  }, [runningId, refreshStatus, rows]);

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
          Sync all runs steps 1→5 automatically. For manual runs, use the Order column and
          sync each row in sequence (step 6 is weekly property addresses).
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
      <div className="px-5 sm:px-6 py-4 border-b border-charcoal/[0.08] bg-white">
        <p className="font-mono text-[10px] tracking-[0.16em] uppercase text-charcoal/50 mb-3">
          SQLite inventory
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse">
            <thead>
              <tr>
                <th className={`${TH} border-charcoal/[0.08]`}>Database</th>
                <th className={`${TH} border-charcoal/[0.08]`}>File</th>
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
                      className="font-mono text-[11px] text-slate break-all"
                      title={db.path}
                    >
                      {db.path}
                    </p>
                    <p className="mt-0.5 font-mono text-[10px] tabular-nums text-charcoal/45">
                      {formatBytes(db.sizeBytes)}
                      {db.exists ? "" : " · missing"}
                    </p>
                    {db.error ? (
                      <p className="mt-1 font-mono text-[10px] text-coral leading-snug">
                        {db.error}
                      </p>
                    ) : null}
                  </td>
                  <td className={`${TD} border-charcoal/[0.06] border-r-0`}>
                    <p className="text-sm text-slate leading-snug">{db.summary}</p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1280px] border-collapse table-fixed">
          <colgroup>
            <col className="w-[3rem]" />
            <col className="w-[7.5rem]" />
            <col className="w-[9.5rem]" />
            <col />
            <col className="w-[7rem]" />
            <col className="w-[10.5rem]" />
            <col className="w-[10.5rem]" />
            <col className="w-[11rem]" />
            <col className="w-[14rem]" />
          </colgroup>
          <thead>
            <tr>
              <th className={TH}>Order</th>
              <th className={TH}>Action</th>
              <th className={TH}>Sync</th>
              <th className={TH}>Description</th>
              <th className={TH}>Pages</th>
              <th className={TH}>Start</th>
              <th className={TH}>End</th>
              <th className={TH}>Next scheduled</th>
              <th className={`${TH} border-r-0`}>Errors</th>
            </tr>
          </thead>
          <tbody>
            {[...rows]
              .sort((a, b) => {
                const aFinished = parseIsoMs(
                  (runTimings[a.id] ?? timingForRow(a, status)).finished,
                );
                const bFinished = parseIsoMs(
                  (runTimings[b.id] ?? timingForRow(b, status)).finished,
                );
                return (bFinished ?? -Infinity) - (aFinished ?? -Infinity);
              })
              .map((row, index) => {
              const isRunning = row.actionId != null && runningId === row.actionId;
              const rowError = errors[row.id];
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
                error: rowError,
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
              const manualOrder = ADMIN_MANUAL_SYNC_ORDER_BY_ROW[row.id];

              return (
                <tr
                  key={row.id}
                  className={`transition-colors duration-500 ${syncRowClassName(visual, index % 2 === 1)}`}
                >
                  <td className={TD}>
                    {manualOrder != null ? (
                      <span
                        className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-navy/15 bg-white font-mono text-xs font-bold tabular-nums text-navy"
                        title={`Manual sync step ${manualOrder}`}
                      >
                        {manualOrder}
                      </span>
                    ) : (
                      <span className="font-mono text-[10px] tracking-wide text-charcoal/30">—</span>
                    )}
                  </td>
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
                    {(() => {
                      const liveDescription = descriptions[row.id];
                      const descText = liveDescription ?? row.detail ?? "";
                      const descBusy = Boolean(liveDescription) || isRunning || syncAllRunning;
                      return (
                        <>
                          <p
                            className={`text-sm leading-snug ${
                              descBusy ? "text-navy font-medium" : "text-slate"
                            }`}
                          >
                            {descText}
                          </p>
                        </>
                      );
                    })()}
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
                  <td className={TD}>
                    <p
                      className={`font-mono text-xs tabular-nums font-semibold whitespace-nowrap ${
                        visual === "alert" && nextRunAt && nowMs > (parseIsoMs(nextRunAt) ?? 0)
                          ? "text-rose-700"
                          : "text-navy"
                      }`}
                    >
                      {row.id === "full-resync" &&
                      status?.scheduleHints?.fullResyncSource === "post-deploy"
                        ? formatAdminNextSyncCountdown(nextRunAt, now)
                        : formatAdminNextSyncAt(nextRunAt, now)}
                    </p>
                    {row.id === "full-resync" &&
                    status?.scheduleHints?.fullResyncSource === "post-deploy" ? (
                      <p className="mt-0.5 font-mono text-[9px] tracking-wide text-gold uppercase">
                        Post-deploy warm
                      </p>
                    ) : visual === "alert" ? (
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
                  <td className={`${TD} border-r-0`}>
                    {rowError ? (
                      <p className="font-mono text-[10px] leading-snug text-coral break-words">
                        {rowError}
                      </p>
                    ) : (
                      <span className="font-mono text-[10px] text-charcoal/30">—</span>
                    )}
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
