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
  ADMIN_SYNC_SLOT_CLAIM_GRACE_MS as SCHEDULE_CLAIM_GRACE_MS,
  adminSyncCalendarDate,
  adminSyncOrderDisplay,
  formatAdminNextSyncAt,
  formatAdminNextSyncCountdown,
  formatAdminSyncDateShort,
  formatAdminSyncTimeOnly,
  formatAdminSyncTimestamp,
} from "@/lib/admin-sync-schedule-format";
import type { AdminSyncScheduleHints } from "@/lib/admin-sync-schedule";
import { adminSyncImpactedPages } from "@/lib/admin-sync-pages";
import type { IncrementalSyncLiveProgress } from "@/lib/incremental-sync-live-shared";
import { formatIncrementalSyncLiveStatus } from "@/lib/incremental-sync-live-shared";
import {
  INCREMENTAL_END_STALE_MS,
  INCREMENTAL_OPEN_START_IN_PULL_MS,
  evaluateIncrementalHealth,
  formatRunnerHealthStrip,
  isMlsSyncDoorbellError,
} from "@/lib/incremental-sync-health";
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
  defaultSyncScheduleConfig,
  frequencyIntervalMs,
  frequencyLabel,
  orderNumberByRow,
  resolveJobBudgetMinutes,
  resolveWeekdayEt,
  syncAllClientStepsFromConfig,
  syncJobHostLabel,
  type SyncScheduleConfig,
  type SyncScheduleFrequencyId,
  type SyncScheduleWeekdayEt,
} from "@/lib/sync-schedule-config-shared";
import {
  SYNC_JOB_BUDGET_MAX_MINUTES,
  SYNC_JOB_BUDGET_MIN_MINUTES,
  emptySyncQueueSnapshot,
  isSyncQueueRunnerJob,
  syncQueueBudgetRemainingMs,
  syncQueueOutcomeLabel,
  syncQueuePositionForJob,
  type SyncQueueSnapshot,
} from "@/lib/sync-queue-shared";
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
type ClickQueueItem =
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

const LEGACY_ERROR_AT_MS = 0;
/** Legacy errors (no clock) clear only if End is still inside this window. */
const LEGACY_ERROR_CLEAN_FINISH_MS = INCREMENTAL_END_STALE_MS;

type StoredSyncErrorEntry = { text: string; at: string };

function parseStoredSyncErrors(raw: string): {
  errors: Partial<Record<string, string>>;
  atMs: Partial<Record<string, number>>;
} {
  const errors: Partial<Record<string, string>> = {};
  const atMs: Partial<Record<string, number>> = {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return { errors, atMs };
    for (const [id, value] of Object.entries(
      parsed as Record<string, unknown>,
    )) {
      if (typeof value === "string" && value.trim()) {
        errors[id] = value;
        atMs[id] = LEGACY_ERROR_AT_MS;
        continue;
      }
      if (value && typeof value === "object" && "text" in value) {
        const text = (value as { text?: unknown }).text;
        const at = (value as { at?: unknown }).at;
        if (typeof text !== "string" || !text.trim()) continue;
        errors[id] = text;
        const ms = typeof at === "string" ? Date.parse(at) : Number.NaN;
        atMs[id] = Number.isNaN(ms) ? LEGACY_ERROR_AT_MS : ms;
      }
    }
  } catch {
    /* ignore */
  }
  return { errors, atMs };
}

function serializeStoredSyncErrors(
  errors: Partial<Record<string, string>>,
  atMs: Partial<Record<string, number>>,
): string {
  const out: Record<string, StoredSyncErrorEntry> = {};
  for (const [id, text] of Object.entries(errors)) {
    if (!text) continue;
    const ms = atMs[id];
    out[id] = {
      text,
      at:
        ms != null && ms > LEGACY_ERROR_AT_MS
          ? new Date(ms).toISOString()
          : new Date().toISOString(),
    };
  }
  return JSON.stringify(out);
}

function shouldClearErrorAfterCleanFinish(options: {
  errorAtMs: number | undefined;
  finishedAt: string | null;
  nowMs: number;
}): boolean {
  const endMs = parseIsoMs(options.finishedAt);
  if (endMs == null) return false;
  const errorAtMs = options.errorAtMs;
  if (errorAtMs == null) return false;
  if (errorAtMs === LEGACY_ERROR_AT_MS) {
    return options.nowMs - endMs < LEGACY_ERROR_CLEAN_FINISH_MS;
  }
  return endMs > errorAtMs;
}

