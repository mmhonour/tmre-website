"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { AdminSyncActionId, FullResyncFinalizeStepId } from "@/lib/admin-sync-types";
import {
  ADMIN_SYNC_ACTIONS,
  ADMIN_MANUAL_SYNC_ORDER_BY_ROW,
  ADMIN_SYNC_STEPS_AFTER_BACKGROUND_FULL,
  FULL_RESYNC_FINALIZE_STEPS,
} from "@/lib/admin-sync-types";
import AdminSyncMobileHeatmap from "@/components/admin/AdminSyncMobileHeatmap";
import type { AdminSyncPanelRowId } from "@/lib/admin-sync-schedule-format";
import {
  adminSyncOrderDisplay,
  formatAdminNextSyncAt,
  formatAdminNextSyncCountdown,
} from "@/lib/admin-sync-schedule-format";
import type { AdminSyncScheduleHints } from "@/lib/admin-sync-schedule";
import { adminSyncImpactedPages } from "@/lib/admin-sync-pages";
import type { IncrementalSyncLiveProgress } from "@/lib/incremental-sync-live-shared";
import { formatIncrementalSyncLiveStatus } from "@/lib/incremental-sync-live-shared";
import { SCHEDULED_SYNC_JOB_BY_ROW } from "@/lib/scheduled-sync-jobs";
import {
  emptyScheduledSyncPausedJobs,
  type ScheduledSyncJobId,
  type ScheduledSyncPausedJobs,
} from "@/lib/scheduled-sync-jobs-shared";
import {
  nextPracticalTakeHoldIso,
  syncNextOverrideStepMs,
  type SyncNextOverrides,
} from "@/lib/sync-next-override-shared";
import {
  SYNC_SCHEDULE_FREQUENCIES,
  SYNC_SCHEDULE_WEEKDAYS,
  SYNC_SCHEDULER_PROVIDERS,
  defaultSyncScheduleConfig,
  frequencyIntervalMs,
  frequencyLabel,
  orderNumberByRow,
  resolveJobScheduler,
  resolveWeekdayEt,
  schedulerProviderLabel,
  syncAllClientStepsFromConfig,
  type SyncScheduleConfig,
  type SyncScheduleFrequencyId,
  type SyncScheduleWeekdayEt,
  type SyncSchedulerProvider,
} from "@/lib/sync-schedule-config-shared";
import {
  TMRE_SYNC_SCHEDULE_CHANGED,
  dispatchSyncScheduleChanged,
} from "@/lib/admin-schedule-events";
import Link from "next/link";
import { TMRE_TOWNS } from "@/lib/tmre-towns";
import {
  formatFullResyncTownPending,
  formatFullResyncFinalizeStepPending,
  groupTownResultsByBucket,
} from "@/lib/admin-sync-progress";
import { formatTownCountsGlom } from "@/lib/admin-sync-history-glom";

function emptyPausedJobs(): ScheduledSyncPausedJobs {
  return emptyScheduledSyncPausedJobs();
}

/** Client FIFO of Sync now / Sync all clicks while another job is in flight. */
type SyncQueueItem =
  | {
      kind: "action";
      rowId: string;
      actionId: AdminSyncActionId;
      label: string;
    }
  | { kind: "sync-all" };

function formatWaitingStatus(blockerLabel: string): string {
  return `Waiting for ${blockerLabel} to finish`;
}

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
  // Newline-separated so the admin error reads as: Town / error type / description
  // on their own lines (rendered with whitespace-pre-line).
  return parts.join("\n");
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
    lower.includes("html error") ||
    lower.includes("will retry")
  );
}

/** Initial attempt + 2 automatic retries after failure. */
const SYNC_MAX_ATTEMPTS = 3;
const SYNC_RETRY_DELAY_MS = 60_000;

type PendingSyncRetry = {
  baseError: string;
  retryAtMs: number;
  attemptsLeft: number;
};

function formatRetryClock(ms: number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(ms));
}

function formatAttemptsLeftPhrase(attemptsLeft: number): string {
  return attemptsLeft === 1 ? "1x more time" : `${attemptsLeft}x more times`;
}

/** Error text plus the auto-retry notice (live countdown when `nowMs` is passed). */
function formatErrorWithRetry(
  baseError: string,
  retryAtMs: number,
  attemptsLeft: number,
  nowMs = Date.now(),
): string {
  const secs = Math.max(0, Math.ceil((retryAtMs - nowMs) / 1000));
  const inPhrase =
    secs <= 0
      ? "momentarily"
      : secs === 1
        ? "in 1 second"
        : `in ${secs} seconds`;
  return (
    `${baseError}\n\n` +
    `Will retry ${inPhrase} at ${formatRetryClock(retryAtMs)} — ${formatAttemptsLeftPhrase(attemptsLeft)}`
  );
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
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

/** One captured step of a sync run — surfaced in the Sync run log panel. */
export type SyncRunLogEntry = {
  id: string;
  label: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  status: string;
  error?: string;
};

/** Full latest-run snapshot (type + wall-clock bounds + per-step rows). */
export type SyncRunLogSnapshot = {
  syncType: string;
  startedAt: string;
  finishedAt: string | null;
  entries: SyncRunLogEntry[];
};

/** Payload broadcast on the window "admin-sync-run-log" event for the log panel. */
export type AdminSyncRunLogEvent = {
  snapshot: SyncRunLogSnapshot | null;
  running: boolean;
};

export const ADMIN_SYNC_RUN_LOG_EVENT = "admin-sync-run-log";
export const ADMIN_SYNC_RUN_LOG_STORAGE_KEY = "admin-sync-run-log";

/** Human duration, e.g. "1m 23s" / "4.2s" / "820ms". */
export function formatRunDuration(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const totalSeconds = ms / 1000;
  if (totalSeconds < 60) return `${totalSeconds.toFixed(1)}s`;
  const mins = Math.floor(totalSeconds / 60);
  const secs = Math.round(totalSeconds % 60);
  return `${mins}m ${secs}s`;
}

/** Compact local wall-clock for sync log timestamps. */
export function formatRunClock(iso: string | null | undefined): string {
  if (!iso) return "—";
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(ms));
}