function finishedAtForErrorRow(
  rowId: string,
  rows: AdminSyncRow[],
  status: PanelStatus | null,
): string | null {
  const row = rows.find((r) => r.id === rowId) ?? {
    id: rowId,
    label: "",
    value: "",
  };
  const finished = timingForRow(row, status).finished;
  if (rowId !== "incremental" || !status) return finished;
  const upserts = status.lastIncrementalUpserts;
  return pickLaterIso(
    finished,
    upserts?.ok === true ? upserts.finishedAt : null,
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
  /** External source homepage (e.g. Westport VGSI GIS). */
  sourceHref?: string;
  sourceLabel?: string;
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
  /** Sync runner process heartbeat (Neon). */
  lastMlsSyncHeartbeat?: string | null;
  /** Durable `sync_queue` — what is waiting, what is running, how the last runs ended. */
  syncQueue?: SyncQueueSnapshot;
  /** Towns that failed on the last finished incremental run, if any. */
  incrementalPartial?: { at: string; towns: string[] } | null;
  propertyAddressesSyncedAt?: string | null;
  visionAddressesSyncedAt?: string | null;
  /** Temporal Vision GIS parcel progress (CLI / Admin / worker). */
  visionAddressesLive?: {
    town: string;
    phase: string;
    n: number;
    maxParcels: number;
    visionPid: string;
    address: string | null;
    street: string | null;
    letter: string | null;
    updatedAt: string;
    status: "running" | "done" | "error";
  } | null;
  visionAddressesLiveStatus?: string | null;
  zipBoundariesSyncedAt?: string | null;
  zipBoundariesSyncStartedAt?: string | null;
  openHousesSyncedAt?: string | null;
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
  /** Last stats rebuild: which towns, why, entries written, how long ago. */
  statsCacheLastRunStatus?: string | null;
  /** Towns waiting on a rebuild (dirty / 24h backstop), or "all current". */
  statsCacheQueueStatus?: string | null;
  /** Why the last recorded rebuild failed — red row with a reason, not a hang. */
  statsCacheLastRunError?: string | null;
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

const formatTimestamp = formatAdminSyncTimestamp;
const formatTimeOnly = formatAdminSyncTimeOnly;
const formatDateShort = formatAdminSyncDateShort;
const isoCalendarDate = adminSyncCalendarDate;

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

function pickLaterIso(
  a: string | null | undefined,
  b: string | null | undefined,
): string | null {
  const am = parseIsoMs(a);
  const bm = parseIsoMs(b);
  if (am == null && bm == null) return a ?? b ?? null;
  if (am == null) return b ?? null;
  if (bm == null) return a ?? null;
  return am >= bm ? (a ?? null) : (b ?? null);
}

function dropClientTiming(
  prev: Partial<Record<string, SyncTiming>>,
  rowId: string,
): Partial<Record<string, SyncTiming>> {
  if (!(rowId in prev)) return prev;
  const next = { ...prev };
  delete next[rowId];
  return next;
}

/**
 * Client Start/End from a "Sync now" in this browser, or `undefined` once it
 * stops meaning anything.
 *
 * These live in localStorage, so a click whose request died (Lambda timeout,
 * closed tab, 429 from the background hop) leaves an Start with no End that
 * outlives reloads and deploys — the row then reports itself Hung forever off a
 * stamp Postgres never had. Drop it once the hang window passes, or as soon as
 * the server records a finish that postdates it.
 */
function usableClientTiming(
  client: SyncTiming | undefined,
  server: SyncTiming,
  nowMs: number,
): SyncTiming | undefined {
  if (!client) return undefined;
  const clientStartMs = parseIsoMs(client.started);
  const clientEndMs = parseIsoMs(client.finished);
  const serverEndMs = parseIsoMs(server.finished);
  if (clientEndMs == null) {
    if (clientStartMs == null) return undefined;
    if (nowMs - clientStartMs >= HANG_THRESHOLD_MS) return undefined;
    if (serverEndMs != null && serverEndMs >= clientStartMs) return undefined;
    return client;
  }
  if (serverEndMs != null && serverEndMs > clientEndMs) return undefined;
  return client;
}

function timingWithLogFallback(
  row: AdminSyncRow,
  status: PanelStatus | null,
  runTimings: Partial<Record<string, SyncTiming>>,
  runSnapshot: SyncRunLogSnapshot | null,
  nowMs: number,
): SyncTiming {
  const server = timingForRow(row, status);
  const client = usableClientTiming(runTimings[row.id], server, nowMs);

  // Incremental End lives in Neon. A failed Sync now used to freeze Start=End
  // in localStorage and hide later Railway finishes (pink "BROKEN" all day).
  if (row.id === "incremental" && client) {
    const clientStartMs = parseIsoMs(client.started);
    const serverEndMs = parseIsoMs(server.finished);
    const clientStartEqEnd =
      client.finished != null &&
      client.started != null &&
      Math.abs(
        (parseIsoMs(client.finished) ?? 0) - (parseIsoMs(client.started) ?? 0),
      ) < 60_000;
    const inFlightOverlay =
      client.finished == null &&
      clientStartMs != null &&
      (serverEndMs == null || clientStartMs > serverEndMs);
    if (inFlightOverlay) {
      return {
        started: pickLaterIso(client.started, server.started) ?? client.started,
        finished: null,
      };
    }
    return {
      started: pickLaterIso(client.started, server.started),
      finished: clientStartEqEnd
        ? server.finished
        : pickLaterIso(client.finished, server.finished),
    };
  }

  const base = client ?? server;
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

/**
 * Live Start / End from the poll. This has to win over `row.*`: those are props
 * from the server render and never change again, so a tab left open (or a
 * cached render) keeps showing the Start that was open at render time — which
 * the hang check then reports as "Hung · no End" for as long as the tab lives.
 */
function timingForRow(row: AdminSyncRow, status: PanelStatus | null): SyncTiming {
  const live = status ? liveTimingForRow(row, status) : null;
  if (live && (live.started != null || live.finished != null)) return live;
  return { started: row.startedAt ?? null, finished: row.finishedAt ?? null };
}

function liveTimingForRow(row: AdminSyncRow, status: PanelStatus): SyncTiming {
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
    case "open-houses":
      return { started: null, finished: status.openHousesSyncedAt ?? null };
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

function CopyRowIcon({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  if (!text.trim()) return null;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        void navigator.clipboard.writeText(text);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1800);
      }}
      className="inline-flex h-3.5 w-3.5 items-center justify-center text-charcoal/35 hover:text-navy"
      title={copied ? "Copied" : "Copy entire row"}
      aria-label={copied ? "Copied" : "Copy entire row"}
    >
      {copied ? (
        <svg viewBox="0 0 16 16" width="10" height="10" aria-hidden>
          <path
            d="M3.5 8.5 6.5 11.5 12.5 4.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          />
        </svg>
      ) : (
        <svg viewBox="0 0 16 16" width="10" height="10" aria-hidden>
          <rect
            x="5"
            y="5"
            width="8"
            height="8"
            rx="1"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
          />
          <path
            d="M3 11V3h8"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
          />
        </svg>
      )}
    </button>
  );
}

function ClearRowIcon({
  onClear,
  busy,
}: {
  onClear: () => void;
  busy?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClear();
      }}
      disabled={busy}
      className="inline-flex h-3.5 w-3.5 items-center justify-center text-charcoal/35 hover:text-navy disabled:opacity-40"
      title="Clear Start, End, Status, and this job's locks"
      aria-label={busy ? "Clearing row" : "Clear row"}
    >
      <svg viewBox="0 0 16 16" width="10" height="10" aria-hidden>
        <path
          d="M4 4l8 8M12 4l-8 8"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        />
      </svg>
    </button>
  );
}

function formatDashboardRowCopy(fields: {
  order: string | number | null;
  label: string;
  action: string;
  paused?: boolean;
  frequency: string;
  runsOn: string;
  queue: string;
  start: string;
  startIso?: string | null;
  end: string;
  endIso?: string | null;
  next: string;
  nextIso?: string | null;
  status?: string | null;
  errors?: string | null;
}): string {
  const lines = [
    fields.order != null ? `#${fields.order} ${fields.label}` : fields.label,
    `Action: ${fields.action}`,
    fields.paused ? "Paused: yes" : null,
    `Frequency: ${fields.frequency}`,
    `Runs on: ${fields.runsOn}`,
    `Queue: ${fields.queue}`,
    `Start: ${fields.start}${fields.startIso ? ` (${fields.startIso})` : ""}`,
    `End: ${fields.end}${fields.endIso ? ` (${fields.endIso})` : ""}`,
    `Next: ${fields.next}${fields.nextIso ? ` (${fields.nextIso})` : ""}`,
    fields.status ? `Status:\n${fields.status}` : null,
    fields.errors ? `Errors:\n${fields.errors}` : null,
  ];
  return lines.filter((line): line is string => Boolean(line)).join("\n");
}