/** Migrate older localStorage arrays into a snapshot shape. */
export function parseStoredSyncRunLog(raw: string): SyncRunLogSnapshot | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const entries = parsed as SyncRunLogEntry[];
      if (entries.length === 0) return null;
      return {
        syncType: "Previous sync",
        startedAt: entries[0]?.startedAt ?? new Date().toISOString(),
        finishedAt: entries[entries.length - 1]?.finishedAt ?? null,
        entries,
      };
    }
    if (
      parsed &&
      typeof parsed === "object" &&
      Array.isArray((parsed as SyncRunLogSnapshot).entries) &&
      typeof (parsed as SyncRunLogSnapshot).syncType === "string" &&
      typeof (parsed as SyncRunLogSnapshot).startedAt === "string"
    ) {
      return parsed as SyncRunLogSnapshot;
    }
  } catch {
    /* ignore */
  }
  return null;
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
    persistFinalStatus: (rowId: string, text: string) => void;
    appendRunLog: (entry: SyncRunLogEntry) => void;
  },
): Promise<{ ok: boolean; error?: string }> {
  if (hooks.runningId && hooks.runningId !== "sync-all-caches" && hooks.runningId !== "full-resync") {
    return { ok: false, error: "Another sync is already running" };
  }
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
  const completedTowns: string[] = [];

  try {
    for (let i = 0; i < TMRE_TOWNS.length; i++) {
      const town = TMRE_TOWNS[i];
      const townStartedAt = new Date().toISOString();
      const townT0 = Date.now();
      const townLabel = `Town ${i + 1}/${TMRE_TOWNS.length} · ${town}`;
      hooks.setDescriptions((prev) => ({
        ...prev,
        [row.id]: formatFullResyncTownPending({
          town,
          townIndex: i + 1,
          townCount: TMRE_TOWNS.length,
          sqliteTotal,
          completedTowns,
        }),
      }));
      const { res, body } = await postAdminSync({ action: "full-resync", town });
      if (!res.ok || body.ok === false) {
        const errText = formatSyncError(
          res,
          body,
          `${town} (town ${i + 1}/${TMRE_TOWNS.length})`,
        );
        const finalText = `Failed at ${town} (town ${i + 1}/${TMRE_TOWNS.length}) — use ↺ Retry`;
        hooks.setErrors((prev) => ({ ...prev, [row.id]: errText }));
        hooks.setDescriptions((prev) => ({ ...prev, [row.id]: finalText }));
        hooks.persistFinalStatus(row.id, finalText);
        hooks.appendRunLog({
          id: `${row.id}-town-${i}-${townT0}`,
          label: townLabel,
          startedAt: townStartedAt,
          finishedAt: new Date().toISOString(),
          durationMs: Date.now() - townT0,
          status: finalText,
          error: errText,
        });
        hooks.setRunTimings((prev) => ({
          ...prev,
          [row.id]: {
            started: body.startedAt ?? startedAt,
            finished: body.finishedAt ?? new Date().toISOString(),
          },
        }));
        return { ok: false, error: errText };
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
      completedTowns.push(town);
      const townStatus =
        body.detail ??
        formatSyncDescription(body.message, undefined) ??
        `${town} synced`;
      hooks.appendRunLog({
        id: `${row.id}-town-${i}-${townT0}`,
        label: townLabel,
        startedAt: townStartedAt,
        finishedAt: new Date().toISOString(),
        durationMs: Date.now() - townT0,
        status: townStatus,
      });
      hooks.setDescriptions((prev) => ({
        ...prev,
        [row.id]: townStatus,
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

      const stepStartedAt = new Date().toISOString();
      const stepT0 = Date.now();
      const stepLabel = `Finalize ${stepIndex}/${stepCount} · ${stepId}`;
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
        const finalText = `Finalize failed at step ${stepIndex}/${stepCount} (${stepId}) — use ↺ Retry`;
        hooks.setErrors((prev) => ({ ...prev, [row.id]: errText }));
        hooks.setDescriptions((prev) => ({ ...prev, [row.id]: finalText }));
        hooks.persistFinalStatus(row.id, finalText);
        hooks.appendRunLog({
          id: `${row.id}-finalize-${stepId}-${stepT0}`,
          label: stepLabel,
          startedAt: stepStartedAt,
          finishedAt: new Date().toISOString(),
          durationMs: Date.now() - stepT0,
          status: finalText,
          error: errText,
        });
        hooks.setRunTimings((prev) => ({
          ...prev,
          [row.id]: {
            started: body.startedAt ?? startedAt,
            finished: body.finishedAt ?? new Date().toISOString(),
          },
        }));
        return { ok: false, error: errText };
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
      hooks.appendRunLog({
        id: `${row.id}-finalize-${stepId}-${stepT0}`,
        label: stepLabel,
        startedAt: stepStartedAt,
        finishedAt: new Date().toISOString(),
        durationMs: Date.now() - stepT0,
        status:
          formatSyncDescription(body.message, body.detail) ??
          body.message ??
          `Finalize step ${stepIndex}/${stepCount} complete`,
      });
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
      return { ok: true };
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
      const finalText =
        formatSyncDescription(finish!.message, finish!.detail) ??
        finish!.message ??
        "Full resync complete";
      hooks.setErrors((prev) => ({ ...prev, [row.id]: undefined }));
      hooks.setMessages((prev) => ({ ...prev, [row.id]: finish!.message ?? "Complete" }));
      hooks.setDescriptions((prev) => ({ ...prev, [row.id]: finalText }));
      hooks.persistFinalStatus(row.id, finalText);
      return { ok: true };
    }

    const errText = formatSyncError(finishRes!, finish!, "Finalize full resync");
    const finalText = "Full resync finalize failed";
    hooks.setErrors((prev) => ({
      ...prev,
      [row.id]: errText,
    }));
    hooks.setDescriptions((prev) => ({ ...prev, [row.id]: finalText }));
    hooks.persistFinalStatus(row.id, finalText);
    return { ok: false, error: errText };
  } catch (err) {
    const errText = err instanceof Error ? err.message : "Sync failed";
    const finalText = "Full resync interrupted";
    hooks.setErrors((prev) => ({ ...prev, [row.id]: errText }));
    hooks.setDescriptions((prev) => ({ ...prev, [row.id]: finalText }));
    hooks.persistFinalStatus(row.id, finalText);
    hooks.setRunTimings((prev) => ({
      ...prev,
      [row.id]: { started: startedAt, finished: new Date().toISOString() },
    }));
    return { ok: false, error: errText };
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

/** Dashboard = run/status; Configure = pause + next-start override. */
export type AdminSyncTableMode = "dashboard" | "configure";

/** Derived / status-only rows — no Configure schedule editors. */
function configureScheduleHintForRow(rowId: string): string | null {
  switch (rowId) {
    case "latest-mls":
      return "Follows Incremental";
    case "refresh-finished":
      return "End of MLS refresh";
    default:
      return null;
  }
}

type SyncStats = {
  total: number;
  lastFullSync: string | null;
  lastFullSyncStarted: string | null;
  lastIncrementalSync: string | null;
  lastIncrementalSyncStarted: string | null;
  lastListingScores: string | null;
  lastListingScoresStarted: string | null;
  lastListingEdgeScores?: string | null;
  lastStatsCache: string | null;
  lastStatsCacheStarted: string | null;
  lastDealOfTheDayCache: string | null;
  lastDealOfTheDayCacheStarted: string | null;
};

type SyncTiming = {
  started: string | null;
  finished: string | null;
};

export type PanelStatus = {
  refreshing: boolean;
  lastRefreshFinished: string | null;
  lastRefreshStarted: string | null;
  latestListingUpdate: string | null;
  /** Last Netlify sync-listings cron tick (even when work was skipped). */
  lastIncrementalCronTick?: string | null;
  /** Last HTTP hit to eventbridge-sync-ingress for Incremental (incl. skips / 401). */
  lastEventbridgeIngressAt?: string | null;
  /** Outcome line: queued / skipped: … / unauthorized · HTTP n. */
  lastEventbridgeIngressResult?: string | null;
  /** Railway mls-sync process heartbeat (Neon). */
  lastMlsSyncHeartbeat?: string | null;
  propertyAddressesSyncedAt?: string | null;
  visionAddressesSyncedAt?: string | null;
  zipBoundariesSyncedAt?: string | null;
  zipBoundariesSyncStartedAt?: string | null;
  fomcLastSyncedAt?: string | null;
  cpiLastSyncedAt?: string | null;
  marketDigestLastSentAt?: string | null;
  stats: SyncStats;
  nextRuns?: Partial<Record<AdminSyncPanelRowId, string | null>>;
  /** Admin-set Next times that preempt the natural schedule. */
  nextOverrides?: SyncNextOverrides;
  scheduleHints?: AdminSyncScheduleHints;
  /** Configure Frequency / Start time / Order (persisted in sync_meta). */
  scheduleConfig?: SyncScheduleConfig;
  /** Real worker town progress (stamped in sync_meta during incremental). */
  incrementalLive?: IncrementalSyncLiveProgress | null;
  incrementalLiveStatus?: string | null;
  /** Durable step transcript from the last Incremental (queue → towns → finish). */
  incrementalStepLog?: {
    runId: string;
    source: string;
    startedAt: string;
    finishedAt: string | null;
    summary?: string;
    steps: { at: string; step: string; detail?: string }[];
  } | null;
  incrementalStepLogText?: string | null;
  latestFeedGeneratedAt?: string | null;
  latestFeedNewestMls?: string | null;
  latestFeedRowCount?: number | null;
  lastIncrementalUpsertsLabel?: string | null;
  lastIncrementalUpserts?: {
    finishedAt: string;
    upserted: number;
    inserted: number;
    updated: number;
    ok: boolean;
  } | null;
  incrementalUpsertHistory?: {
    finishedAt: string;
    upserted: number;
    inserted: number;
    updated: number;
    ok: boolean;
  }[];
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

/** Local-timezone calendar date string used only for equality comparisons. */
function isoCalendarDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatTimeOnly(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(d);
}

function formatDateShort(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(d);
}

/** Human-readable elapsed duration (e.g. `1m 12s`, `3s`, `2h 5m`). */
function formatElapsed(ms: number | null): string {
  if (ms == null || ms < 0) return "—";
  if (ms < 1000) return `${ms}ms`;
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const remSec = sec % 60;
  if (min < 60) return remSec > 0 ? `${min}m ${remSec}s` : `${min}m`;
  const hr = Math.floor(min / 60);
  const remMin = min % 60;
  return remMin > 0 ? `${hr}h ${remMin}m` : `${hr}h`;
}

type AdminSyncTownResult = {
  town: string;
  statusBucket: string;
  count: number;
  ok: boolean;
  error?: string;
  durationMs?: number;
};

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
  townResults?: AdminSyncTownResult[];
  steps?: {
    ok: boolean;
    action: AdminSyncActionId;
    message: string;
    stepLabel?: string;
    startedAt?: string;
    finishedAt?: string;
  }[];
};

const ADMIN_SYNC_RUN_TIMINGS_STORAGE_KEY = "admin-sync-run-timings";

/** One Latest-sync-steps line per status bucket (Active / Closed / Expired). */
function appendTownResultsByBucket(
  appendRunLog: (entry: SyncRunLogEntry) => void,
  options: {
    rowId: string;
    townResults: AdminSyncTownResult[];
    startedAt: string;
    finishedAt: string;
    durationMs: number;
    ok: boolean;
  },
): void {
  const groups = groupTownResultsByBucket(options.townResults);
  if (groups.length === 0) return;
  for (const group of groups) {
    const townsLabel = formatTownCountsGlom(group.towns);
    const errParts = group.towns
      .filter((t) => !t.ok && t.error)
      .map((t) => `${t.town}: ${t.error}`);
    appendRunLog({
      id: `${options.rowId}-${group.bucket}-${options.startedAt}`,
      label: group.bucket,
      startedAt: options.startedAt,
      finishedAt: options.finishedAt,
      durationMs: options.durationMs,
      status: `${townsLabel} · ${group.total.toLocaleString()} listings`,
      error:
        !options.ok || !group.ok
          ? errParts.join("\n") || (!group.ok ? `${group.bucket} had failures` : undefined)
          : undefined,
    });
  }
}

/** Map a panel row to the Latest sync steps snapshot syncType prefix. */
function runLogMatchesRow(row: AdminSyncRow, snapshot: SyncRunLogSnapshot): boolean {
  const type = snapshot.syncType.toLowerCase();
  if (row.id === "full-resync") return type.includes("full resync");
  if (row.id === "incremental") {
    return type.includes("incremental") || type.includes("sync now · incremental");
  }
  const label = (row.label ?? "").toLowerCase();
  if (label && type.includes(label)) return true;
  if (row.actionId && type.includes(row.actionId.replace(/-/g, " "))) return true;
  return false;
}

function timingWithLogFallback(
  row: AdminSyncRow,
  status: PanelStatus | null,
  runTimings: Partial<Record<string, SyncTiming>>,
  runSnapshot: SyncRunLogSnapshot | null,
): SyncTiming {
  const base = runTimings[row.id] ?? timingForRow(row, status);
  if (base.finished || !runSnapshot?.finishedAt) return base;
  if (!runLogMatchesRow(row, runSnapshot)) return base;
  return {
    started: base.started ?? runSnapshot.startedAt,
    finished: runSnapshot.finishedAt,
  };
}

/** After a rebuild, recover Status text from the Latest sync steps log. */
function statusTextFromRunLog(
  row: AdminSyncRow,
  snapshot: SyncRunLogSnapshot | null,
): string | undefined {
  if (!snapshot?.finishedAt || snapshot.entries.length === 0) return undefined;
  if (!runLogMatchesRow(row, snapshot)) return undefined;
  if (row.id === "incremental" || snapshot.entries.some((e) =>
    ["Active", "Closed", "Expired"].includes(e.label),
  )) {
    return snapshot.entries
      .map((e) => `${e.label}: ${e.status}`)
      .join(" · ");
  }
  return snapshot.entries[snapshot.entries.length - 1]?.status;
}

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
    case "edge-scores":
      return {
        started: null,
        finished: status.stats.lastListingEdgeScores ?? null,
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
    case "vision-addresses":
      return { started: null, finished: status.visionAddressesSyncedAt ?? null };
    case "zip-boundaries":
      return {
        started: status.zipBoundariesSyncStartedAt ?? null,
        finished: status.zipBoundariesSyncedAt ?? null,
      };
    case "fomc-sync":
      return { started: null, finished: status.fomcLastSyncedAt ?? null };
    case "cpi-sync":
      return { started: null, finished: status.cpiLastSyncedAt ?? null };
    case "market-digest":
      return { started: null, finished: status.marketDigestLastSentAt ?? null };
    default:
      return { started: null, finished: null };
  }
}

function StatusCell({
  text,
  isRunning,
  isWaiting = false,
  /** When false, clamp to a single line; when true, allow wrap (row auto-expanded). */
  allowWrap = false,
}: {
  text: string | undefined;
  isRunning: boolean;
  isWaiting?: boolean;
  allowWrap?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!text) {
    return <span className="font-mono text-[9px] text-charcoal/30">—</span>;
  }

  const isLong = text.length > 72 || text.includes("\n");
  const emphasize = isRunning || isWaiting;
  const showFull = allowWrap || expanded;

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    void navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="min-w-0">
      <p
        className={`text-[9px] leading-snug ${
          emphasize
            ? "font-mono text-gold uppercase tracking-wide"
            : "text-slate/80"
        } ${
          showFull
            ? "break-words whitespace-pre-line"
            : "truncate whitespace-nowrap"
        }`}
        title={!showFull ? text : undefined}
      >
        {text}
      </p>
      {allowWrap || isLong ? (
        <div className="flex items-center gap-2 mt-0.5">
          {isLong && !allowWrap ? (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="font-mono text-[8px] text-navy/40 hover:text-navy hover:underline underline-offset-1"
            >
              {expanded ? "less" : "more"}
            </button>
          ) : null}
          <button
            type="button"
            onClick={handleCopy}
            className="font-mono text-[8px] text-charcoal/30 hover:text-navy"
            title="Copy full status to clipboard"
          >
            {copied ? "✓ copied" : "copy"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function formatNextStepLabel(jobId: ScheduledSyncJobId): string {
  const ms = syncNextOverrideStepMs(jobId);
  if (ms >= 24 * 60 * 60_000) return `${Math.round(ms / (24 * 60 * 60_000))}d`;
  if (ms >= 60 * 60_000) return `${Math.round(ms / (60 * 60_000))}h`;
  return `${Math.round(ms / 60_000)}m`;
}

/** Compact ▲/▼ next to Dashboard NEXT — one-time override nudge. */
function NextOverrideSpinner({
  jobId,
  busy,
  hasOverride,
  onNudge,
  onClear,
}: {
  jobId: ScheduledSyncJobId;
  busy: boolean;
  hasOverride: boolean;
  onNudge: (steps: number) => void;
  onClear: () => void;
}) {
  const step = formatNextStepLabel(jobId);
  const btn =
    "leading-none px-0.5 text-[9px] text-charcoal/40 hover:text-navy disabled:opacity-30 disabled:pointer-events-none";
  return (
    <span className="inline-flex items-center gap-0.5 normal-case tracking-normal">
      <span
        className="inline-flex flex-col -my-0.5"
        role="group"
        aria-label={`Adjust next run (±${step})`}
      >
        <button
          type="button"
          className={btn}
          title={`Later (+${step})`}
          aria-label={`Push next run later by ${step}`}
          disabled={busy}
          onClick={() => onNudge(1)}
        >
          ▲
        </button>
        <button
          type="button"
          className={btn}
          title={`Sooner (−${step})`}
          aria-label={`Pull next run sooner by ${step}`}
          disabled={busy}
          onClick={() => onNudge(-1)}
        >
          ▼
        </button>
      </span>
      {hasOverride ? (
        <button
          type="button"
          className={`${btn} text-gold hover:text-navy`}
          title="Clear override — resume natural schedule"
          aria-label="Clear next-run override"
          disabled={busy}
          onClick={onClear}
        >
          ×
        </button>
      ) : null}
    </span>
  );
}

/** Compact ▲/▼ for Configure Order (Sync All priority). */
function OrderReorderSpinner({
  busy,
  canUp,
  canDown,
  onMove,
}: {
  busy: boolean;
  canUp: boolean;
  canDown: boolean;
  onMove: (direction: "up" | "down") => void;
}) {
  const btn =
    "leading-none px-0.5 text-[9px] text-charcoal/40 hover:text-navy disabled:opacity-30 disabled:pointer-events-none";
  return (
    <span
      className="inline-flex flex-col -my-0.5"
      role="group"
      aria-label="Reorder Sync all priority"
    >
      <button
        type="button"
        className={btn}
        title="Higher priority (run earlier in Sync all)"
        aria-label="Move job earlier in Sync all order"
        disabled={busy || !canUp}
        onClick={() => onMove("up")}
      >
        ▲
      </button>
      <button
        type="button"
        className={btn}
        title="Lower priority (run later in Sync all)"
        aria-label="Move job later in Sync all order"
        disabled={busy || !canDown}
        onClick={() => onMove("down")}
      >
        ▼
      </button>
    </span>
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
  "edge-scores": "edge-scores",
  "publish-snapshot": "refresh-finished",
  "stats-cache": "stats-cache",
  "deal-of-the-day": "deal-of-the-day",
  "property-addresses": "property-addresses",
  "vision-addresses": "vision-addresses",
  "zip-boundaries": "zip-boundaries",
  "fomc-sync": "fomc-sync",
  "cpi-sync": "cpi-sync",
  "market-digest": "market-digest",
};

function pauseJobForSyncAllAction(
  actionId: AdminSyncActionId,
): ScheduledSyncJobId | null {
  const rowId = ACTION_ROW_ID[actionId] as AdminSyncPanelRowId | undefined;
  if (!rowId) return null;
  return SCHEDULED_SYNC_JOB_BY_ROW[rowId] ?? null;
}

function isSyncAllActionPaused(
  actionId: AdminSyncActionId,
  paused: ScheduledSyncPausedJobs,
): boolean {
  const job = pauseJobForSyncAllAction(actionId);
  return job != null && paused[job];
}

function syncAllActionLabel(actionId: AdminSyncActionId): string {
  return ADMIN_SYNC_ACTIONS[actionId]?.label ?? actionId;
}

/** Started-but-not-finished older than this → hung (pink). */
const HANG_THRESHOLD_MS = 45 * 60 * 1000;

/**
 * Rows whose sync_meta started/finished timestamps are set by a full-resync
 * finalize sub-step. When the full-resync row is in-progress these rows should
 * NOT flash yellow independently — the yellow is already shown on the
 * full-resync row itself. They'll turn green once the full resync completes.
 */
const FULL_RESYNC_SUBSTEP_ROWS = new Set([
  "listing-scores",
  "edge-scores",
  "stats-cache",
  "deal-of-the-day",
]);

/** Railway mls-sync heartbeat fresher than this ⇒ process is alive. */
const RAILWAY_HEARTBEAT_FRESH_MS = 4 * 60 * 1000;

type SyncRowVisualStatus = "running" | "ok" | "alert" | "idle";

function parseIsoMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

/** Compact age for End/Updated (e.g. `12m ago`, `27h ago`, `2d ago`). */
function formatAgeAgo(iso: string | null | undefined, nowMs = Date.now()): string | null {
  const ms = parseIsoMs(iso);
  if (ms == null) return null;
  const delta = Math.max(0, nowMs - ms);
  if (delta < 60_000) return "just now";
  if (delta < 60 * 60_000) return `${Math.round(delta / 60_000)}m ago`;
  if (delta < 48 * 60 * 60_000) {
    const hours = Math.floor(delta / (60 * 60_000));
    const mins = Math.round((delta % (60 * 60_000)) / 60_000);
    return mins > 0 && hours < 10 ? `${hours}h ${mins}m ago` : `${hours}h ago`;
  }
  const days = Math.floor(delta / (24 * 60 * 60_000));
  return `${days}d ago`;
}

/** Glance-friendly ingress outcome — drop HTTP 200 noise; keep error codes. */
function humanizeEventBridgeIngressResult(
  result: string | null | undefined,
): string | null {
  const raw = result?.trim();
  if (!raw) return null;
  return raw.replace(/\s*·\s*HTTP\s*20[04]\s*$/i, "").trim() || raw;
}

/**
 * Open Incremental Start with no matching End — usually a queue that never
 * finished. Prefer blank Start over a 19h ghost clock next to a fresh AWS line.
 */
function isOrphanIncrementalStart(
  timing: SyncTiming,
  ingressAt: string | null | undefined,
  liveNow: boolean,
  nowMs: number,
): boolean {
  if (liveNow) return false;
  const startMs = parseIsoMs(timing.started);
  if (startMs == null) return false;
  const endMs = parseIsoMs(timing.finished);
  if (endMs != null && endMs >= startMs) return false;
  const ingressMs = parseIsoMs(ingressAt);
  if (ingressMs != null && ingressMs > startMs + 60_000) return true;
  return nowMs - startMs >= HANG_THRESHOLD_MS;
}

/** AWS accepted a queue but End never landed after that ingress. */
function isEventBridgeQueuedWithoutEnd(
  ingressAt: string | null | undefined,
  ingressResult: string | null | undefined,
  finishedAt: string | null | undefined,
): boolean {
  const ingressMs = parseIsoMs(ingressAt);
  if (ingressMs == null) return false;
  const result = ingressResult?.trim() ?? "";
  if (!/^queued\b/i.test(result)) return false;
  const endMs = parseIsoMs(finishedAt);
  return endMs == null || endMs < ingressMs;
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

/**
 * True when last End is older than the Configure cadence allows — even if Next
 * still shows a future wall-clock (daily/weekly Next ignores stale finishes).
 */
function isFinishPastCadence(
  finishedAt: string | null,
  nextRunAt: string | null,
  frequency: SyncScheduleFrequencyId | undefined,
  nowMs: number,
): boolean {
  const finishedMs = parseIsoMs(finishedAt);
  if (finishedMs == null || !frequency) return false;
  const intervalMs = frequencyIntervalMs(frequency);
  if (intervalMs != null) {
    return nowMs - finishedMs >= intervalMs + 60_000;
  }
  // Calendar jobs: Next is the upcoming slot from *now*. The previous slot is
  // roughly Next − one period; finishing before that means a missed run.
  const nextMs = parseIsoMs(nextRunAt);
  if (nextMs == null) return false;
  const periodMs =
    frequency === "daily"
      ? 24 * 60 * 60_000
      : frequency === "weekly"
        ? 7 * 24 * 60 * 60_000
        : frequency === "monthly"
          ? 30 * 24 * 60 * 60_000
          : null;
  if (periodMs == null) return false;
  const lastSlotMs = nextMs - periodMs;
  return finishedMs < lastSlotMs - 60_000;
}

function resolveSyncRowVisualStatus(options: {
  row: AdminSyncRow;
  timing: SyncTiming;
  nextRunAt: string | null;
  jobFrequency?: SyncScheduleFrequencyId;
  status: PanelStatus | null;
  isRunning: boolean;
  syncAllRunning: boolean;
  /** True when the full-resync row itself is in-progress (client or server). */
  fullResyncInProgress: boolean;
  error?: string;
  nowMs: number;
  /**
   * EventBridge Incremental: ignore open Start hang (AWS owns the alarm; a
   * stale Start without End is Status text, not a Netlify Hung row).
   */
  ignoreTimingHang?: boolean;
  /** Explicit problem (e.g. AWS queued with no End after the hang window). */
  forceAlert?: boolean;
}): SyncRowVisualStatus {
  const {
    row,
    timing,
    nextRunAt,
    jobFrequency,
    status,
    isRunning,
    syncAllRunning,
    fullResyncInProgress,
    error,
    nowMs,
    ignoreTimingHang = false,
    forceAlert = false,
  } = options;

  // During a full resync the full-resync row (Step 1) is the single source of
  // truth for the pulsing yellow. The "refresh-finished" row watches the global
  // status.refreshing flag, which a full resync also sets — so without this it
  // pulses in lockstep with Step 1. Keep it calm until the resync completes.
  const refreshRowRunning =
    row.id === "refresh-finished" &&
    Boolean(status?.refreshing) &&
    !fullResyncInProgress;
  const refreshRowHung =
    row.id === "refresh-finished" &&
    Boolean(status?.refreshing) &&
    !fullResyncInProgress &&
    (() => {
      const startedMs = parseIsoMs(status?.lastRefreshStarted);
      return startedMs != null && nowMs - startedMs >= HANG_THRESHOLD_MS;
    })();

  // Suppress server-side isTimingInProgress for rows that are sub-steps of a
  // full resync (and the refresh-finished row) while the full-resync row itself
  // is already flashing yellow. Without this, the deal-of-day / scores /
  // stats-cache / refresh-finished rows all flash simultaneously with Step 1.
  const suppressTimingProgress =
    fullResyncInProgress &&
    (FULL_RESYNC_SUBSTEP_ROWS.has(row.id) || row.id === "refresh-finished");

  const inProgress =
    isRunning ||
    (syncAllRunning && row.actionId != null) ||
    refreshRowRunning ||
    (!suppressTimingProgress && isTimingInProgress(timing, nowMs));

  if (inProgress && !refreshRowHung) return "running";

  const failed = isSyncErrorText(error);
  const hung =
    refreshRowHung ||
    (!ignoreTimingHang && isTimingHung(timing, nowMs));

  if (failed || hung || forceAlert) return "alert";

  // "Latest MLS listing update" is a read-only diagnostic — it has no sync
  // action of its own so it should never turn green regardless of its timestamp.
  if (row.id === "latest-mls") return "idle";

  // Successful End → green. Missed cadence is called out in Status text only —
  // painting every overdue row pink made the Dashboard unreadable.
  if (timing.finished) {
    return "ok";
  }

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

/** Opaque sticky-cell backgrounds so scrolling content does not show through. */
function stickyCellBg(visual: SyncRowVisualStatus, stripe: boolean): string {
  switch (visual) {
    case "running":
      return "bg-[#f3e4a8]";
    case "ok":
      return "bg-[#e8f0ea]";
    case "alert":
      return "bg-[#fecaca]";
    default:
      return stripe ? "bg-[#faf7f1]" : "bg-white";
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
  "px-3 py-2 text-left font-mono text-[10px] tracking-[0.14em] uppercase text-charcoal/40 border-r border-b border-transparent bg-cream/30 whitespace-nowrap";
const TD =
  "px-3 py-2 align-middle text-left border-r border-b border-transparent last:border-r-0";
const TD_EXPAND =
  "px-3 py-2 align-top text-left border-r border-b border-transparent last:border-r-0";

export default function AdminSyncTable({
  mode = "dashboard",
  rows,
  initialRefreshing,
  initialStatus,
  initialPausedJobs,
}: {
  mode?: AdminSyncTableMode;
  rows: AdminSyncRow[];
  initialRefreshing: boolean;
  initialStatus?: PanelStatus;
  initialPausedJobs?: ScheduledSyncPausedJobs;
}) {
  const isDashboard = mode === "dashboard";
  const isConfigure = mode === "configure";
  const [status, setStatus] = useState<PanelStatus | null>(initialStatus ?? null);
  const [refreshing, setRefreshing] = useState(initialRefreshing);
  const [pausedJobs, setPausedJobs] = useState<ScheduledSyncPausedJobs>(
    () => initialPausedJobs ?? emptyPausedJobs(),
  );
  const [pauseSavingJob, setPauseSavingJob] = useState<ScheduledSyncJobId | null>(
    null,
  );
  const [nextSavingJob, setNextSavingJob] = useState<ScheduledSyncJobId | null>(
    null,
  );
  const [scheduleSavingJob, setScheduleSavingJob] =
    useState<ScheduledSyncJobId | "order" | null>(null);
  const scheduleConfig =
    status?.scheduleConfig ?? defaultSyncScheduleConfig();
  const orderByRow = orderNumberByRow(scheduleConfig);
  const [pendingRetries, setPendingRetries] = useState<
    Partial<Record<string, PendingSyncRetry>>
  >({});
  const pendingRetryTimersRef = useRef<Partial<Record<string, number>>>({});
  const syncAttemptCountRef = useRef<Partial<Record<string, number>>>({});
  const [runningId, setRunningId] = useState<AdminSyncActionId | "sync-all-caches" | null>(
    null,
  );
  /** Adhoc Incremental town scope — empty string = All Towns. */
  const [incrementalTownScope, setIncrementalTownScope] = useState<string>("");
  const incrementalTownScopeRef = useRef(incrementalTownScope);
  incrementalTownScopeRef.current = incrementalTownScope;
  /** Adhoc Incremental status scope — all | active | closed. */
  const [incrementalStatusScope, setIncrementalStatusScope] = useState<
    "all" | "active" | "closed"
  >("all");
  const incrementalStatusScopeRef = useRef(incrementalStatusScope);
  incrementalStatusScopeRef.current = incrementalStatusScope;
  /** FIFO of Sync now / Sync all clicks while another job is running. */
  const [syncQueue, setSyncQueue] = useState<SyncQueueItem[]>([]);
  const syncQueueRef = useRef<SyncQueueItem[]>([]);
  const runningLabelRef = useRef<string | null>(null);
  const runningIdRef = useRef<AdminSyncActionId | "sync-all-caches" | null>(null);
  const [messages, setMessages] = useState<Partial<Record<string, string>>>({});
  // localStorage-backed state is hydrated AFTER mount (see effect below) so the
  // first client render matches the server's empty render — reading storage in a
  // lazy initializer would diverge and trip a hydration mismatch.
  const storageHydratedRef = useRef(false);
  // Errors are persisted to localStorage so error text and red row backgrounds
  // survive page refreshes. Cleared automatically when a new sync starts on that row.
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  useEffect(() => {
    if (!storageHydratedRef.current) return;
    try { localStorage.setItem("admin-sync-errors", JSON.stringify(errors)); } catch { /* ignore */ }
  }, [errors]);
  const [descriptions, setDescriptions] = useState<Partial<Record<string, string>>>({});
  // Persisted final status per row — survives page reloads via localStorage.
  const [finalStatuses, setFinalStatuses] = useState<Partial<Record<string, string>>>({});
  const persistFinalStatus = useCallback((rowId: string, text: string) => {
    // Queue acks are not a finished pull — never freeze them as the durable Status.
    if (
      /queued/i.test(text) ||
      /waiting for background worker/i.test(text) ||
      /returns in seconds/i.test(text)
    ) {
      return;
    }
    setFinalStatuses((prev) => {
      const next = { ...prev, [rowId]: text };
      try { localStorage.setItem("admin-sync-final-statuses", JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);
  const [runTimings, setRunTimings] = useState<Partial<Record<string, SyncTiming>>>({});
  useEffect(() => {
    if (!storageHydratedRef.current) return;
    try {
      localStorage.setItem(ADMIN_SYNC_RUN_TIMINGS_STORAGE_KEY, JSON.stringify(runTimings));
    } catch {
      /* ignore */
    }
  }, [runTimings]);
  const [syncAllSummary, setSyncAllSummary] = useState<string | null>(null);
  /** Shown under Sync all while a run is active; cleared when the run ends. */
  const [syncAllPlanNote, setSyncAllPlanNote] = useState<string | null>(null);

  const replaceSyncQueue = useCallback(
    (next: SyncQueueItem[] | ((prev: SyncQueueItem[]) => SyncQueueItem[])) => {
      setSyncQueue((prev) => {
        const resolved = typeof next === "function" ? next(prev) : next;
        syncQueueRef.current = resolved;
        return resolved;
      });
    },
    [],
  );

  const setRunningJob = useCallback(
    (id: AdminSyncActionId | "sync-all-caches" | null, label: string | null) => {
      runningIdRef.current = id;
      runningLabelRef.current = label;
      setRunningId(id);
    },
    [],
  );

  const refreshWaitingStatuses = useCallback((blockerLabel: string) => {
    const queued = syncQueueRef.current;
    if (queued.length === 0) return;
    setDescriptions((prev) => {
      const next = { ...prev };
      for (const item of queued) {
        if (item.kind === "action") {
          next[item.rowId] = formatWaitingStatus(blockerLabel);
        }
      }
      return next;
    });
    if (queued.some((item) => item.kind === "sync-all")) {
      setSyncAllPlanNote(formatWaitingStatus(blockerLabel));
    }
  }, []);

  // Sync run log — type + wall-clock + every step for the most recent run.
  // Persisted to localStorage; live run accumulates until commit replaces it.
  const [runSnapshot, setRunSnapshot] = useState<SyncRunLogSnapshot | null>(null);
  useEffect(() => {
    if (!storageHydratedRef.current) return;
    try {
      localStorage.setItem(
        ADMIN_SYNC_RUN_LOG_STORAGE_KEY,
        JSON.stringify(runSnapshot),
      );
    } catch {
      /* ignore */
    }
  }, [runSnapshot]);
  // Hydrate all localStorage-backed state once, after the first client render,
  // then allow the persistence effects above to write back on change.
  useEffect(() => {
    try {
      const rawErrors = localStorage.getItem("admin-sync-errors");
      if (rawErrors) setErrors(JSON.parse(rawErrors) as Partial<Record<string, string>>);
    } catch { /* ignore */ }
    try {
      const rawFinal = localStorage.getItem("admin-sync-final-statuses");
      if (rawFinal) {
        const parsed = JSON.parse(rawFinal) as Partial<Record<string, string>>;
        // Drop frozen "Queued…" lines left by older clients — not a finished result.
        const cleaned: Partial<Record<string, string>> = {};
        for (const [id, text] of Object.entries(parsed)) {
          if (
            !text ||
            /queued/i.test(text) ||
            /waiting for background worker/i.test(text) ||
            /returns in seconds/i.test(text)
          ) {
            continue;
          }
          cleaned[id] = text;
        }
        setFinalStatuses(cleaned);
        try {
          localStorage.setItem(
            "admin-sync-final-statuses",
            JSON.stringify(cleaned),
          );
        } catch {
          /* ignore */
        }
      }
    } catch { /* ignore */ }
    try {
      const rawLog = localStorage.getItem(ADMIN_SYNC_RUN_LOG_STORAGE_KEY);
      if (rawLog) setRunSnapshot(parseStoredSyncRunLog(rawLog));
    } catch { /* ignore */ }
    try {
      const rawTimings = localStorage.getItem(ADMIN_SYNC_RUN_TIMINGS_STORAGE_KEY);
      if (rawTimings) {
        setRunTimings(JSON.parse(rawTimings) as Partial<Record<string, SyncTiming>>);
      }
    } catch { /* ignore */ }
    storageHydratedRef.current = true;
  }, []);
  const [liveLog, setLiveLog] = useState<SyncRunLogEntry[]>([]);
  const liveLogRef = useRef<SyncRunLogEntry[]>([]);
  const liveMetaRef = useRef<{ syncType: string; startedAt: string } | null>(
    null,
  );
  const [liveMeta, setLiveMeta] = useState<{
    syncType: string;
    startedAt: string;
  } | null>(null);
  const beginRunLog = useCallback((syncType: string) => {
    const meta = { syncType, startedAt: new Date().toISOString() };
    liveMetaRef.current = meta;
    setLiveMeta(meta);
    liveLogRef.current = [];
    setLiveLog([]);
  }, []);
  const appendRunLog = useCallback((entry: SyncRunLogEntry) => {
    liveLogRef.current = [...liveLogRef.current, entry];
    setLiveLog(liveLogRef.current);
  }, []);
  const commitRunLog = useCallback(() => {
    const meta = liveMetaRef.current;
    if (!meta) return;
    setRunSnapshot({
      syncType: meta.syncType,
      startedAt: meta.startedAt,
      finishedAt: new Date().toISOString(),
      entries: liveLogRef.current,
    });
    liveMetaRef.current = null;
    setLiveMeta(null);
  }, []);
  const [now, setNow] = useState(() => new Date());

  // Publish the run log to the dedicated panel rendered at the bottom of the DB
  // tab. While a run is active we surface its live snapshot; otherwise the last
  // completed run (which stays until the next run finishes).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const running = runningId != null;
    // Keep the previous completed run visible until the new run has a meta frame
    // (avoids an empty flash).
    const snapshot: SyncRunLogSnapshot | null =
      running && liveMeta
        ? {
            syncType: liveMeta.syncType,
            startedAt: liveMeta.startedAt,
            finishedAt: null,
            entries: liveLog,
          }
        : runSnapshot;
    window.dispatchEvent(
      new CustomEvent<AdminSyncRunLogEvent>(ADMIN_SYNC_RUN_LOG_EVENT, {
        detail: { snapshot, running },
      }),
    );
  }, [liveLog, liveMeta, runSnapshot, runningId]);

  const hasPendingRetries = Object.keys(pendingRetries).length > 0;

  const clearPendingRetry = useCallback((rowId: string) => {
    const timerId = pendingRetryTimersRef.current[rowId];
    if (timerId != null) {
      window.clearTimeout(timerId);
      delete pendingRetryTimersRef.current[rowId];
    }
    setPendingRetries((prev) => {
      if (!prev[rowId]) return prev;
      const next = { ...prev };
      delete next[rowId];
      return next;
    });
  }, []);

  useEffect(() => {
    return () => {
      for (const timerId of Object.values(pendingRetryTimersRef.current)) {
        if (timerId != null) window.clearTimeout(timerId);
      }
      pendingRetryTimersRef.current = {};
    };
  }, []);

  useEffect(() => {
    const tickMs =
      refreshing || runningId != null || hasPendingRetries ? 1_000 : 60_000;
    const id = window.setInterval(() => setNow(new Date()), tickMs);
    return () => window.clearInterval(id);
  }, [refreshing, runningId, hasPendingRetries]);

  const refreshStatus = useCallback(async () => {
    const res = await fetch("/api/admin/sync", { cache: "no-store" });
    if (!res.ok) return;
    const body = (await res.json()) as PanelStatus;
    setStatus(body);
    setRefreshing(body.refreshing);
    // Surface real worker town stamps into Status (not client-invented copy).
    const liveText =
      body.incrementalLiveStatus ??
      formatIncrementalSyncLiveStatus(body.incrementalLive);
    if (liveText) {
      setDescriptions((prev) => ({ ...prev, incremental: liveText }));
    }
  }, []);

  useEffect(() => {
    if (initialPausedJobs) return;
    let cancelled = false;
    fetch("/api/admin/scheduled-sync", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { jobs?: ScheduledSyncPausedJobs } | null) => {
        if (cancelled || !body?.jobs) return;
        setPausedJobs(body.jobs);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [initialPausedJobs]);

  const togglePausedJob = useCallback(
    async (jobId: ScheduledSyncJobId, next: boolean) => {
      setPauseSavingJob(jobId);
      const prev = pausedJobs;
      setPausedJobs((cur) => ({ ...cur, [jobId]: next }));
      try {
        const res = await fetch("/api/admin/scheduled-sync", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jobId, paused: next }),
        });
        const body = (await res.json()) as {
          jobs?: ScheduledSyncPausedJobs;
          error?: string;
        };
        if (!res.ok || !body.jobs) {
          setPausedJobs(prev);
          return;
        }
        setPausedJobs(body.jobs);
        // Keep Communications → Monday market brief Enabled in sync with Pause.
        dispatchSyncScheduleChanged("sync-dashboard");
      } catch {
        setPausedJobs(prev);
      } finally {
        setPauseSavingJob(null);
      }
    },
    [pausedJobs],
  );

  const patchScheduleConfig = useCallback(
    async (
      body:
        | { jobId: ScheduledSyncJobId; frequency: SyncScheduleFrequencyId }
        | { jobId: ScheduledSyncJobId; startTimeEt: string }
        | { jobId: ScheduledSyncJobId; weekdayEt: SyncScheduleWeekdayEt }
        | { jobId: ScheduledSyncJobId; scheduler: SyncSchedulerProvider }
        | { moveJobId: ScheduledSyncJobId; direction: "up" | "down" },
    ) => {
      const savingKey =
        "moveJobId" in body ? ("order" as const) : body.jobId;
      setScheduleSavingJob(savingKey);
      try {
        const res = await fetch("/api/admin/sync-schedule", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        const payload = (await res.json()) as {
          scheduleConfig?: SyncScheduleConfig;
          nextRuns?: PanelStatus["nextRuns"];
          error?: string;
        };
        if (!res.ok || !payload.scheduleConfig) {
          console.warn("[admin sync-schedule]", payload.error ?? res.status);
          return;
        }
        setStatus((prev) =>
          prev
            ? {
                ...prev,
                scheduleConfig: payload.scheduleConfig,
                ...(payload.nextRuns ? { nextRuns: payload.nextRuns } : {}),
              }
            : {
                refreshing: false,
                lastRefreshFinished: null,
                lastRefreshStarted: null,
                latestListingUpdate: null,
                stats: {
                  total: 0,
                  lastFullSync: null,
                  lastFullSyncStarted: null,
                  lastIncrementalSync: null,
                  lastIncrementalSyncStarted: null,
                  lastListingScores: null,
                  lastListingScoresStarted: null,
                  lastListingEdgeScores: null,
                  lastStatsCache: null,
                  lastStatsCacheStarted: null,
                  lastDealOfTheDayCache: null,
                  lastDealOfTheDayCacheStarted: null,
                },
                scheduleConfig: payload.scheduleConfig,
                nextRuns: payload.nextRuns,
              },
        );
        dispatchSyncScheduleChanged("sync-dashboard");
      } catch (err) {
        console.warn("[admin sync-schedule]", err);
      } finally {
        setScheduleSavingJob(null);
      }
    },
    [],
  );

  useEffect(() => {
    const onScheduleChanged = (ev: Event) => {
      const detail = (ev as CustomEvent<{ source?: string }>).detail;
      if (detail?.source === "sync-dashboard") return;
      void fetch("/api/admin/sync-schedule", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then(
          (payload: {
            scheduleConfig?: SyncScheduleConfig;
            nextRuns?: PanelStatus["nextRuns"];
          } | null) => {
            if (!payload?.scheduleConfig) return;
            setStatus((prev) =>
              prev
                ? {
                    ...prev,
                    scheduleConfig: payload.scheduleConfig,
                    ...(payload.nextRuns ? { nextRuns: payload.nextRuns } : {}),
                  }
                : prev,
            );
          },
        )
        .catch(() => {});
    };
    window.addEventListener(TMRE_SYNC_SCHEDULE_CHANGED, onScheduleChanged);
    return () => {
      window.removeEventListener(TMRE_SYNC_SCHEDULE_CHANGED, onScheduleChanged);
    };
  }, []);

  const patchNextOverride = useCallback(
    async (
      jobId: ScheduledSyncJobId,
      body:
        | { steps: number; baseNextAt: string | null }
        | { nextAt: string | null }
        | { due: true },
    ) => {
      setNextSavingJob(jobId);
      try {
        const res = await fetch("/api/admin/sync-next", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jobId, ...body }),
        });
        const payload = (await res.json()) as {
          nextRuns?: PanelStatus["nextRuns"];
          nextOverrides?: SyncNextOverrides;
          error?: string;
        };
        if (!res.ok) {
          console.warn("[admin sync-next]", payload.error ?? res.status);
          return;
        }
        setStatus((prev) =>
          prev
            ? {
                ...prev,
                ...(payload.nextRuns ? { nextRuns: payload.nextRuns } : {}),
                ...(payload.nextOverrides
                  ? { nextOverrides: payload.nextOverrides }
                  : {}),
              }
            : prev,
        );
      } catch (err) {
        console.warn("[admin sync-next]", err);
      } finally {
        setNextSavingJob(null);
      }
    },
    [],
  );

  const incrementalInFlight = (() => {
    if (status?.incrementalLive) return true;
    const startedMs = parseIsoMs(status?.stats?.lastIncrementalSyncStarted);
    if (startedMs == null) return false;
    const finishedMs = parseIsoMs(status?.stats?.lastIncrementalSync);
    if (finishedMs != null && finishedMs >= startedMs) return false;
    return Date.now() - startedMs < HANG_THRESHOLD_MS;
  })();

  useEffect(() => {
    void refreshStatus();
    const pollMs =
      refreshing || runningId != null || incrementalInFlight ? 5_000 : 60_000;
    const id = window.setInterval(() => void refreshStatus(), pollMs);
    return () => window.clearInterval(id);
  }, [refreshStatus, refreshing, runningId, incrementalInFlight]);

  const drainSyncQueueRef = useRef<() => void>(() => {});

  const finishRunningJob = useCallback(() => {
    setRunningJob(null, null);
    void refreshStatus();
    // Defer drain so runningIdRef is cleared before the next job starts.
    queueMicrotask(() => drainSyncQueueRef.current());
  }, [setRunningJob, refreshStatus]);

  const executeSync = useCallback(
    async (row: AdminSyncRow) => {
      const actionId = row.actionId;
      if (!actionId) return;

      clearPendingRetry(row.id);
      syncAttemptCountRef.current[row.id] = 0;

      const actionLabel = ADMIN_SYNC_ACTIONS[actionId]?.label ?? row.label;

      /** Hold the running slot through retries so FIFO waiters stay blocked. */
      const markRetryWait = (baseError: string, attempt: number) => {
        const attemptsLeft = SYNC_MAX_ATTEMPTS - attempt;
        const retryAtMs = Date.now() + SYNC_RETRY_DELAY_MS;
        setPendingRetries((prev) => ({
          ...prev,
          [row.id]: { baseError, retryAtMs, attemptsLeft },
        }));
        setErrors((prev) => ({
          ...prev,
          [row.id]: formatErrorWithRetry(baseError, retryAtMs, attemptsLeft),
        }));
        refreshWaitingStatuses(actionLabel);
      };

      if (actionId === "full-resync") {
        beginRunLog("Full resync");
        setRunningJob("full-resync", actionLabel);
        refreshWaitingStatuses(actionLabel);
        let fullOk = false;
        let lastFullErr = "Full resync failed";
        try {
          for (let attempt = 1; attempt <= SYNC_MAX_ATTEMPTS; attempt++) {
            syncAttemptCountRef.current[row.id] = attempt;
            if (attempt > 1) {
              clearPendingRetry(row.id);
              setRunningJob("full-resync", actionLabel);
              setErrors((prev) => ({ ...prev, [row.id]: undefined }));
            }
            const result = await runFullResyncChunked(row, {
              setRunningId: (id) => {
                // Keep label in sync when the chunked helper clears/sets the id.
                if (id == null) {
                  // Do not clear the queue slot mid-retry — Sync now still owns it.
                  setRunningJob("full-resync", actionLabel);
                } else {
                  setRunningJob(id, actionLabel);
                }
              },
              setDescriptions,
              setMessages,
              setErrors,
              setRunTimings,
              setStatus,
              setRefreshing,
              refreshStatus,
              runningId: null,
              persistFinalStatus,
              appendRunLog,
            });
            setRunningJob("full-resync", actionLabel);
            if (result.ok) {
              fullOk = true;
              clearPendingRetry(row.id);
              syncAttemptCountRef.current[row.id] = 0;
              break;
            }
            lastFullErr = result.error ?? lastFullErr;
            const attemptsLeft = SYNC_MAX_ATTEMPTS - attempt;
            if (attemptsLeft <= 0) break;
            markRetryWait(lastFullErr, attempt);
            await sleepMs(SYNC_RETRY_DELAY_MS);
          }
          if (!fullOk) {
            clearPendingRetry(row.id);
            syncAttemptCountRef.current[row.id] = 0;
            setErrors((prev) => ({ ...prev, [row.id]: lastFullErr }));
          }
        } finally {
          commitRunLog();
          finishRunningJob();
        }
        return;
      }

      beginRunLog(`Sync now · ${actionLabel}`);
      setRunningJob(actionId, actionLabel);
      refreshWaitingStatuses(actionLabel);
      setMessages((prev) => ({ ...prev, [row.id]: undefined }));
      setErrors((prev) => ({ ...prev, [row.id]: undefined }));
      setDescriptions((prev) => ({
        ...prev,
        [row.id]: `${ADMIN_SYNC_ACTIONS[actionId]?.description ?? row.label}…`,
      }));

      let succeeded = false;
      let lastError = "Sync failed";

      try {
        for (let attempt = 1; attempt <= SYNC_MAX_ATTEMPTS; attempt++) {
          syncAttemptCountRef.current[row.id] = attempt;
          if (attempt > 1) {
            clearPendingRetry(row.id);
            setRunningJob(actionId, actionLabel);
            setErrors((prev) => ({ ...prev, [row.id]: undefined }));
            setDescriptions((prev) => ({
              ...prev,
              [row.id]: `${ADMIN_SYNC_ACTIONS[actionId]?.description ?? row.label}… (retry ${attempt}/${SYNC_MAX_ATTEMPTS})`,
            }));
          }

          const startedAt = new Date().toISOString();
          const actionT0 = Date.now();
          setRunTimings((prev) => ({
            ...prev,
            [row.id]: { started: startedAt, finished: null },
          }));

          try {
            const townScope =
              actionId === "incremental"
                ? incrementalTownScopeRef.current.trim()
                : "";
            const statusScope =
              actionId === "incremental"
                ? incrementalStatusScopeRef.current
                : "all";
            const scopeBits = [
              townScope || null,
              statusScope !== "all" ? statusScope : null,
            ].filter(Boolean);
            const res = await fetch("/api/admin/sync", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                action: actionId,
                ...(townScope ? { town: townScope, towns: [townScope] } : {}),
                ...(statusScope !== "all" ? { statusScope } : {}),
              }),
            });
            const body = await readAdminSyncPostResponse(res);

            if (!res.ok || body.ok === false) {
              const errText = formatSyncError(res, body, row.label);
              lastError = errText;
              appendRunLog({
                id: `${row.id}-${actionT0}-a${attempt}`,
                label: scopeBits.length
                  ? `${actionLabel} · ${scopeBits.join(" · ")}`
                  : actionLabel,
                startedAt,
                finishedAt: new Date().toISOString(),
                durationMs: Date.now() - actionT0,
                status: errText,
                error: errText,
              });
              setRunTimings((prev) => ({
                ...prev,
                [row.id]: {
                  started: body.startedAt ?? startedAt,
                  finished: body.finishedAt ?? new Date().toISOString(),
                },
              }));
              const attemptsLeft = SYNC_MAX_ATTEMPTS - attempt;
              if (attemptsLeft <= 0) break;
              markRetryWait(errText, attempt);
              await sleepMs(SYNC_RETRY_DELAY_MS);
              continue;
            }

            succeeded = true;
            clearPendingRetry(row.id);
            syncAttemptCountRef.current[row.id] = 0;
            setErrors((prev) => ({ ...prev, [row.id]: undefined }));
            setStatus(body);
            setRefreshing(body.refreshing);
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
            const finalText =
              formatSyncDescription(body.message, body.detail) ??
              body.message ??
              row.detail ??
              "";
            setDescriptions((prev) => ({ ...prev, [row.id]: finalText }));
            // Queued is in-flight only — poll Status from the server until End lands.
            if (finalText && !queued) persistFinalStatus(row.id, finalText);
            const finishedAt = body.finishedAt ?? new Date().toISOString();
            const durationMs = Date.now() - actionT0;
            if (body.townResults && body.townResults.length > 0) {
              appendTownResultsByBucket(appendRunLog, {
                rowId: row.id,
                townResults: body.townResults,
                startedAt: body.startedAt ?? startedAt,
                finishedAt,
                durationMs,
                ok: true,
              });
            } else {
              appendRunLog({
                id: `${row.id}-${actionT0}-a${attempt}`,
                label: actionLabel,
                startedAt,
                finishedAt,
                durationMs,
                status: finalText || (body.message ?? "Complete"),
              });
            }
            break;
          } catch (err) {
            const errText = err instanceof Error ? err.message : "Sync failed";
            lastError = errText;
            appendRunLog({
              id: `${row.id}-${actionT0}-a${attempt}`,
              label: actionLabel,
              startedAt,
              finishedAt: new Date().toISOString(),
              durationMs: Date.now() - actionT0,
              status: errText,
              error: errText,
            });
            setRunTimings((prev) => ({
              ...prev,
              [row.id]: { started: startedAt, finished: new Date().toISOString() },
            }));
            const attemptsLeft = SYNC_MAX_ATTEMPTS - attempt;
            if (attemptsLeft <= 0) break;
            markRetryWait(errText, attempt);
            await sleepMs(SYNC_RETRY_DELAY_MS);
          }
        }

        if (!succeeded) {
          clearPendingRetry(row.id);
          syncAttemptCountRef.current[row.id] = 0;
          setErrors((prev) => ({ ...prev, [row.id]: lastError }));
        }
      } finally {
        commitRunLog();
        // Release the queue only after success or the final failed attempt.
        finishRunningJob();
      }
    },
    [
      refreshStatus,
      persistFinalStatus,
      beginRunLog,
      appendRunLog,
      commitRunLog,
      clearPendingRetry,
      setRunningJob,
      refreshWaitingStatuses,
      finishRunningJob,
    ],
  );

  const runSync = useCallback(
    async (row: AdminSyncRow) => {
      const actionId = row.actionId;
      if (!actionId) return;

      const actionLabel = ADMIN_SYNC_ACTIONS[actionId]?.label ?? row.label;
      const alreadyRunning =
        runningIdRef.current === actionId ||
        (runningIdRef.current === "full-resync" && actionId === "full-resync");
      if (alreadyRunning) return;

      const alreadyQueued = syncQueueRef.current.some(
        (item) => item.kind === "action" && item.rowId === row.id,
      );
      if (alreadyQueued) return;

      if (runningIdRef.current != null) {
        clearPendingRetry(row.id);
        syncAttemptCountRef.current[row.id] = 0;
        const blocker = runningLabelRef.current ?? "current sync";
        replaceSyncQueue((prev) => [
          ...prev,
          { kind: "action", rowId: row.id, actionId, label: actionLabel },
        ]);
        setDescriptions((prev) => ({
          ...prev,
          [row.id]: formatWaitingStatus(blocker),
        }));
        setErrors((prev) => ({ ...prev, [row.id]: undefined }));
        return;
      }

      await executeSync(row);
    },
    [executeSync, replaceSyncQueue, clearPendingRetry],
  );

  const executeSyncAll = useCallback(async () => {
    const syncAllSteps = syncAllClientStepsFromConfig(
      status?.scheduleConfig ?? defaultSyncScheduleConfig(),
    );
    const stepsToRun = syncAllSteps.filter(
      (actionId) => !isSyncAllActionPaused(actionId, pausedJobs),
    );
    const skippedPaused = syncAllSteps.filter((actionId) =>
      isSyncAllActionPaused(actionId, pausedJobs),
    );
    const runningLabels = stepsToRun.map(syncAllActionLabel);
    const skippedLabels = skippedPaused.map(syncAllActionLabel);
    const planParts: string[] = [];
    if (runningLabels.length > 0) {
      planParts.push(`About to run: ${runningLabels.join(" · ")}`);
    } else {
      planParts.push("All Sync all steps are paused — nothing to run.");
    }
    if (skippedLabels.length > 0) {
      planParts.push(`Skipping paused: ${skippedLabels.join(" · ")}`);
    }
    setSyncAllPlanNote(planParts.join(" "));

    beginRunLog("Sync all");
    setRunningJob("sync-all-caches", "Sync all");
    refreshWaitingStatuses("Sync all");
    setSyncAllSummary(null);
    setMessages({});
    setErrors({});
    setRunTimings({});
    for (const rowId of Object.keys(pendingRetryTimersRef.current)) {
      clearPendingRetry(rowId);
    }
    setPendingRetries({});
    syncAttemptCountRef.current = {};

    const skippedAt = new Date().toISOString();
    for (const actionId of skippedPaused) {
      appendRunLog({
        id: `sync-all-skipped-${actionId}-${Date.now()}`,
        label: syncAllActionLabel(actionId),
        startedAt: skippedAt,
        finishedAt: skippedAt,
        durationMs: 0,
        status: "Skipped — Pause checked",
      });
    }

    if (stepsToRun.length === 0) {
      setSyncAllSummary("Sync all skipped — every step is paused");
      commitRunLog();
      setSyncAllPlanNote(null);
      finishRunningJob();
      return;
    }

    let skipChainedAfterFull = false;
    let completed = 0;
    const totalSteps = stepsToRun.length;
    let currentRowId: string | null = null;

    try {
      for (const actionId of stepsToRun) {
        if (skipChainedAfterFull && ADMIN_SYNC_STEPS_AFTER_BACKGROUND_FULL.has(actionId)) {
          continue;
        }

        if (actionId === "full-resync") {
          const row = rows.find((r) => r.actionId === "full-resync");
          if (!row) continue;
          completed += 1;
          let fullOk = false;
          let lastFullErr = "Full resync failed";
          for (let attempt = 1; attempt <= SYNC_MAX_ATTEMPTS; attempt++) {
            setRunningJob("sync-all-caches", "Sync all");
            setSyncAllSummary(
              `Step ${completed}/${totalSteps}: Full resync (town-by-town)${
                attempt > 1 ? ` · retry ${attempt}/${SYNC_MAX_ATTEMPTS}` : ""
              }…`,
            );
            const result = await runFullResyncChunked(row, {
              setRunningId: (id) => {
                // Chunked helper clears the id in finally — keep Sync all owning the slot.
                if (id === "full-resync") {
                  setRunningJob("full-resync", "Sync all · Full resync");
                } else {
                  setRunningJob("sync-all-caches", "Sync all");
                }
              },
              setDescriptions,
              persistFinalStatus,
              setMessages,
              setErrors,
              setRunTimings,
              setStatus,
              setRefreshing,
              refreshStatus,
              runningId: "sync-all-caches",
              appendRunLog,
            });
            setRunningJob("sync-all-caches", "Sync all");
            if (result.ok) {
              fullOk = true;
              clearPendingRetry(row.id);
              break;
            }
            lastFullErr = result.error ?? lastFullErr;
            const attemptsLeft = SYNC_MAX_ATTEMPTS - attempt;
            if (attemptsLeft <= 0) break;
            const retryAtMs = Date.now() + SYNC_RETRY_DELAY_MS;
            setPendingRetries((prev) => ({
              ...prev,
              [row.id]: {
                baseError: lastFullErr,
                retryAtMs,
                attemptsLeft,
              },
            }));
            setErrors((prev) => ({
              ...prev,
              [row.id]: formatErrorWithRetry(lastFullErr, retryAtMs, attemptsLeft),
            }));
            setSyncAllSummary(
              `Full resync failed — retrying at ${formatRetryClock(retryAtMs)} (${formatAttemptsLeftPhrase(attemptsLeft)})`,
            );
            await sleepMs(SYNC_RETRY_DELAY_MS);
            clearPendingRetry(row.id);
          }
          if (!fullOk) {
            setErrors((prev) => ({ ...prev, [row.id]: lastFullErr }));
            setSyncAllSummary("Sync all stopped during full resync");
            return;
          }
          continue;
        }

        completed += 1;
        const rowId = ACTION_ROW_ID[actionId];
        currentRowId = rowId ?? null;
        const label = ADMIN_SYNC_ACTIONS[actionId]?.label ?? actionId;

        let stepBody: AdminSyncPostBody | null = null;
        let stepOk = false;
        let lastStepErr = "";

        for (let attempt = 1; attempt <= SYNC_MAX_ATTEMPTS; attempt++) {
          setSyncAllSummary(
            `Step ${completed}/${totalSteps}: ${label}${
              attempt > 1 ? ` · retry ${attempt}/${SYNC_MAX_ATTEMPTS}` : ""
            }…`,
          );

          const startedAt = new Date().toISOString();
          const stepT0 = Date.now();
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
            const stepErr = formatSyncError(res, body, label);
            lastStepErr = stepErr;
            if (rowId) {
              setRunTimings((prev) => ({
                ...prev,
                [rowId]: {
                  started: body.startedAt ?? startedAt,
                  finished: body.finishedAt ?? new Date().toISOString(),
                },
              }));
            }
            appendRunLog({
              id: `sync-all-${actionId}-${stepT0}-a${attempt}`,
              label,
              startedAt,
              finishedAt: new Date().toISOString(),
              durationMs: Date.now() - stepT0,
              status: stepErr,
              error: stepErr,
            });
            const attemptsLeft = SYNC_MAX_ATTEMPTS - attempt;
            if (attemptsLeft <= 0) break;
            if (rowId) {
              const retryAtMs = Date.now() + SYNC_RETRY_DELAY_MS;
              setPendingRetries((prev) => ({
                ...prev,
                [rowId]: { baseError: stepErr, retryAtMs, attemptsLeft },
              }));
              setErrors((prev) => ({
                ...prev,
                [rowId]: formatErrorWithRetry(stepErr, retryAtMs, attemptsLeft),
              }));
            }
            setSyncAllSummary(
              `${label} failed — retrying at ${formatRetryClock(Date.now() + SYNC_RETRY_DELAY_MS)} (${formatAttemptsLeftPhrase(attemptsLeft)})`,
            );
            await sleepMs(SYNC_RETRY_DELAY_MS);
            if (rowId) clearPendingRetry(rowId);
            continue;
          }

          stepBody = body;
          stepOk = true;
          const syncAllFinalText =
            formatSyncDescription(body.message, body.detail) ??
            body.message ??
            (rowId ? rows.find((r) => r.id === rowId)?.detail : undefined) ??
            "";
          const stepFinishedAt = body.finishedAt ?? new Date().toISOString();
          const stepDurationMs = Date.now() - stepT0;
          if (body.townResults && body.townResults.length > 0) {
            appendTownResultsByBucket(appendRunLog, {
              rowId: rowId ?? actionId,
              townResults: body.townResults,
              startedAt: body.startedAt ?? startedAt,
              finishedAt: stepFinishedAt,
              durationMs: stepDurationMs,
              ok: true,
            });
          } else {
            appendRunLog({
              id: `sync-all-${actionId}-${stepT0}`,
              label,
              startedAt,
              finishedAt: stepFinishedAt,
              durationMs: stepDurationMs,
              status: syncAllFinalText || (body.message ?? "Complete"),
            });
          }
          if (rowId) {
            clearPendingRetry(rowId);
            setErrors((prev) => ({ ...prev, [rowId]: undefined }));
            setMessages((prev) => ({ ...prev, [rowId]: body.message ?? "Complete" }));
            setDescriptions((prev) => ({ ...prev, [rowId]: syncAllFinalText }));
            const queued = Boolean(body.backgroundQueued);
            if (syncAllFinalText && !queued) persistFinalStatus(rowId, syncAllFinalText);
            setRunTimings((prev) => ({
              ...prev,
              [rowId]: {
                started: body.startedAt ?? startedAt,
                finished: queued ? null : (body.finishedAt ?? new Date().toISOString()),
              },
            }));
          }
          break;
        }

        if (!stepOk || !stepBody) {
          if (rowId) {
            setErrors((prev) => ({ ...prev, [rowId]: lastStepErr || "Sync failed" }));
          }
          setSyncAllSummary(
            `Sync all stopped at ${label}: ${lastStepErr || "Sync failed"}`,
          );
          return;
        }

        setStatus(stepBody);
        setRefreshing(stepBody.refreshing);

        if (stepBody.backgroundQueued) {
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
      commitRunLog();
      setSyncAllPlanNote(null);
      finishRunningJob();
    }
  }, [
    pausedJobs,
    status?.scheduleConfig,
    refreshStatus,
    rows,
    persistFinalStatus,
    beginRunLog,
    appendRunLog,
    commitRunLog,
    clearPendingRetry,
    setRunningJob,
    refreshWaitingStatuses,
    finishRunningJob,
  ]);

  const runSyncAll = useCallback(() => {
    if (runningIdRef.current === "sync-all-caches") return;
    if (syncQueueRef.current.some((item) => item.kind === "sync-all")) return;

    if (runningIdRef.current != null) {
      const blocker = runningLabelRef.current ?? "current sync";
      replaceSyncQueue((prev) => [...prev, { kind: "sync-all" }]);
      setSyncAllPlanNote(formatWaitingStatus(blocker));
      return;
    }

    void executeSyncAll();
  }, [executeSyncAll, replaceSyncQueue]);

  drainSyncQueueRef.current = () => {
    if (runningIdRef.current != null) return;
    const next = syncQueueRef.current[0];
    if (!next) return;
    replaceSyncQueue((prev) => prev.slice(1));
    if (next.kind === "sync-all") {
      void executeSyncAll();
      return;
    }
    const row = rows.find((r) => r.id === next.rowId);
    if (!row?.actionId) {
      queueMicrotask(() => drainSyncQueueRef.current());
      return;
    }
    void executeSync(row);
  };

  const syncAllQueued = syncQueue.some((item) => item.kind === "sync-all");
  const queuedRowIds = new Set(
    syncQueue.filter((item) => item.kind === "action").map((item) => item.rowId),
  );
  const syncAllRunning = runningId === "sync-all-caches";
  const rets = status?.rets;
  const syncFailures = status?.syncFailures ?? [];
  const showRetsAlert = rets && !rets.ok;

  return (
    <>
      {isDashboard && showRetsAlert && syncFailures.length > 0 ? (
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
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 px-5 sm:px-6 py-3 border-b border-charcoal/[0.08] bg-cream/20">
        <div className="min-w-0 space-y-1">
          {isDashboard ? (
            <>
              <p className="text-xs text-slate leading-relaxed max-w-xl">
                Tap Sync now (or Sync all). Sync now follows each job’s Configure
                Scheduler: EventBridge path when that radio is selected, otherwise
                Netlify queue (EventBridge falls back to Netlify if the queue fails).
                Running jobs stay on top. Pause and schedule edits live under
                Configure. Incremental fills Postgres; the{" "}
                <a
                  href="#admin-latest-page"
                  className="text-navy underline decoration-navy/25 underline-offset-2 hover:decoration-navy"
                >
                  Latest page
                </a>{" "}
                card above shows whether /latest is actually serving those updates.
              </p>
            </>
          ) : (
            <>
              <p className="text-xs text-slate leading-relaxed max-w-2xl">
                Pause skips Sync all and cron. Scheduler radio picks the alarm:
                Netlify cron, EventBridge (legacy), or Railway mls-sync
                (Incremental RETS→Neon — recommended). Frequency and Start time
                (ET) apply to Netlify/EB; Railway uses its own interval. Next
                start is read-only for Netlify/EB.
              </p>
              <p className="font-mono text-[9px] text-charcoal/45 leading-snug max-w-2xl">
                Set Incremental → Railway after deploying mls-sync; Netlify/EB
                stop pulling. Dashboard polls Neon End for peace of mind. Decommission
                AWS EventBridge schedules for Incremental once smoke passes.
              </p>
            </>
          )}
        </div>
        {isDashboard ? (
          <div className="shrink-0 self-start flex flex-col items-start gap-1.5 max-w-sm">
            <button
              type="button"
              onClick={() => runSyncAll()}
              disabled={syncAllRunning || syncAllQueued}
              className="font-mono text-[10px] tracking-[0.12em] uppercase rounded-full px-4 py-2 border border-gold/40 text-navy bg-gold/15 hover:bg-gold/25 disabled:opacity-40 disabled:pointer-events-none transition-colors"
            >
              {syncAllRunning
                ? "Syncing all…"
                : syncAllQueued
                  ? "Queued…"
                  : "Sync all"}
            </button>
            {syncAllPlanNote ? (
              <p className="text-left font-mono text-[10px] leading-snug text-charcoal/60 whitespace-pre-wrap">
                {syncAllPlanNote}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
      {isDashboard && syncAllSummary ? (
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
      {isDashboard ? (
        <AdminSyncMobileHeatmap
          rows={rows}
          status={status}
          scheduleConfig={scheduleConfig}
          runningId={runningId}
          errors={errors}
          onSyncNow={(row) => {
            const full = rows.find((r) => r.id === row.id);
            if (full) void runSync(full);
          }}
        />
      ) : null}
      <div className={`overflow-x-auto ${isDashboard ? "hidden lg:block" : ""}`}>
        <table
          className={`w-full border-collapse table-fixed ${
            isDashboard ? "min-w-[900px] md:min-w-[1080px]" : "min-w-[880px]"
          }`}
        >
          <colgroup>
            {isConfigure ? <col className="w-[3.25rem]" /> : null}
            <col className="w-[3rem]" />
            {isDashboard ? <col className="w-[5.5rem]" /> : null}
            {isDashboard ? <col className="w-[5.25rem]" /> : null}
            <col className={isDashboard ? "w-[7.5rem]" : "w-[9rem]"} />
            {isDashboard ? <col className="w-[6.25rem]" /> : null}
            {isConfigure ? <col /> : null}
            {isConfigure ? <col className="w-[7rem]" /> : null}
            {isConfigure ? <col className="w-[8.5rem]" /> : null}
            {isConfigure ? <col className="w-[8rem]" /> : null}
            {isConfigure ? <col className="w-[7rem]" /> : null}
            {isConfigure ? <col className="w-[9rem]" /> : null}
            {isDashboard ? <col className="w-[6.5rem]" /> : null}
            {isDashboard ? <col className="w-[5.5rem]" /> : null}
            {isDashboard ? <col className="w-[6.5rem]" /> : null}
            {isDashboard ? <col className="w-[7.5rem]" /> : null}
            {isDashboard ? <col /> : null}
            {isDashboard ? <col className="w-[8rem]" /> : null}
          </colgroup>
          <thead>
            <tr>
              {isConfigure ? (
                <th
                  className={`${TH} sticky left-0 z-30 bg-cream shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]`}
                  title="Pause automated / cron sync for this row"
                >
                  Pause
                </th>
              ) : null}
              <th
                className={`${TH} sticky z-30 bg-cream shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)] ${
                  isConfigure ? "left-[3.25rem]" : "left-0"
                }`}
              >
                Order
              </th>
              {isDashboard ? <th className={TH}>Action</th> : null}
              {isDashboard ? (
                <th
                  className={TH}
                  title="Optional town / listing-status scope for Sync now (Incremental for now)"
                >
                  Scope
                </th>
              ) : null}
                  <th className="px-3 py-2 text-left font-mono text-[8px] tracking-[0.14em] uppercase text-charcoal/40 border-r border-b border-transparent bg-cream/30 whitespace-nowrap">
                    Sync
                  </th>
              {isConfigure ? <th className={TH}>Description</th> : null}
              {isConfigure ? <th className={TH}>Pages</th> : null}
              {isConfigure ? <th className={TH}>Frequency</th> : null}
              {isDashboard ? (
                <th
                  className={TH}
                  title="Cadence from Configure (interval, daily/weekly, or calendar event day)"
                >
                  Frequency
                </th>
              ) : null}
              {isConfigure ? (
                <th
                  className={TH}
                  title="Authoritative alarm clock — Netlify cron or AWS EventBridge"
                >
                  Scheduler
                </th>
              ) : null}
              {isDashboard ? (
                <th
                  className={TH}
                  title="Authoritative alarm from Configure (read-only)"
                >
                  Scheduler
                </th>
              ) : null}
              {isConfigure ? (
                <th
                  className={TH}
                  title="Weekly send day + time of day in America/New_York (day applies when Frequency is Weekly)"
                >
                  Day / Start
                </th>
              ) : null}
              {isConfigure ? (
                <th
                  className={TH}
                  title="Next practical cron wake — read-only from Frequency + Start time"
                >
                  Next start
                </th>
              ) : null}
              {isDashboard ? <th className={TH}>Start</th> : null}
              {isDashboard ? <th className={TH}>End</th> : null}
              {isDashboard ? <th className={TH}>Next</th> : null}
              {isDashboard ? <th className={TH}>Status</th> : null}
              {isDashboard ? (
                <th className={`${TH} border-r-0 hidden md:table-cell`}>Errors</th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {(() => {
              // Determine whether the full-resync row is in-progress (client
              // OR server) so sub-step rows can suppress their independent
              // yellow flashing while the full resync is already showing it.
              const nowMsOuter = now.getTime();
              const fullResyncRow = rows.find((r) => r.id === "full-resync");
              const fullResyncTiming = fullResyncRow
                ? timingWithLogFallback(fullResyncRow, status, runTimings, runSnapshot)
                : null;
              const fullResyncInProgress =
                runningId === "full-resync" ||
                syncAllRunning ||
                (fullResyncTiming != null && isTimingInProgress(fullResyncTiming, nowMsOuter));

              const rowIsRunningForSort = (row: AdminSyncRow): boolean => {
                if (queuedRowIds.has(row.id)) return true;
                if (row.actionId != null && runningId === row.actionId) return true;
                if (runningId === "full-resync" && row.id === "full-resync") {
                  return true;
                }
                const timing = timingWithLogFallback(row, status, runTimings, runSnapshot);
                // Sync-all: pin the step currently in flight (started, no End yet).
                if (
                  syncAllRunning &&
                  isTimingInProgress(timing, nowMsOuter) &&
                  (row.actionId != null || row.id === "full-resync")
                ) {
                  return true;
                }
                if (row.id === "full-resync" && fullResyncInProgress) return true;
                // Sub-steps of an in-progress full resync stay below Step 1.
                if (FULL_RESYNC_SUBSTEP_ROWS.has(row.id) && fullResyncInProgress) {
                  return false;
                }
                if (isTimingInProgress(timing, nowMsOuter)) return true;
                if (
                  row.id === "refresh-finished" &&
                  Boolean(status?.refreshing) &&
                  !fullResyncInProgress
                ) {
                  return true;
                }
                return false;
              };

              return [...rows]
              .sort((a, b) => {
                // Same Configure order on Dashboard so #5 Stats cache lines up.
                // Running rows still pin to the top so in-flight work is visible.
                if (!isConfigure) {
                  const aRunning = rowIsRunningForSort(a);
                  const bRunning = rowIsRunningForSort(b);
                  if (aRunning !== bRunning) return aRunning ? -1 : 1;
                }
                const aOrder =
                  orderByRow[a.id] ?? ADMIN_MANUAL_SYNC_ORDER_BY_ROW[a.id] ?? 999;
                const bOrder =
                  orderByRow[b.id] ?? ADMIN_MANUAL_SYNC_ORDER_BY_ROW[b.id] ?? 999;
                if (aOrder !== bOrder) return aOrder - bOrder;
                return a.label.localeCompare(b.label);
              })
              .map((row, index) => {
              const isRunning =
                (row.actionId != null && runningId === row.actionId) ||
                (runningId === "full-resync" && row.id === "full-resync");
              const isWaiting = queuedRowIds.has(row.id);
              const nowMs = now.getTime();
              const pendingRetry = pendingRetries[row.id];
              const rowError = pendingRetry
                ? formatErrorWithRetry(
                    pendingRetry.baseError,
                    pendingRetry.retryAtMs,
                    pendingRetry.attemptsLeft,
                    nowMs,
                  )
                : errors[row.id];
              const disabled = !row.actionId || isRunning || isWaiting;
              const timing = timingWithLogFallback(row, status, runTimings, runSnapshot);
              const showSingleTimestamp =
                row.id === "latest-mls" ||
                row.id === "property-addresses" ||
                row.id === "vision-addresses" ||
                row.id === "zip-boundaries" ||
                row.id === "market-digest";
              const nextRunAt = nextRunForRow(row, status);
              const pauseJob = SCHEDULED_SYNC_JOB_BY_ROW[row.id as AdminSyncPanelRowId];
              const jobSchedule = pauseJob
                ? scheduleConfig.jobs[pauseJob]
                : null;
              const incrementalLiveNow =
                row.id === "incremental" &&
                Boolean(
                  status?.incrementalLiveStatus || status?.incrementalLive,
                );
              // Open Start without End (within hang window) = in flight even if
              // the live breadcrumb was cleared — Postgres Start is the signal.
              const incrementalOpenInFlight =
                row.id === "incremental" && isTimingInProgress(timing, nowMs);
              const incrementalRunningNow =
                incrementalLiveNow || incrementalOpenInFlight;
              const incrementalOnEventBridge =
                row.id === "incremental" &&
                jobSchedule != null &&
                resolveJobScheduler(jobSchedule) === "eventbridge";
              const incrementalOnRailway =
                row.id === "incremental" &&
                jobSchedule != null &&
                resolveJobScheduler(jobSchedule) === "railway";
              const orphanIncrementalStart =
                row.id === "incremental" &&
                isOrphanIncrementalStart(
                  timing,
                  status?.lastEventbridgeIngressAt,
                  incrementalRunningNow,
                  nowMs,
                );
              const eventBridgeQueuedNoEnd =
                incrementalOnEventBridge &&
                !incrementalRunningNow &&
                isEventBridgeQueuedWithoutEnd(
                  status?.lastEventbridgeIngressAt,
                  status?.lastEventbridgeIngressResult,
                  timing.finished,
                );
              const eventBridgeQueuedStale =
                eventBridgeQueuedNoEnd &&
                (() => {
                  const ingressMs = parseIsoMs(status?.lastEventbridgeIngressAt);
                  return (
                    ingressMs != null && nowMs - ingressMs >= HANG_THRESHOLD_MS
                  );
                })();
              // End missing or older than ~70m = Incremental is not delivering —
              // surface pink even under EventBridge (AWS fire ≠ finished RETS).
              const incrementalEndBroken =
                row.id === "incremental" &&
                !incrementalRunningNow &&
                (() => {
                  const endMs = parseIsoMs(timing.finished);
                  if (endMs == null) return true;
                  return nowMs - endMs >= 70 * 60 * 1000;
                })();
              // Configure is schedule/setup only — no live status colors.
              const visual = isConfigure
                ? ("idle" as const)
                : resolveSyncRowVisualStatus({
                    row,
                    timing,
                    nextRunAt,
                    jobFrequency: jobSchedule?.frequency,
                    status,
                    isRunning:
                      isRunning ||
                      isWaiting ||
                      (row.id === "incremental" &&
                        Boolean(
                          (() => {
                            const hb = parseIsoMs(status?.lastMlsSyncHeartbeat);
                            return (
                              jobSchedule != null &&
                              resolveJobScheduler(jobSchedule) === "railway" &&
                              hb != null &&
                              nowMs - hb < RAILWAY_HEARTBEAT_FRESH_MS
                            );
                          })(),
                        )),
                    syncAllRunning,
                    fullResyncInProgress,
                    error: rowError,
                    nowMs,
                    ignoreTimingHang:
                      incrementalOnEventBridge || incrementalOnRailway,
                    forceAlert:
                      incrementalEndBroken || eventBridgeQueuedStale,
                  });
              const scheduleBreached =
                isScheduleBreached(nextRunAt, timing.finished, nowMs) ||
                isFinishPastCadence(
                  timing.finished,
                  nextRunAt,
                  jobSchedule?.frequency,
                  nowMs,
                );
              // An open Start with no End belongs in Errors, not in Next: Next
              // answers "when does this run again", not "how did the last run
              // end". Reported as evidence (Start clock + age), never as a claim
              // about a Postgres value we did not read.
              const rowHung =
                !incrementalRunningNow &&
                !incrementalOnEventBridge &&
                (isTimingHung(timing, nowMs) ||
                  (row.id === "refresh-finished" &&
                    Boolean(status?.refreshing)));
              const hangNotice = (() => {
                if (!rowHung) return null;
                const startedAt =
                  timing.started ?? status?.lastRefreshStarted ?? null;
                if (!startedAt) return "Hung · no End recorded";
                const age = formatAgeAgo(startedAt, nowMs);
                const clock = formatTimeOnly(startedAt);
                return age && age !== "just now"
                  ? `Hung · no End since ${clock} · ${age}`
                  : `Hung · no End since ${clock}`;
              })();
              const manualOrder =
                orderByRow[row.id] ?? ADMIN_MANUAL_SYNC_ORDER_BY_ROW[row.id];
              const orderLabel = adminSyncOrderDisplay(row.id, manualOrder);
              const rowPaused = Boolean(pauseJob && pausedJobs[pauseJob]);
              const derivedScheduleHint = configureScheduleHintForRow(row.id);
              const orderIndex = pauseJob
                ? scheduleConfig.order.indexOf(pauseJob)
                : -1;
              const stripe = index % 2 === 1;
              // Paused jobs read as disabled — mute status colors to idle grey.
              const displayVisual =
                rowPaused && !isRunning && !isWaiting ? ("idle" as const) : visual;
              const stickyBg = stickyCellBg(displayVisual, stripe);

              // Queue stamps Start but leaves prior End — don't present that End
              // as if this run finished. Same when Start is newer than End.
              const incrementalPriorEnd =
                row.id === "incremental" &&
                Boolean(timing.finished) &&
                (incrementalRunningNow ||
                  (() => {
                    const s = parseIsoMs(timing.started);
                    const e = parseIsoMs(timing.finished);
                    return s != null && (e == null || s > e);
                  })());

              /** One glance line for AWS hits — shown on Dashboard Status when idle. */
              const eventbridgePulseLine = (() => {
                if (!incrementalOnEventBridge) return null;
                if (!status?.lastEventbridgeIngressAt) {
                  return "AWS: never fired";
                }
                const when =
                  formatAgeAgo(status.lastEventbridgeIngressAt, nowMs) ??
                  formatTimestamp(status.lastEventbridgeIngressAt);
                const result = humanizeEventBridgeIngressResult(
                  status.lastEventbridgeIngressResult,
                );
                return result ? `AWS ${when} · ${result}` : `AWS ${when}`;
              })();

              /** Railway mls-sync heartbeat — peace of mind when Scheduler is Railway. */
              const railwayHeartbeatMs = parseIsoMs(status?.lastMlsSyncHeartbeat);
              const railwayHeartbeatFresh =
                incrementalOnRailway &&
                railwayHeartbeatMs != null &&
                nowMs - railwayHeartbeatMs < RAILWAY_HEARTBEAT_FRESH_MS;
              const railwayPulseLine = (() => {
                if (!incrementalOnRailway) return null;
                if (!status?.lastMlsSyncHeartbeat) {
                  return "Railway: no heartbeat yet";
                }
                const when =
                  formatAgeAgo(status.lastMlsSyncHeartbeat, nowMs) ??
                  formatTimestamp(status.lastMlsSyncHeartbeat);
                return `heartbeat ${when}`;
              })();

              /** Single truth strip when Incremental Scheduler = Railway. */
              const railwayTruthStrip = (() => {
                if (!incrementalOnRailway) return null;
                const hb =
                  railwayPulseLine ?? "heartbeat missing";
                const endAge = timing.finished
                  ? formatAgeAgo(timing.finished, nowMs) ??
                    formatTimestamp(timing.finished)
                  : "missing";
                const upsertLabel =
                  status?.lastIncrementalUpsertsLabel?.trim() || null;
                const bits = [
                  "Railway",
                  hb,
                  `End ${endAge}`,
                ];
                if (upsertLabel) bits.push(upsertLabel);
                if (railwayHeartbeatFresh) {
                  bits.unshift("RUNNING");
                } else if (!timing.finished || incrementalEndBroken) {
                  bits.unshift("BROKEN");
                }
                const live =
                  status?.incrementalLiveStatus ??
                  formatIncrementalSyncLiveStatus(status?.incrementalLive);
                if (live && railwayHeartbeatFresh) bits.push(live);
                return bits.join(" · ");
              })();

              const statusText = (() => {
                if (isWaiting) {
                  return (
                    descriptions[row.id] ??
                    formatWaitingStatus(
                      runningLabelRef.current ?? "current sync",
                    )
                  );
                }
                if (
                  isRunning ||
                  syncAllRunning ||
                  incrementalRunningNow ||
                  railwayHeartbeatFresh
                ) {
                  if (row.id === "incremental" && railwayTruthStrip) {
                    return railwayTruthStrip;
                  }
                  const live =
                    status?.incrementalLiveStatus ??
                    formatIncrementalSyncLiveStatus(status?.incrementalLive) ??
                    descriptions[row.id] ??
                    null;
                  if (incrementalRunningNow) {
                    const bits = [
                      live
                        ? `RUNNING · ${live}`
                        : "RUNNING · started (waiting for End…)",
                    ];
                    // Peace of mind while in flight — End/heartbeat, not only town tick.
                    if (timing.finished) {
                      const endAge =
                        formatAgeAgo(timing.finished, nowMs) ??
                        formatTimestamp(timing.finished);
                      bits.push(`last End ${endAge}`);
                    } else {
                      bits.push("last End missing");
                    }
                    if (railwayPulseLine) bits.push(`Railway ${railwayPulseLine}`);
                    else if (incrementalOnRailway) {
                      bits.push("Railway: no heartbeat yet");
                    }
                    return bits.join("\n");
                  }
                  return live ?? "Running…";
                }
                // Prefer durable server truth over localStorage “Queued…” leftovers.
                if (row.id === "incremental") {
                  if (railwayTruthStrip) return railwayTruthStrip;

                  const upsertLabel =
                    status?.lastIncrementalUpsertsLabel?.trim() || null;
                  const upsertWhen = status?.lastIncrementalUpserts?.finishedAt
                    ? formatAgeAgo(
                        status.lastIncrementalUpserts.finishedAt,
                        nowMs,
                      )
                    : null;
                  const upsertLine = upsertLabel
                    ? upsertWhen && upsertWhen !== "just now"
                      ? `${upsertLabel} · ${upsertWhen}`
                      : upsertLabel
                    : timing.finished
                      ? "Upserts: — (last End had no count recorded)"
                      : "Upserts: — (waiting for a finished pull)";

                  if (eventBridgeQueuedNoEnd) {
                    const when =
                      formatAgeAgo(status?.lastEventbridgeIngressAt, nowMs) ??
                      "recently";
                    return [
                      upsertLine,
                      eventBridgeQueuedStale
                        ? `BROKEN · AWS ${when}: queued with no End (stale — Sync now)`
                        : `Not running · AWS ${when}: queued — waiting for End`,
                    ].join("\n");
                  }
                  const idleBits: string[] = [upsertLine];
                  if (!timing.finished) {
                    idleBits.push(
                      "BROKEN · End missing (last_incremental_sync null) — Latest cannot show Last pull · Sync now",
                    );
                  } else if (incrementalEndBroken) {
                    const age =
                      formatAgeAgo(timing.finished, nowMs) ??
                      formatDateShort(timing.finished);
                    idleBits.push(
                      `BROKEN · End stale (${age}) — Incremental not finishing · Sync now`,
                    );
                  } else {
                    const age =
                      formatAgeAgo(timing.finished, nowMs) ??
                      formatDateShort(timing.finished);
                    idleBits.push(`Idle · ended ${age}`);
                  }
                  if (eventbridgePulseLine) idleBits.push(eventbridgePulseLine);
                  if (
                    !upsertLabel &&
                    !incrementalOnEventBridge &&
                    !incrementalOnRailway &&
                    status?.incrementalStepLog?.summary
                  ) {
                    const src = status.incrementalStepLog.source
                      ? `${status.incrementalStepLog.source}: `
                      : "";
                    idleBits.push(
                      `${src}${status.incrementalStepLog.summary}`,
                    );
                  }
                  if (
                    !incrementalOnEventBridge &&
                    !incrementalOnRailway &&
                    scheduleBreached &&
                    timing.finished
                  ) {
                    idleBits.push("overdue vs Netlify schedule");
                  }
                  return idleBits.join("\n");
                }
                const prior =
                  descriptions[row.id] ??
                  finalStatuses[row.id] ??
                  statusTextFromRunLog(row, runSnapshot);
                if (scheduleBreached && timing.finished) {
                  const age =
                    formatAgeAgo(timing.finished, nowMs) ??
                    formatDateShort(timing.finished);
                  // Keep prior detail when short; don't bury it under "overdue".
                  if (prior && prior.length <= 48) {
                    return `${prior} · overdue (${age})`;
                  }
                  return prior
                    ? `Overdue — last End ${age}`
                    : `Overdue — last End ${age} (expected run missed)`;
                }
                return prior;
              })();

              const descriptionText =
                row.id === "incremental"
                  ? isConfigure
                    ? "Modified-since RETS pull across all towns"
                    : incrementalOnEventBridge
                      ? `Modified-since RETS pull (EventBridge)${
                          status?.lastEventbridgeIngressAt
                            ? ` · last fired ${
                                formatAgeAgo(
                                  status.lastEventbridgeIngressAt,
                                  nowMs,
                                ) ??
                                formatTimestamp(status.lastEventbridgeIngressAt)
                              }${
                                humanizeEventBridgeIngressResult(
                                  status.lastEventbridgeIngressResult,
                                )
                                  ? ` · ${humanizeEventBridgeIngressResult(
                                      status.lastEventbridgeIngressResult,
                                    )}`
                                  : ""
                              }`
                            : " · last fired: never"
                        }`
                      : `Modified-since RETS pull (every 30 minutes)${
                          status?.lastIncrementalCronTick
                            ? ` · Cron last fired ${
                                formatAgeAgo(
                                  status.lastIncrementalCronTick,
                                  nowMs,
                                ) ??
                                formatTimestamp(status.lastIncrementalCronTick)
                              }`
                            : " · Cron last fired: never (no Netlify */30 tick yet — Sync now does not stamp the scheduler)"
                        }`
                  : (row.detail ?? "");

              // Compact single-line rows unless status/error needs room to wrap.
              const rowExpands =
                isDashboard &&
                (Boolean(rowError) ||
                  Boolean(hangNotice) ||
                  isRunning ||
                  isWaiting ||
                  incrementalRunningNow ||
                  eventBridgeQueuedNoEnd ||
                  (!incrementalOnEventBridge && scheduleBreached) ||
                  Boolean(statusText && statusText.includes("\n")));
              const cellPad = rowExpands ? TD_EXPAND : TD;

              return (
                <tr
                  key={row.id}
                  className={`transition-colors duration-500 ${syncRowClassName(displayVisual, stripe)}${
                    rowPaused ? " opacity-40" : ""
                  }`}
                  aria-disabled={rowPaused || undefined}
                >
                  {isConfigure ? (
                    <td
                      className={`${cellPad} sticky left-0 z-20 ${stickyBg} shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]`}
                    >
                      {pauseJob ? (
                        <label
                          className="inline-flex items-center justify-center cursor-pointer"
                          title={
                            pausedJobs[pauseJob]
                              ? "Paused — Sync all and automated syncs skip this job"
                              : "Active — included in Sync all and automated schedules"
                          }
                        >
                          <input
                            type="checkbox"
                            checked={pausedJobs[pauseJob]}
                            disabled={pauseSavingJob === pauseJob}
                            onChange={(e) =>
                              void togglePausedJob(pauseJob, e.target.checked)
                            }
                            className="h-4 w-4 rounded border-charcoal/30 text-navy focus:ring-navy/40 disabled:opacity-40"
                            aria-label={`Pause scheduled sync for ${row.label}`}
                          />
                        </label>
                      ) : (
                        <span className="font-mono text-[10px] tracking-wide text-charcoal/30">
                          —
                        </span>
                      )}
                    </td>
                  ) : null}
                  <td
                    className={`${cellPad} sticky z-20 ${stickyBg} shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)] ${
                      isConfigure ? "left-[3.25rem]" : "left-0"
                    }`}
                  >
                    {orderLabel != null && pauseJob ? (
                      <div className="inline-flex items-center gap-1">
                        <span
                          className="inline-flex h-7 min-w-7 px-1 items-center justify-center rounded-full border border-navy/15 bg-white font-mono text-xs font-bold tabular-nums text-navy"
                          title={`Sync all step ${orderLabel}`}
                        >
                          {orderLabel}
                        </span>
                        {isConfigure ? (
                          <OrderReorderSpinner
                            busy={scheduleSavingJob === "order"}
                            canUp={orderIndex > 0}
                            canDown={
                              orderIndex >= 0 &&
                              orderIndex < scheduleConfig.order.length - 1
                            }
                            onMove={(direction) =>
                              void patchScheduleConfig({
                                moveJobId: pauseJob,
                                direction,
                              })
                            }
                          />
                        ) : null}
                      </div>
                    ) : (
                      <span className="font-mono text-[10px] tracking-wide text-charcoal/30">—</span>
                    )}
                  </td>
                  {isDashboard ? (
                    <td className={cellPad}>
                      {row.actionId ? (
                        <button
                          type="button"
                          onClick={() => runSync(row)}
                          disabled={disabled}
                          title={
                            jobSchedule &&
                            resolveJobScheduler(jobSchedule) === "eventbridge"
                              ? "Sync now via EventBridge path (falls back to Netlify queue if needed)"
                              : "Sync now via Netlify worker queue"
                          }
                          className="font-mono text-[10px] tracking-[0.12em] uppercase rounded-full px-3 py-1.5 border border-navy/20 text-navy bg-white hover:bg-cream/80 disabled:opacity-40 disabled:pointer-events-none transition-colors whitespace-nowrap"
                        >
                          {isRunning
                            ? "Syncing…"
                            : isWaiting
                              ? "Queued"
                              : "Sync now"}
                        </button>
                      ) : (
                        <span className="font-mono text-[10px] tracking-wide text-charcoal/30">—</span>
                      )}
                    </td>
                  ) : null}
                  {isDashboard ? (
                    <td className={cellPad}>
                      {row.id === "incremental" ? (
                        <div
                          className="flex flex-col gap-0.5"
                          title="Optional town / listing-status scope for Sync now"
                        >
                          <span className="font-mono text-[7px] tracking-[0.08em] uppercase text-charcoal/40 leading-none">
                            Scope
                          </span>
                          <select
                            value={incrementalTownScope}
                            disabled={disabled}
                            onChange={(e) =>
                              setIncrementalTownScope(e.target.value)
                            }
                            className="w-full max-w-[5.25rem] h-4 rounded border border-charcoal/15 bg-white px-1 py-0 font-mono text-[8px] leading-none text-navy disabled:opacity-40"
                            aria-label="Incremental town scope"
                          >
                            <option value="">All Towns</option>
                            {TMRE_TOWNS.map((town) => (
                              <option key={town} value={town}>
                                {town}
                              </option>
                            ))}
                          </select>
                          <select
                            value={incrementalStatusScope}
                            disabled={disabled}
                            onChange={(e) =>
                              setIncrementalStatusScope(
                                e.target.value as
                                  | "all"
                                  | "active"
                                  | "closed",
                              )
                            }
                            className="w-full max-w-[5.25rem] h-4 rounded border border-charcoal/15 bg-white px-1 py-0 font-mono text-[8px] leading-none text-navy disabled:opacity-40"
                            aria-label="Incremental status scope"
                          >
                            <option value="all">All statuses</option>
                            <option value="active">Active family</option>
                            <option value="closed">Closed only</option>
                          </select>
                        </div>
                      ) : null}
                    </td>
                  ) : null}
                  <td className={cellPad}>
                    <p
                      className={`font-mono text-[9px] tracking-[0.12em] uppercase text-charcoal/60 ${
                        rowExpands ? "leading-snug" : "leading-none truncate"
                      }`}
                      title={row.label}
                    >
                      {row.label}
                      {isDashboard && pauseJob && pausedJobs[pauseJob] ? (
                        <span className="ml-1.5 normal-case tracking-wide text-coral/80">
                          · Paused
                        </span>
                      ) : null}
                    </p>
                    {isDashboard && (rowError || hangNotice) && rowExpands ? (
                      <p
                        className={`mt-1 md:hidden font-mono text-[9px] leading-snug break-words whitespace-pre-line ${
                          rowError ? "text-coral" : "text-rose-600/80"
                        }`}
                      >
                        {rowError ?? hangNotice}
                      </p>
                    ) : null}
                  </td>
                  {isDashboard ? (
                    <td className={cellPad}>
                      <p
                        className="font-mono text-[10px] tracking-wide text-navy/80 leading-snug"
                        title={
                          jobSchedule
                            ? jobSchedule.frequency === "event"
                              ? "Runs on FOMC / CPI calendar release days at the Configure start time (ET)"
                              : jobSchedule.frequency === "weekly"
                                ? `${frequencyLabel(jobSchedule.frequency)} · ${SYNC_SCHEDULE_WEEKDAYS[resolveWeekdayEt(jobSchedule)]?.short ?? "Mon"} ${jobSchedule.startTimeEt} ET`
                                : `${frequencyLabel(jobSchedule.frequency)} · ${jobSchedule.startTimeEt} ET`
                            : (derivedScheduleHint ?? undefined)
                        }
                      >
                        {jobSchedule
                          ? frequencyLabel(jobSchedule.frequency)
                          : (derivedScheduleHint ?? "—")}
                      </p>
                    </td>
                  ) : null}
                  {isDashboard ? (
                    <td className={cellPad}>
                      <p
                        className="font-mono text-[10px] tracking-wide text-navy/80 leading-snug"
                        title="Set under Configure — sticky per job"
                      >
                        {jobSchedule
                          ? schedulerProviderLabel(
                              resolveJobScheduler(jobSchedule),
                            )
                          : "—"}
                      </p>
                    </td>
                  ) : null}
                  {isConfigure ? (
                    <td className={TD_EXPAND}>
                      <p className="text-sm leading-snug text-slate">
                        {descriptionText}
                      </p>
                    </td>
                  ) : null}
                  {isConfigure ? (
                    <td className={TD_EXPAND}>
                      <SyncImpactedPages rowId={row.id} />
                    </td>
                  ) : null}
                  {isConfigure ? (
                    <td className={TD_EXPAND}>
                      {jobSchedule && pauseJob ? (
                        <select
                          className="w-full max-w-[9rem] rounded border border-charcoal/15 bg-white px-1.5 py-1 font-mono text-[11px] text-navy disabled:opacity-40"
                          value={jobSchedule.frequency}
                          disabled={scheduleSavingJob === pauseJob}
                          aria-label={`Frequency for ${row.label}`}
                          onChange={(e) =>
                            void patchScheduleConfig({
                              jobId: pauseJob,
                              frequency: e.target
                                .value as SyncScheduleFrequencyId,
                            })
                          }
                        >
                          {SYNC_SCHEDULE_FREQUENCIES.map((opt) => (
                            <option key={opt.id} value={opt.id}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <p className="font-mono text-[11px] tracking-wide text-charcoal/45 leading-snug">
                          {derivedScheduleHint ?? "—"}
                        </p>
                      )}
                    </td>
                  ) : null}
                  {isConfigure ? (
                    <td className={TD_EXPAND}>
                      {jobSchedule && pauseJob ? (
                        <div
                          className="flex flex-col gap-1 min-w-0"
                          role="radiogroup"
                          aria-label={`Scheduler for ${row.label}`}
                        >
                          {(pauseJob === "incremental"
                            ? SYNC_SCHEDULER_PROVIDERS
                            : SYNC_SCHEDULER_PROVIDERS.filter(
                                (p) => p !== "railway",
                              )
                          ).map((provider) => {
                            const selected =
                              resolveJobScheduler(jobSchedule) === provider;
                            return (
                              <label
                                key={provider}
                                className={`inline-flex items-center gap-1.5 font-mono text-[10px] tracking-wide cursor-pointer ${
                                  selected ? "text-navy" : "text-charcoal/55"
                                }`}
                              >
                                <input
                                  type="radio"
                                  name={`scheduler-${pauseJob}`}
                                  value={provider}
                                  checked={selected}
                                  disabled={scheduleSavingJob === pauseJob}
                                  className="accent-navy"
                                  onChange={() =>
                                    void patchScheduleConfig({
                                      jobId: pauseJob,
                                      scheduler: provider,
                                    })
                                  }
                                />
                                {schedulerProviderLabel(provider)}
                              </label>
                            );
                          })}
                        </div>
                      ) : (
                        <span className="font-mono text-[10px] tracking-wide text-charcoal/30">
                          —
                        </span>
                      )}
                    </td>
                  ) : null}
                  {isConfigure ? (
                    <td className={TD_EXPAND}>
                      {jobSchedule && pauseJob ? (
                        <div className="flex flex-col gap-1 min-w-0">
                          {jobSchedule.frequency === "weekly" ? (
                            <select
                              className="w-full max-w-[8.5rem] rounded border border-charcoal/15 bg-white px-1.5 py-1 font-mono text-[11px] text-navy disabled:opacity-40"
                              value={resolveWeekdayEt(jobSchedule)}
                              disabled={scheduleSavingJob === pauseJob}
                              aria-label={`Send day (ET) for ${row.label}`}
                              onChange={(e) =>
                                void patchScheduleConfig({
                                  jobId: pauseJob,
                                  weekdayEt: Number(
                                    e.target.value,
                                  ) as SyncScheduleWeekdayEt,
                                })
                              }
                            >
                              {SYNC_SCHEDULE_WEEKDAYS.map((d) => (
                                <option key={d.id} value={d.id}>
                                  {d.short}
                                </option>
                              ))}
                            </select>
                          ) : null}
                          <input
                            type="time"
                            className="w-full max-w-[8rem] rounded border border-charcoal/15 bg-white px-1.5 py-1 font-mono text-[11px] tabular-nums text-navy disabled:opacity-40"
                            value={jobSchedule.startTimeEt}
                            disabled={scheduleSavingJob === pauseJob}
                            aria-label={`Start time (ET) for ${row.label}`}
                            onChange={(e) =>
                              void patchScheduleConfig({
                                jobId: pauseJob,
                                startTimeEt: e.target.value,
                              })
                            }
                          />
                        </div>
                      ) : (
                        <span className="font-mono text-[10px] tracking-wide text-charcoal/30">
                          —
                        </span>
                      )}
                    </td>
                  ) : null}
                  {isConfigure ? (
                    <td className={TD_EXPAND}>
                      {(() => {
                        const nextJobId =
                          SCHEDULED_SYNC_JOB_BY_ROW[
                            row.id as AdminSyncPanelRowId
                          ];
                        if (!nextJobId) {
                          return (
                            <p className="font-mono text-[11px] tracking-wide text-charcoal/45 leading-snug">
                              {derivedScheduleHint ?? "—"}
                            </p>
                          );
                        }
                        const takeHoldIso = nextPracticalTakeHoldIso(
                          nextJobId,
                          nextRunAt,
                          now,
                        );
                        const nextLabel = formatAdminNextSyncAt(nextRunAt, now);
                        const takeHoldLabel = formatAdminNextSyncAt(
                          takeHoldIso,
                          now,
                        );
                        const nextMs = parseIsoMs(nextRunAt);
                        const takeHoldMs = parseIsoMs(takeHoldIso);
                        const sameSlot =
                          nextMs != null &&
                          takeHoldMs != null &&
                          Math.abs(takeHoldMs - nextMs) < 60_000;
                        const freq = jobSchedule
                          ? frequencyLabel(jobSchedule.frequency)
                          : null;

                        return (
                          <div className="flex flex-col gap-0.5 min-w-0">
                            <span className="font-mono text-[11px] tabular-nums leading-snug text-navy font-semibold">
                              {nextRunAt != null ? nextLabel : "—"}
                            </span>
                            {takeHoldIso && !sameSlot ? (
                              <p
                                className="font-mono text-[9px] tracking-wide leading-snug text-charcoal/45"
                                title="Cron wakes every 30 minutes — this is when it can actually run"
                              >
                                Takes hold {takeHoldLabel}
                              </p>
                            ) : null}
                            {freq ? (
                              <p className="font-mono text-[8px] tracking-wide text-charcoal/40 leading-snug">
                                {freq}
                                {jobSchedule
                                  ? jobSchedule.frequency === "weekly"
                                    ? ` · ${SYNC_SCHEDULE_WEEKDAYS[resolveWeekdayEt(jobSchedule)]?.short ?? "Mon"} ${jobSchedule.startTimeEt} ET`
                                    : ` · ${jobSchedule.startTimeEt} ET`
                                  : null}
                              </p>
                            ) : null}
                          </div>
                        );
                      })()}
                    </td>
                  ) : null}
                  {isDashboard ? (
                    <>
                      {(() => {
                        const anchorIso = timing.started ?? timing.finished;
                        const dateLabel = anchorIso
                          ? formatDateShort(anchorIso)
                          : null;
                        const anchorCal = isoCalendarDate(anchorIso);
                        const nextSameDay =
                          nextRunAt != null &&
                          anchorCal != null &&
                          isoCalendarDate(nextRunAt) === anchorCal;

                        const startMs = parseIsoMs(timing.started);
                        const endMs = parseIsoMs(timing.finished);
                        const elapsedMs =
                          startMs != null &&
                          endMs != null &&
                          endMs >= startMs
                            ? endMs - startMs
                            : null;

                        const isPostDeployNext =
                          row.id === "full-resync" &&
                          status?.scheduleHints?.fullResyncSource ===
                            "post-deploy";
                        let nextStatusText: string | null = null;
                        let nextStatusClass = "text-sage/80";
                        if (isPostDeployNext) {
                          nextStatusText = "Post-deploy";
                          nextStatusClass = "text-gold";
                        } else if (incrementalOnEventBridge) {
                          // Real wall clock below; label who owns the alarm.
                          nextStatusText = "AWS";
                          nextStatusClass = "text-navy/55";
                        } else if (scheduleBreached) {
                          nextStatusText = "Overdue";
                          nextStatusClass = "text-rose-600/80";
                        }
                        const nextTimeText = isPostDeployNext
                          ? formatAdminNextSyncCountdown(nextRunAt, now)
                          : nextSameDay
                            ? formatTimeOnly(nextRunAt)
                            : formatAdminNextSyncAt(nextRunAt, now);
                        const nextJobId =
                          SCHEDULED_SYNC_JOB_BY_ROW[
                            row.id as AdminSyncPanelRowId
                          ];
                        const hasNextOverride = Boolean(
                          nextJobId && status?.nextOverrides?.[nextJobId],
                        );
                        const nextTimeClass =
                          scheduleBreached
                            ? "text-rose-700"
                            : hasNextOverride
                              ? "text-gold"
                              : "text-navy";

                        const endValue = (() => {
                          if (!timing.finished) return "—";
                          const age = formatAgeAgo(timing.finished, nowMs);
                          const time = formatTimeOnly(timing.finished);
                          const base =
                            age && age !== "just now"
                              ? `${time} · ${age}`
                              : time;
                          // Queued / in-flight: this End is the last finished pull,
                          // not the current hop (Latest deal ages are MLS mod times).
                          return incrementalPriorEnd ? `Prior ${base}` : base;
                        })();
                        const endTitle = [
                          incrementalPriorEnd
                            ? "Last finished pull (current hop not done yet)"
                            : null,
                          dateLabel,
                          !showSingleTimestamp &&
                          elapsedMs != null &&
                          !incrementalPriorEnd
                            ? `Elapsed ${formatElapsed(elapsedMs)}`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ");

                        const startValue = (() => {
                          if (showSingleTimestamp || !timing.started) return "—";
                          if (orphanIncrementalStart) return "—";
                          const time = formatTimeOnly(timing.started);
                          if (row.id !== "incremental") return time;
                          const age = formatAgeAgo(timing.started, nowMs);
                          return age && age !== "just now"
                            ? `${time} · ${age}`
                            : time;
                        })();

                        return (
                          <>
                            <td className={cellPad}>
                              <span
                                className="block min-w-0 font-mono text-[10px] tabular-nums leading-snug break-words text-navy font-semibold"
                                title={
                                  orphanIncrementalStart
                                    ? "Prior Start cleared — queue never reached End (see Status)"
                                    : timing.started
                                      ? `${dateLabel ?? ""} ${formatTimeOnly(timing.started)}${
                                          incrementalRunningNow
                                            ? " · in flight (End updates when worker finishes)"
                                            : ""
                                        }`.trim()
                                      : undefined
                                }
                              >
                                {startValue}
                              </span>
                            </td>
                            <td className={cellPad}>
                              <span
                                className={`block min-w-0 font-mono text-[10px] tabular-nums leading-snug break-words font-semibold ${
                                  !incrementalRunningNow &&
                                  (scheduleBreached || incrementalPriorEnd)
                                    ? "text-rose-700"
                                    : "text-navy"
                                }`}
                                title={endTitle || undefined}
                              >
                                {endValue}
                              </span>
                            </td>
                            <td className={cellPad}>
                              <div className="flex min-w-0 max-w-full flex-wrap items-start gap-x-1 gap-y-0.5">
                                <span
                                  className={`min-w-0 font-mono text-[10px] tabular-nums leading-snug break-words font-semibold ${nextTimeClass}`}
                                  title={
                                    incrementalOnEventBridge
                                      ? "Next cadence from Configure Frequency, anchored on last AWS EventBridge fire (Postgres)"
                                      : nextStatusText
                                        ? `${nextTimeText} (${nextStatusText})`
                                        : nextTimeText
                                  }
                                >
                                  {nextRunAt != null ? nextTimeText : "—"}
                                  {nextStatusText ? (
                                    <span
                                      className={`ml-1 font-normal ${nextStatusClass}`}
                                    >
                                      {nextStatusText}
                                    </span>
                                  ) : hasNextOverride ? (
                                    <span className="ml-1 font-normal text-gold">
                                      set
                                    </span>
                                  ) : null}
                                </span>
                                {nextJobId &&
                                !isPostDeployNext &&
                                !incrementalOnEventBridge ? (
                                  <NextOverrideSpinner
                                    jobId={nextJobId}
                                    busy={nextSavingJob === nextJobId}
                                    hasOverride={hasNextOverride}
                                    onNudge={(steps) =>
                                      void patchNextOverride(nextJobId, {
                                        steps,
                                        baseNextAt: nextRunAt,
                                      })
                                    }
                                    onClear={() =>
                                      void patchNextOverride(nextJobId, {
                                        nextAt: null,
                                      })
                                    }
                                  />
                                ) : null}
                              </div>
                            </td>
                          </>
                        );
                      })()}
                      <td className={cellPad}>
                        <StatusCell
                          text={statusText}
                          isRunning={
                            isRunning ||
                            syncAllRunning ||
                            incrementalRunningNow ||
                            railwayHeartbeatFresh
                          }
                          isWaiting={isWaiting}
                          allowWrap={
                            rowExpands ||
                            incrementalRunningNow ||
                            railwayHeartbeatFresh ||
                            eventBridgeQueuedNoEnd
                          }
                        />
                      </td>
                      <td
                        className={`${cellPad} border-r-0 hidden md:table-cell`}
                      >
                        {rowError || hangNotice ? (
                          <div className="space-y-1 min-w-0">
                            <p
                              className={`font-mono text-[9px] ${
                                rowError ? "text-coral" : "text-rose-600/80"
                              } ${
                                rowExpands
                                  ? "leading-snug break-words whitespace-pre-line"
                                  : "truncate whitespace-nowrap"
                              }`}
                              title={rowError ?? hangNotice ?? undefined}
                            >
                              {rowError ?? hangNotice}
                            </p>
                            {row.actionId &&
                            !isRunning &&
                            !isWaiting &&
                            !syncAllRunning ? (
                              <button
                                type="button"
                                onClick={() => runSync(row)}
                                disabled={false}
                                className="font-mono text-[9px] tracking-[0.1em] uppercase rounded-full px-2.5 py-1 border border-coral/40 text-coral bg-rose-50 hover:bg-rose-100 disabled:opacity-40 disabled:pointer-events-none transition-colors"
                              >
                                {pendingRetry ? "↺ Retry now" : "↺ Retry"}
                              </button>
                            ) : null}
                          </div>
                        ) : (
                          <span className="font-mono text-[9px] text-charcoal/30">
                            —
                          </span>
                        )}
                      </td>
                    </>
                  ) : null}
                </tr>
              );
            })
          })()}
          </tbody>
        </table>
      </div>
    </>
  );
}