function ClampLine({
  text,
  className,
}: {
  text: string | undefined;
  className: string;
}) {
  const [expanded, setExpanded] = useState(false);
  if (!text) {
    return <span className="font-mono text-[9px] text-charcoal/30">—</span>;
  }
  const isLong = text.length > 72 || text.includes("\n");
  return (
    <div className="min-w-0">
      <p
        className={`text-[9px] leading-snug ${className} ${
          expanded
            ? "break-words whitespace-pre-line"
            : "truncate whitespace-nowrap"
        }`}
        title={!expanded ? text : undefined}
      >
        {text}
      </p>
      {isLong ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-0.5 font-mono text-[8px] text-navy/40 hover:text-navy hover:underline underline-offset-1"
        >
          {expanded ? "less" : "…"}
        </button>
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
  "open-houses": "open-houses",
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

function isTimingInProgress(
  timing: SyncTiming,
  nowMs: number,
  maxOpenMs = HANG_THRESHOLD_MS,
): boolean {
  const startedMs = parseIsoMs(timing.started);
  if (startedMs == null) return false;
  const finishedMs = parseIsoMs(timing.finished);
  if (finishedMs != null && finishedMs >= startedMs) return false;
  return nowMs - startedMs < maxOpenMs;
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
  if (dueMs == null || nowMs <= dueMs + SCHEDULE_CLAIM_GRACE_MS) return false;
  const finishedMs = parseIsoMs(finishedAt);
  if (finishedMs == null) return true;
  return finishedMs < dueMs;
}

/** True when last End is older than the Configure cadence allows. */
function isFinishPastCadence(
  finishedAt: string | null,
  frequency: SyncScheduleFrequencyId | undefined,
  nowMs: number,
): boolean {
  const finishedMs = parseIsoMs(finishedAt);
  if (finishedMs == null || !frequency) return false;
  const intervalMs = frequencyIntervalMs(frequency);
  if (intervalMs != null) {
    return nowMs - finishedMs >= intervalMs + SCHEDULE_CLAIM_GRACE_MS;
  }
  // Calendar jobs: one whole period without an End. Inferring the missed slot
  // from Next − period used to contradict Next itself — a daily job that
  // finished 13h ago read Overdue beside a Next a day out. Next now surfaces an
  // unserved past slot on its own, so this is only the long-silence backstop.
  const periodMs =
    frequency === "daily"
      ? 24 * 60 * 60_000
      : frequency === "weekly"
        ? 7 * 24 * 60 * 60_000
        : frequency === "monthly"
          ? 31 * 24 * 60 * 60_000
          : null;
  if (periodMs == null) return false;
  return nowMs - finishedMs >= periodMs + SCHEDULE_CLAIM_GRACE_MS;
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
   * Runner-owned jobs: ignore open Start hang. The queue row and its deadline
   * are the authority on a wedged run, so a stale Start without End is Status
   * text here, not a Hung row.
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
  const [queueActionId, setQueueActionId] = useState<number | null>(null);
  const scheduleConfig =
    status?.scheduleConfig ?? defaultSyncScheduleConfig();
  const orderByRow = orderNumberByRow(scheduleConfig);
  const syncQueue = status?.syncQueue ?? emptySyncQueueSnapshot();
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
  const [clickQueue, setClickQueue] = useState<ClickQueueItem[]>([]);
  const clickQueueRef = useRef<ClickQueueItem[]>([]);
  const runningLabelRef = useRef<string | null>(null);
  const runningIdRef = useRef<AdminSyncActionId | "sync-all-caches" | null>(null);
  const [messages, setMessages] = useState<Partial<Record<string, string>>>({});
  // localStorage-backed state is hydrated AFTER mount (see effect below) so the
  // first client render matches the server's empty render — reading storage in a
  // lazy initializer would diverge and trip a hydration mismatch.
  const storageHydratedRef = useRef(false);
  // Errors are persisted to localStorage so error text and red row backgrounds
  // survive page refreshes. Cleared when a new sync starts on that row, when
  // the click succeeds, and when server End moves past the error (Railway /
  // background finish).
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const errorAtRef = useRef<Partial<Record<string, number>>>({});
  useEffect(() => {
    if (!storageHydratedRef.current) return;
    try {
      localStorage.setItem(
        "admin-sync-errors",
        serializeStoredSyncErrors(errors, errorAtRef.current),
      );
    } catch {
      /* ignore */
    }
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
  const [clearingId, setClearingId] = useState<string | null>(null);
  const [syncAllSummary, setSyncAllSummary] = useState<string | null>(null);
  /** Shown under Sync all while a run is active; cleared when the run ends. */
  const [syncAllPlanNote, setSyncAllPlanNote] = useState<string | null>(null);

  const replaceClickQueue = useCallback(
    (next: ClickQueueItem[] | ((prev: ClickQueueItem[]) => ClickQueueItem[])) => {
      setClickQueue((prev) => {
        const resolved = typeof next === "function" ? next(prev) : next;
        clickQueueRef.current = resolved;
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
    const queued = clickQueueRef.current;
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
      if (rawErrors) {
        const parsed = parseStoredSyncErrors(rawErrors);
        errorAtRef.current = parsed.atMs;
        setErrors(parsed.errors);
      }
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
        // A run cannot still be in flight from a previous session — keep only
        // finished pairs so yesterday's dead click cannot read as Hung today.
        const stored = JSON.parse(rawTimings) as Partial<
          Record<string, SyncTiming>
        >;
        const settled: Partial<Record<string, SyncTiming>> = {};
        for (const [rowId, timing] of Object.entries(stored)) {
          if (timing?.finished) settled[rowId] = timing;
        }
        setRunTimings(settled);
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
    if (!storageHydratedRef.current) return;
    const nextAt = { ...errorAtRef.current };
    const nowMs = Date.now();
    for (const [id, text] of Object.entries(errors)) {
      if (!text) {
        delete nextAt[id];
        continue;
      }
      if (nextAt[id] == null) nextAt[id] = nowMs;
    }
    for (const id of Object.keys(nextAt)) {
      if (!errors[id]) delete nextAt[id];
    }
    errorAtRef.current = nextAt;
  }, [errors]);

  useEffect(() => {
    if (!storageHydratedRef.current || !status) return;
    const ids = Object.keys(errors).filter((id) => Boolean(errors[id]));
    if (ids.length === 0) return;
    const nowMs = Date.now();
    const toClear: string[] = [];
    for (const id of ids) {
      if (
        shouldClearErrorAfterCleanFinish({
          errorAtMs: errorAtRef.current[id],
          finishedAt: finishedAtForErrorRow(id, rows, status),
          nowMs,
        })
      ) {
        toClear.push(id);
      }
    }
    if (toClear.length === 0) return;
    for (const id of toClear) {
      delete errorAtRef.current[id];
      clearPendingRetry(id);
    }
    setErrors((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const id of toClear) {
        if (next[id] == null) continue;
        delete next[id];
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [status, errors, rows, clearPendingRetry]);

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

  /**
   * Drop a waiting row. A running one belongs to the child the runner forked,
   * so the API records the intent and lets the deadline do the killing rather
   * than orphaning a process nobody is watching.
   */
  const cancelQueueItem = useCallback(async (id: number) => {
    setQueueActionId(id);
    try {
      const res = await fetch("/api/admin/sync-queue", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "cancel", id }),
      });
      const body = (await res.json()) as {
        queue?: SyncQueueSnapshot;
        error?: string;
      };
      if (!res.ok) {
        console.warn("[admin sync-queue]", body.error ?? res.status);
        return;
      }
      if (body.queue) {
        setStatus((prev) => (prev ? { ...prev, syncQueue: body.queue } : prev));
      }
    } catch (err) {
      console.warn("[admin sync-queue]", err);
    } finally {
      setQueueActionId(null);
    }
  }, []);

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

  // Unconditional on mount — a cached RSC payload can carry a stale
  // initialPausedJobs after Communications flipped market-digest Enabled.
  useEffect(() => {
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
  }, []);

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
        | { jobId: ScheduledSyncJobId; budgetMinutes: number }
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
      // Communications → Enabled writes the market-digest Pause flag, so the
      // Pause column has to re-read too — schedule config alone leaves the
      // checkbox showing the pre-edit value until a full reload.
      void fetch("/api/admin/scheduled-sync", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((body: { jobs?: ScheduledSyncPausedJobs } | null) => {
          if (body?.jobs) setPausedJobs(body.jobs);
        })
        .catch(() => {});
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

  const drainClickQueueRef = useRef<() => void>(() => {});

  const finishRunningJob = useCallback(() => {
    setRunningJob(null, null);
    void refreshStatus();
    // Defer drain so runningIdRef is cleared before the next job starts.
    queueMicrotask(() => drainClickQueueRef.current());
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
              setRunTimings((prev) =>
                row.id === "incremental"
                  ? dropClientTiming(prev, row.id)
                  : {
                      ...prev,
                      [row.id]: {
                        started: body.startedAt ?? startedAt,
                        finished: body.finishedAt ?? new Date().toISOString(),
                      },
                    },
              );
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
            setRunTimings((prev) =>
              row.id === "incremental"
                ? dropClientTiming(prev, row.id)
                : {
                    ...prev,
                    [row.id]: {
                      started: startedAt,
                      finished: new Date().toISOString(),
                    },
                  },
            );
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

      const alreadyQueued = clickQueueRef.current.some(
        (item) => item.kind === "action" && item.rowId === row.id,
      );
      if (alreadyQueued) return;

      if (runningIdRef.current != null) {
        clearPendingRetry(row.id);
        syncAttemptCountRef.current[row.id] = 0;
        const blocker = runningLabelRef.current ?? "current sync";
        replaceClickQueue((prev) => [
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
    [executeSync, replaceClickQueue, clearPendingRetry],
  );

  const clearRowState = useCallback(
    async (row: AdminSyncRow) => {
      const actionId = row.actionId;
      if (!actionId || clearingId) return;
      const confirmed = window.confirm(
        `Clear Start, End, Status, and locks for ${row.label}?\n\nDoes not delete listings or cached stats. Sync now will write a fresh run.`,
      );
      if (!confirmed) return;
      setClearingId(row.id);
      try {
        const res = await fetch("/api/admin/sync", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: actionId, reset: true }),
        });
        const body = (await res.json().catch(() => null)) as {
          ok?: boolean;
          error?: string;
        } | null;
        if (!res.ok || body?.ok === false) {
          setErrors((prev) => ({
            ...prev,
            [row.id]: body?.error ?? `Clear failed (HTTP ${res.status})`,
          }));
          return;
        }
        setErrors((prev) => ({ ...prev, [row.id]: undefined }));
        setMessages((prev) => ({ ...prev, [row.id]: undefined }));
        setDescriptions((prev) => {
          const next = { ...prev };
          delete next[row.id];
          return next;
        });
        setFinalStatuses((prev) => {
          const next = { ...prev };
          delete next[row.id];
          try {
            localStorage.setItem(
              "admin-sync-final-statuses",
              JSON.stringify(next),
            );
          } catch {
            /* ignore */
          }
          return next;
        });
        setRunTimings((prev) => dropClientTiming(prev, row.id));
        setRunSnapshot((prev) =>
          prev && runLogMatchesRow(row, prev) ? null : prev,
        );
        clearPendingRetry(row.id);
        await refreshStatus();
      } catch (err) {
        setErrors((prev) => ({
          ...prev,
          [row.id]:
            err instanceof Error ? err.message : "Clear failed",
        }));
      } finally {
        setClearingId(null);
      }
    },
    [clearingId, clearPendingRetry, refreshStatus],
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
              setRunTimings((prev) =>
                rowId === "incremental"
                  ? dropClientTiming(prev, rowId)
                  : {
                      ...prev,
                      [rowId]: {
                        started: body.startedAt ?? startedAt,
                        finished: body.finishedAt ?? new Date().toISOString(),
                      },
                    },
              );
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
    if (clickQueueRef.current.some((item) => item.kind === "sync-all")) return;

    if (runningIdRef.current != null) {
      const blocker = runningLabelRef.current ?? "current sync";
      replaceClickQueue((prev) => [...prev, { kind: "sync-all" }]);
      setSyncAllPlanNote(formatWaitingStatus(blocker));
      return;
    }

    void executeSyncAll();
  }, [executeSyncAll, replaceClickQueue]);

  drainClickQueueRef.current = () => {
    if (runningIdRef.current != null) return;
    const next = clickQueueRef.current[0];
    if (!next) return;
    replaceClickQueue((prev) => prev.slice(1));
    if (next.kind === "sync-all") {
      void executeSyncAll();
      return;
    }
    const row = rows.find((r) => r.id === next.rowId);
    if (!row?.actionId) {
      queueMicrotask(() => drainClickQueueRef.current());
      return;
    }
    void executeSync(row);
  };

  const syncAllQueued = clickQueue.some((item) => item.kind === "sync-all");
  const queuedRowIds = new Set(
    clickQueue.filter((item) => item.kind === "action").map((item) => item.rowId),
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
                Tap Sync now (or Sync all). Long jobs go onto the shared
                sync_queue ahead of the scheduled sweeps and the runner forks a
                child for each one; the Queue column shows where a job sits and
                how much of its budget is left. Everything else still runs on a
                Netlify function. Running jobs stay on top. Pause, cadence, and
                budgets live under Configure. Incremental fills Postgres; the{" "}
                <a
                  href="#admin-latest-page"
                  className="text-navy underline decoration-navy/25 underline-offset-2 hover:decoration-navy"
                >
                  Latest page
                </a>{" "}
                card above shows whether /latest is actually serving those updates.
              </p>
              <p className="font-mono text-[9px] text-charcoal/45 leading-snug max-w-xl">
                Start / End / Next clocks are Eastern (America/New_York), labeled
                ET — same zone as Configure start times. Stored meta is UTC; the
                dashboard converts for display.
              </p>
            </>
          ) : (
            <>
              <p className="text-xs text-slate leading-relaxed max-w-2xl">
                Pause skips Sync all and cron. Frequency and Start time (ET) say
                when a job becomes due; Budget says how long a run may take
                before the runner kills its child and records a timeout instead
                of leaving a Start with no End. Next start is read-only.
              </p>
              <p className="font-mono text-[9px] text-charcoal/45 leading-snug max-w-2xl">
                There is no host to pick. A due job is enqueued on sync_queue by
                whoever notices, the always-on runner claims it and runs it in a
                forked child, and a Netlify function only steps in when a row
                has sat unclaimed long enough to prove the runner is gone.
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
          now={now}
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
                  title="Minutes a run gets before the runner kills its child and records a timeout"
                >
                  Budget
                </th>
              ) : null}
              {isDashboard ? (
                <th
                  className={TH}
                  title="Place in the durable sync_queue — queued, running with time left, or how the last run ended"
                >
                  Queue
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
              {isDashboard ? (
                <th
                  className={TH}
                  title="Last run start — America/New_York (ET)"
                >
                  Start (ET)
                </th>
              ) : null}
              {isDashboard ? (
                <th
                  className={TH}
                  title="Last run end — America/New_York (ET)"
                >
                  End (ET)
                </th>
              ) : null}
              {isDashboard ? (
                <th
                  className={TH}
                  title="Next scheduled run — America/New_York (ET)"
                >
                  Next (ET)
                </th>
              ) : null}
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
                ? timingWithLogFallback(
                    fullResyncRow,
                    status,
                    runTimings,
                    runSnapshot,
                    nowMsOuter,
                  )
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
                const timing = timingWithLogFallback(
                  row,
                  status,
                  runTimings,
                  runSnapshot,
                  nowMsOuter,
                );
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
              const nowMs = now.getTime();
              const visionLiveFresh =
                row.id === "vision-addresses" &&
                status?.visionAddressesLive?.status === "running" &&
                (() => {
                  const t = parseIsoMs(status.visionAddressesLive?.updatedAt);
                  return t != null && nowMs - t < 3 * 60 * 1000;
                })();
              const isRunning =
                (row.actionId != null && runningId === row.actionId) ||
                (runningId === "full-resync" && row.id === "full-resync") ||
                visionLiveFresh;
              const isWaiting = queuedRowIds.has(row.id);
              const pendingRetry = pendingRetries[row.id];
              const rowError = pendingRetry
                ? formatErrorWithRetry(
                    pendingRetry.baseError,
                    pendingRetry.retryAtMs,
                    pendingRetry.attemptsLeft,
                    nowMs,
                  )
                : (errors[row.id] ??
                  (row.id === "stats-cache"
                    ? (status?.statsCacheLastRunError ?? undefined)
                    : undefined));
              const disabled = !row.actionId || isRunning || isWaiting;
              const timing = timingWithLogFallback(
                row,
                status,
                runTimings,
                runSnapshot,
                nowMs,
              );
              const showSingleTimestamp =
                row.id === "latest-mls" ||
                row.id === "property-addresses" ||
                row.id === "vision-addresses" ||
                row.id === "zip-boundaries" ||
                row.id === "open-houses" ||
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
              // Open Start without End = in flight even if the live breadcrumb
              // was cleared — Postgres Start is the signal. Bounded by the pull
              // window: a Start open longer than that is a dead run, not a pull.
              const incrementalOpenInFlight =
                row.id === "incremental" &&
                isTimingInProgress(
                  timing,
                  nowMs,
                  INCREMENTAL_OPEN_START_IN_PULL_MS,
                );
              const incrementalRunningNow =
                incrementalLiveNow || incrementalOpenInFlight;
              // Who runs this job is now a fact about the queue, not a radio:
              // anything in SYNC_QUEUE_RUNNER_JOBS belongs to the sync runner.
              const runnerOwned = pauseJob
                ? isSyncQueueRunnerJob(pauseJob)
                : false;
              const incrementalOnRunner =
                row.id === "incremental" && runnerOwned;
              const orphanIncrementalStart =
                row.id === "incremental" &&
                isOrphanIncrementalStart(
                  timing,
                  status?.lastEventbridgeIngressAt,
                  incrementalRunningNow,
                  nowMs,
                );
              const incrementalHealth =
                row.id === "incremental"
                  ? evaluateIncrementalHealth({
                      host: incrementalOnRunner ? "runner" : "netlify",
                      heartbeatAt: status?.lastMlsSyncHeartbeat,
                      finishedAt: timing.finished,
                      startedAt: timing.started,
                      nowMs,
                      liveInFlight: incrementalRunningNow,
                      partialTowns: status?.incrementalPartial?.towns,
                    })
                  : null;
              const incrementalEndBroken = Boolean(
                incrementalHealth?.inventoryStale && !incrementalRunningNow,
              );
              const runnerHeartbeatAlive = Boolean(
                incrementalOnRunner && incrementalHealth?.processAlive,
              );
              const runnerInPull = Boolean(
                incrementalOnRunner && incrementalHealth?.inPull,
              );
              const doorbellErrorOnly =
                incrementalOnRunner &&
                runnerHeartbeatAlive &&
                isMlsSyncDoorbellError(rowError);
              // Configure is schedule/setup only — no live status colors.
              const visualResolved = isConfigure
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
                      runnerInPull,
                    syncAllRunning,
                    fullResyncInProgress,
                    error: doorbellErrorOnly ? undefined : rowError,
                    nowMs,
                    ignoreTimingHang: runnerOwned,
                    forceAlert: incrementalOnRunner
                      ? incrementalHealth?.process === "dead"
                      : incrementalEndBroken,
                  });
              // Stale End with a live runner process is not success — keep the
              // row uncolored (STALE in Status) instead of sage green.
              const visual =
                visualResolved === "ok" &&
                incrementalOnRunner &&
                incrementalEndBroken
                  ? ("idle" as const)
                  : visualResolved;
              const scheduleBreached =
                isScheduleBreached(nextRunAt, timing.finished, nowMs) ||
                isFinishPastCadence(
                  timing.finished,
                  jobSchedule?.frequency,
                  nowMs,
                );
              // An open Start with no End belongs in Errors, not in Next: Next
              // answers "when does this run again", not "how did the last run
              // end". Reported as evidence (Start clock + age), never as a claim
              // about a Postgres value we did not read.
              const rowHung =
                !incrementalRunningNow &&
                !runnerOwned &&
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

              /**
               * This row's place in the durable queue.
               *
               * `sync_queue` is the only thing that knows a job was asked for
               * but has not started, so Dashboard reads it rather than
               * inferring intent from an ingress timestamp.
               */
              const queueJobId = runnerOwned && pauseJob ? pauseJob : null;
              const queueRunning = queueJobId
                ? (syncQueue.running.find((item) => item.jobId === queueJobId) ??
                  null)
                : null;
              const queueWaiting = queueJobId
                ? (syncQueue.waiting.find((item) => item.jobId === queueJobId) ??
                  null)
                : null;
              const queuePosition = queueJobId
                ? syncQueuePositionForJob(syncQueue, queueJobId)
                : null;
              const queueRecent = queueJobId
                ? (syncQueue.recent.find((item) => item.jobId === queueJobId) ??
                  null)
                : null;
              /** Minutes left on the running child before the runner kills it. */
              const queueBudgetLeft = (() => {
                if (!queueRunning) return null;
                const remainingMs = syncQueueBudgetRemainingMs(
                  queueRunning,
                  nowMs,
                );
                if (remainingMs == null) return null;
                return remainingMs >= 0
                  ? `${Math.max(1, Math.round(remainingMs / 60_000))}m left`
                  : "over budget";
              })();
              const queueLine = (() => {
                if (!queueJobId) return null;
                if (queueRunning) {
                  return [
                    "Queue: running",
                    queueBudgetLeft,
                    syncQueue.runnerStale ? "runner silent" : null,
                  ]
                    .filter(Boolean)
                    .join(" · ");
                }
                if (queueWaiting) {
                  return [
                    `Queue: waiting${queuePosition ? ` #${queuePosition}` : ""}`,
                    `asked ${
                      formatAgeAgo(queueWaiting.requestedAt, nowMs) ?? "just now"
                    }`,
                    syncQueue.runnerStale
                      ? "runner silent — Netlify will rescue it"
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ");
                }
                if (queueRecent?.outcome && queueRecent.outcome !== "done") {
                  return [
                    `Queue: ${syncQueueOutcomeLabel(queueRecent.outcome)}`,
                    queueRecent.finishedAt
                      ? (formatAgeAgo(queueRecent.finishedAt, nowMs) ?? null)
                      : null,
                    queueRecent.detail,
                  ]
                    .filter(Boolean)
                    .join(" · ");
                }
                return null;
              })();

              /** One glance line for AWS hits — the ingress still enqueues. */
              const eventbridgePulseLine = (() => {
                if (row.id !== "incremental") return null;
                if (!status?.lastEventbridgeIngressAt) return null;
                const when =
                  formatAgeAgo(status.lastEventbridgeIngressAt, nowMs) ??
                  formatTimestamp(status.lastEventbridgeIngressAt);
                const result = humanizeEventBridgeIngressResult(
                  status.lastEventbridgeIngressResult,
                );
                return result ? `AWS ${when} · ${result}` : `AWS ${when}`;
              })();

              /** Sync runner heartbeat — peace of mind that the process is up. */
              const runnerPulseLine = (() => {
                if (!incrementalOnRunner) return null;
                if (!status?.lastMlsSyncHeartbeat) {
                  return "Runner: no heartbeat yet";
                }
                const when =
                  formatAgeAgo(status.lastMlsSyncHeartbeat, nowMs) ??
                  formatTimestamp(status.lastMlsSyncHeartbeat);
                return `heartbeat ${when}`;
              })();

              /** Single truth strip for the runner-owned Incremental row. */
              const runnerTruthStrip = (() => {
                if (!incrementalOnRunner || !incrementalHealth) return null;
                const heartbeatLabel = status?.lastMlsSyncHeartbeat
                  ? `heartbeat ${
                      formatAgeAgo(status.lastMlsSyncHeartbeat, nowMs) ??
                      formatTimestamp(status.lastMlsSyncHeartbeat)
                    }`
                  : "heartbeat missing";
                const endLabel = timing.finished
                  ? formatAgeAgo(timing.finished, nowMs) ??
                    formatTimestamp(timing.finished)
                  : "missing";
                return formatRunnerHealthStrip({
                  health: incrementalHealth,
                  heartbeatLabel,
                  endLabel,
                  upsertLabel: status?.lastIncrementalUpsertsLabel,
                  liveStatus:
                    status?.incrementalLiveStatus ??
                    formatIncrementalSyncLiveStatus(status?.incrementalLive),
                });
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
                if (row.id === "vision-addresses" && status?.visionAddressesLiveStatus) {
                  if (isRunning || visionLiveFresh) {
                    return `RUNNING · ${status.visionAddressesLiveStatus}`;
                  }
                  if (status.visionAddressesLive?.status === "error") {
                    return `FAILED · ${status.visionAddressesLiveStatus}`;
                  }
                }
                if (
                  isRunning ||
                  syncAllRunning ||
                  incrementalRunningNow ||
                  runnerInPull ||
                  visionLiveFresh
                ) {
                  if (row.id === "incremental" && runnerTruthStrip) {
                    return [runnerTruthStrip, queueLine]
                      .filter(Boolean)
                      .join("\n");
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
                    if (runnerPulseLine) bits.push(`Runner ${runnerPulseLine}`);
                    else if (incrementalOnRunner) {
                      bits.push("Runner: no heartbeat yet");
                    }
                    if (queueLine) bits.push(queueLine);
                    return bits.join("\n");
                  }
                  return live ?? "Running…";
                }
                // Prefer durable server truth over localStorage “Queued…” leftovers.
                if (row.id === "incremental") {
                  if (runnerTruthStrip) {
                    return [runnerTruthStrip, queueLine]
                      .filter(Boolean)
                      .join("\n");
                  }

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
                  if (queueLine) idleBits.push(queueLine);
                  if (eventbridgePulseLine) idleBits.push(eventbridgePulseLine);
                  if (
                    !upsertLabel &&
                    !runnerOwned &&
                    status?.incrementalStepLog?.summary
                  ) {
                    const src = status.incrementalStepLog.source
                      ? `${status.incrementalStepLog.source}: `
                      : "";
                    idleBits.push(
                      `${src}${status.incrementalStepLog.summary}`,
                    );
                  }
                  if (!runnerOwned && scheduleBreached && timing.finished) {
                    idleBits.push("overdue vs Netlify schedule");
                  }
                  return idleBits.join("\n");
                }
                /**
                 * Stats cache rebuilds per dirty town, so Start/End alone hide
                 * the two things the operator needs: what the last run covered
                 * and what is still waiting.
                 */
                if (row.id === "stats-cache") {
                  const lastRun =
                    status?.statsCacheLastRunStatus?.trim() ||
                    descriptions[row.id] ||
                    finalStatuses[row.id] ||
                    statusTextFromRunLog(row, runSnapshot);
                  const townQueue = status?.statsCacheQueueStatus?.trim();
                  return [lastRun, townQueue, queueLine]
                    .filter(Boolean)
                    .join("\n");
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
                  const overdue =
                    prior && prior.length <= 48
                      ? `${prior} · overdue (${age})`
                      : prior
                        ? `Overdue — last End ${age}`
                        : `Overdue — last End ${age} (expected run missed)`;
                  return [overdue, queueLine].filter(Boolean).join("\n");
                }
                return [prior, queueLine].filter(Boolean).join("\n") || prior;
              })();

              const descriptionText =
                row.id === "incremental"
                  ? isConfigure
                    ? "Modified-since RETS pull across all towns"
                    : `Modified-since RETS pull${
                        status?.lastIncrementalCronTick
                          ? ` · Cron last fired ${
                              formatAgeAgo(
                                status.lastIncrementalCronTick,
                                nowMs,
                              ) ??
                              formatTimestamp(status.lastIncrementalCronTick)
                            }`
                          : " · Cron last fired: never (no Netlify */30 tick yet — Sync now enqueues without stamping the cron)"
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
                  Boolean(queueWaiting) ||
                  scheduleBreached ||
                  Boolean(statusText && statusText.includes("\n")));
              const cellPad = rowExpands ? TD_EXPAND : TD;
              const rowCopyText = formatDashboardRowCopy({
                order: orderLabel,
                label: [row.label, rowPaused ? "Paused" : null]
                  .filter(Boolean)
                  .join(" · "),
                action: !row.actionId
                  ? "—"
                  : isRunning
                    ? "Syncing"
                    : isWaiting
                      ? "Queued"
                      : "Sync",
                paused: rowPaused,
                frequency: jobSchedule
                  ? frequencyLabel(jobSchedule.frequency)
                  : (derivedScheduleHint ?? "—"),
                runsOn: pauseJob ? syncJobHostLabel(pauseJob) : "—",
                queue: queueLine ?? (queueJobId ? "Queue: idle" : "—"),
                start: timing.started
                  ? [formatTimeOnly(timing.started), formatAgeAgo(timing.started, nowMs)]
                      .filter((bit) => bit && bit !== "just now")
                      .join(" · ")
                  : "—",
                startIso: timing.started,
                end: timing.finished
                  ? [
                      incrementalPriorEnd ? "Prior" : null,
                      formatTimeOnly(timing.finished),
                      formatAgeAgo(timing.finished, nowMs),
                    ]
                      .filter((bit) => bit && bit !== "just now")
                      .join(" · ")
                  : "—",
                endIso: timing.finished,
                next: nextRunAt
                  ? [
                      formatAdminNextSyncAt(nextRunAt, now),
                      scheduleBreached ? "Overdue" : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")
                  : "—",
                nextIso: nextRunAt,
                status: statusText,
                errors: rowError ?? hangNotice ?? null,
              });

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
                      <div className="inline-flex flex-col items-center gap-0.5">
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
                        {isDashboard ? (
                          <div className="inline-flex items-center gap-0.5">
                            <CopyRowIcon text={rowCopyText} />
                            {row.actionId ? (
                              <ClearRowIcon
                                onClear={() => void clearRowState(row)}
                                busy={clearingId === row.id}
                              />
                            ) : null}
                          </div>
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
                            runnerOwned
                              ? "Enqueue on sync_queue ahead of the sweeps — the runner forks a child for it"
                              : "Sync via Netlify worker queue"
                          }
                          className="font-mono text-[8px] tracking-[0.1em] uppercase rounded-full px-2 py-0.5 border border-navy/20 text-navy bg-white hover:bg-cream/80 disabled:opacity-40 disabled:pointer-events-none transition-colors whitespace-nowrap"
                        >
                          {isRunning
                            ? "Syncing"
                            : isWaiting
                              ? "Queued"
                              : "Sync"}
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
                  <td className={`${cellPad} min-w-0`}>
                    <p
                      className="font-mono text-[9px] tracking-[0.12em] uppercase text-charcoal/60 leading-snug whitespace-normal break-words"
                      title={row.label}
                    >
                      {row.label}
                      {isDashboard && pauseJob && pausedJobs[pauseJob] ? (
                        <span className="ml-1.5 normal-case tracking-wide text-coral/80">
                          · Paused
                        </span>
                      ) : null}
                    </p>
                    {row.sourceHref ? (
                      <a
                        href={row.sourceHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-0.5 block font-mono text-[9px] tracking-wide text-navy/70 break-all hover:underline"
                        title="Town Vision GIS homepage"
                      >
                        {row.sourceLabel ?? row.sourceHref}
                      </a>
                    ) : null}
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
                      {queueJobId ? (
                        <div className="flex flex-col items-start gap-0.5 min-w-0">
                          <span
                            className={`font-mono text-[10px] tracking-wide leading-snug ${
                              queueRunning
                                ? "text-gold"
                                : queueWaiting
                                  ? "text-navy"
                                  : queueRecent?.outcome &&
                                      queueRecent.outcome !== "done"
                                    ? "text-coral"
                                    : "text-navy/60"
                            }`}
                            title={
                              queueRunning
                                ? `Claimed by ${queueRunning.claimedBy ?? "the runner"} — killed at ${
                                    queueRunning.deadlineAt
                                      ? formatTimestamp(queueRunning.deadlineAt)
                                      : "its deadline"
                                  }`
                                : queueWaiting
                                  ? `Asked by ${queueWaiting.trigger} at ${formatTimestamp(queueWaiting.requestedAt)}`
                                  : (queueRecent?.detail ??
                                    "Nothing waiting for this job")
                            }
                          >
                            {queueRunning
                              ? (queueBudgetLeft ?? "Running")
                              : queueWaiting
                                ? `Queued${queuePosition ? ` #${queuePosition}` : ""}`
                                : queueRecent
                                  ? syncQueueOutcomeLabel(queueRecent.outcome)
                                  : "Idle"}
                          </span>
                          {queueWaiting ? (
                            <button
                              type="button"
                              onClick={() =>
                                void cancelQueueItem(queueWaiting.id)
                              }
                              disabled={queueActionId === queueWaiting.id}
                              className="font-mono text-[8px] tracking-[0.1em] uppercase text-charcoal/45 hover:text-coral underline-offset-2 hover:underline disabled:opacity-40"
                            >
                              {queueActionId === queueWaiting.id
                                ? "Cancelling…"
                                : "Cancel"}
                            </button>
                          ) : null}
                          {syncQueue.runnerStale ? (
                            <span
                              className="font-mono text-[8px] tracking-wide text-coral/80"
                              title={
                                // A process that is up while nothing drains is
                                // the mid-deploy state, and it reads very
                                // differently from a runner that is simply down.
                                syncQueue.drainHeartbeatAt
                                  ? `Nothing has drained the queue since ${formatTimestamp(syncQueue.drainHeartbeatAt)}`
                                  : syncQueue.runnerHeartbeatAt
                                    ? `The mls-sync process is alive (heartbeat ${formatTimestamp(syncQueue.runnerHeartbeatAt)}) but has never drained the queue — it is probably still on a build that predates it. Netlify is covering.`
                                    : "No runner has ever checked in"
                              }
                            >
                              {syncQueue.drainHeartbeatAt == null &&
                              syncQueue.runnerHeartbeatAt
                                ? "runner up, not draining"
                                : "runner silent"}
                            </span>
                          ) : null}
                        </div>
                      ) : (
                        <p
                          className="font-mono text-[10px] tracking-wide text-charcoal/40 leading-snug"
                          title="Netlify scheduled function owns this job end to end"
                        >
                          Netlify
                        </p>
                      )}
                    </td>
                  ) : null}
                  {isConfigure ? (
                    <td className={TD_EXPAND}>
                      <p className="font-mono text-[9px] tracking-wide leading-snug text-charcoal/45">
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
                        <div className="flex flex-col gap-1 min-w-0">
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              min={SYNC_JOB_BUDGET_MIN_MINUTES}
                              max={SYNC_JOB_BUDGET_MAX_MINUTES}
                              step={5}
                              defaultValue={resolveJobBudgetMinutes(
                                pauseJob,
                                jobSchedule,
                              )}
                              key={`budget-${pauseJob}-${resolveJobBudgetMinutes(pauseJob, jobSchedule)}`}
                              disabled={scheduleSavingJob === pauseJob}
                              aria-label={`Kill budget in minutes for ${row.label}`}
                              className="w-16 rounded border border-charcoal/15 bg-white px-1.5 py-1 font-mono text-[11px] tabular-nums text-navy disabled:opacity-40"
                              onBlur={(e) => {
                                const next = Number(e.target.value);
                                const current = resolveJobBudgetMinutes(
                                  pauseJob,
                                  jobSchedule,
                                );
                                if (!Number.isFinite(next) || next === current) {
                                  e.target.value = String(current);
                                  return;
                                }
                                void patchScheduleConfig({
                                  jobId: pauseJob,
                                  budgetMinutes: next,
                                });
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") e.currentTarget.blur();
                              }}
                            />
                            <span className="font-mono text-[10px] tracking-wide text-charcoal/45">
                              min
                            </span>
                          </div>
                          <span className="font-mono text-[9px] tracking-wide leading-snug text-charcoal/40">
                            {syncJobHostLabel(pauseJob)}
                          </span>
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
                        } else if (queueWaiting) {
                          // Real wall clock below; say it is already asked for.
                          nextStatusText = "Queued";
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
                                    queueWaiting
                                      ? "Already on sync_queue — this is the cadence, not the wait"
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
                                {nextJobId && !isPostDeployNext ? (
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
                        <ClampLine
                          text={statusText}
                          className={
                            isRunning ||
                            syncAllRunning ||
                            incrementalRunningNow ||
                            runnerInPull ||
                            isWaiting
                              ? "font-mono text-gold uppercase tracking-wide"
                              : "text-slate/80"
                          }
                        />
                      </td>
                      <td
                        className={`${cellPad} border-r-0 hidden md:table-cell`}
                      >
                        {rowError || hangNotice ? (
                          <div className="space-y-1 min-w-0">
                            <ClampLine
                              text={rowError ?? hangNotice ?? undefined}
                              className={
                                rowError ? "font-mono text-coral" : "font-mono text-rose-600/80"
                              }
                            />
                            {row.actionId &&
                            !isRunning &&
                            !isWaiting &&
                            !syncAllRunning ? (
                              <button
                                type="button"
                                onClick={() => runSync(row)}
                                disabled={false}
                                className="font-mono text-[8px] tracking-[0.1em] uppercase rounded-full px-2 py-0.5 border border-coral/40 text-coral bg-rose-50 hover:bg-rose-100 disabled:opacity-40 disabled:pointer-events-none transition-colors"
                              >
                                {pendingRetry ? "↺ Retry" : "↺ Retry"}
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
