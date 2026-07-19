"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
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
import { SCHEDULED_SYNC_JOB_BY_ROW } from "@/lib/scheduled-sync-jobs";
import {
  emptyScheduledSyncPausedJobs,
  type ScheduledSyncJobId,
  type ScheduledSyncPausedJobs,
} from "@/lib/scheduled-sync-jobs-shared";
import { formatBytes } from "@/lib/sqlite-schema-diagram-types";
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

export type PanelStatus = {
  refreshing: boolean;
  lastRefreshFinished: string | null;
  lastRefreshStarted: string | null;
  latestListingUpdate: string | null;
  propertyAddressesSyncedAt?: string | null;
  zipBoundariesSyncedAt?: string | null;
  zipBoundariesSyncStartedAt?: string | null;
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
    case "zip-boundaries":
      return {
        started: status.zipBoundariesSyncStartedAt ?? null,
        finished: status.zipBoundariesSyncedAt ?? null,
      };
    default:
      return { started: null, finished: null };
  }
}

function StatusCell({
  text,
  isRunning,
  isWaiting = false,
}: {
  text: string | undefined;
  isRunning: boolean;
  isWaiting?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!text) {
    return <span className="font-mono text-[9px] text-charcoal/30">—</span>;
  }

  const isLong = text.length > 72;
  const emphasize = isRunning || isWaiting;

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    void navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div>
      <p
        className={`text-[9px] leading-snug break-words ${
          emphasize
            ? "font-mono text-gold uppercase tracking-wide"
            : "text-slate/80"
        } ${isLong && !expanded ? "line-clamp-3" : ""}`}
      >
        {text}
      </p>
      <div className="flex items-center gap-2 mt-0.5">
        {isLong && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="font-mono text-[8px] text-navy/40 hover:text-navy hover:underline underline-offset-1"
          >
            {expanded ? "less" : "more"}
          </button>
        )}
        <button
          type="button"
          onClick={handleCopy}
          className="font-mono text-[8px] text-charcoal/30 hover:text-navy"
          title="Copy full status to clipboard"
        >
          {copied ? "✓ copied" : "copy"}
        </button>
      </div>
    </div>
  );
}

/** One Start/End/Next row: equal columns, label right-aligned, value left-aligned. */
function SyncTimingRow({
  label,
  value,
  valueClassName = "text-navy font-semibold",
}: {
  label: ReactNode;
  value: ReactNode;
  valueClassName?: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-x-2 items-baseline w-full min-w-0">
      <span className="text-right font-mono text-[10px] tracking-wide text-charcoal/45 uppercase whitespace-nowrap">
        {label}
      </span>
      <span
        className={`text-left font-mono text-[10px] tabular-nums whitespace-nowrap min-w-0 ${valueClassName}`}
      >
        {value}
      </span>
    </div>
  );
}

function SyncTimestamp({
  label,
  value,
  timeOnly = false,
}: {
  label: string;
  value: string | null;
  timeOnly?: boolean;
}) {
  return (
    <SyncTimingRow
      label={label}
      value={timeOnly ? formatTimeOnly(value) : formatTimestamp(value)}
    />
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
  "zip-boundaries": "zip-boundaries",
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
const FULL_RESYNC_SUBSTEP_ROWS = new Set(["listing-scores", "stats-cache", "deal-of-the-day"]);

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
  /** True when the full-resync row itself is in-progress (client or server). */
  fullResyncInProgress: boolean;
  error?: string;
  nowMs: number;
}): SyncRowVisualStatus {
  const { row, timing, status, isRunning, syncAllRunning, fullResyncInProgress, error, nowMs } = options;

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
  const hung = refreshRowHung || isTimingHung(timing, nowMs);

  if (failed || hung) return "alert";

  // "Latest MLS listing update" is a read-only diagnostic — it has no sync
  // action of its own so it should never turn green regardless of its timestamp.
  if (row.id === "latest-mls") return "idle";

  // Successful End → green row. Schedule breach is font-only in the Next
  // label (rose "Overdue") — never paints the whole row red.
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
  "px-4 py-2.5 text-left font-mono text-[10px] tracking-[0.14em] uppercase text-charcoal/40 border-r border-b border-transparent bg-cream/30 whitespace-nowrap";
const TD =
  "px-4 py-3 align-top text-left border-r border-b border-transparent last:border-r-0";

export default function AdminSyncTable({
  rows,
  initialRefreshing,
  initialDatabaseStats,
  initialStatus,
  initialPausedJobs,
}: {
  rows: AdminSyncRow[];
  initialRefreshing: boolean;
  initialDatabaseStats: AdminDatabaseSyncStats[];
  initialStatus?: PanelStatus;
  initialPausedJobs?: ScheduledSyncPausedJobs;
}) {
  const [status, setStatus] = useState<PanelStatus | null>(initialStatus ?? null);
  const [databaseStats, setDatabaseStats] = useState(initialDatabaseStats);
  const [refreshing, setRefreshing] = useState(initialRefreshing);
  const [pausedJobs, setPausedJobs] = useState<ScheduledSyncPausedJobs>(
    () => initialPausedJobs ?? emptyPausedJobs(),
  );
  const [pauseSavingJob, setPauseSavingJob] = useState<ScheduledSyncJobId | null>(
    null,
  );
  const [pendingRetries, setPendingRetries] = useState<
    Partial<Record<string, PendingSyncRetry>>
  >({});
  const pendingRetryTimersRef = useRef<Partial<Record<string, number>>>({});
  const syncAttemptCountRef = useRef<Partial<Record<string, number>>>({});
  const runSyncRef = useRef<
    (row: AdminSyncRow, opts?: { autoRetry?: boolean }) => Promise<void>
  >(async () => {});
  const [runningId, setRunningId] = useState<AdminSyncActionId | "sync-all-caches" | null>(
    null,
  );
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
      if (rawFinal)
        setFinalStatuses(JSON.parse(rawFinal) as Partial<Record<string, string>>);
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

  /** After a sync failure: schedule up to 2 automatic retries (60s apart), or finalize. */
  const handleSyncFailure = useCallback(
    (row: AdminSyncRow, baseError: string) => {
      const prior = syncAttemptCountRef.current[row.id] ?? 0;
      const attemptNumber = prior + 1;
      syncAttemptCountRef.current[row.id] = attemptNumber;
      const attemptsLeft = SYNC_MAX_ATTEMPTS - attemptNumber;

      if (attemptsLeft <= 0) {
        clearPendingRetry(row.id);
        setErrors((prev) => ({ ...prev, [row.id]: baseError }));
        return;
      }

      const retryAtMs = Date.now() + SYNC_RETRY_DELAY_MS;
      clearPendingRetry(row.id);
      setPendingRetries((prev) => ({
        ...prev,
        [row.id]: { baseError, retryAtMs, attemptsLeft },
      }));
      setErrors((prev) => ({
        ...prev,
        [row.id]: formatErrorWithRetry(baseError, retryAtMs, attemptsLeft),
      }));

      const timerId = window.setTimeout(() => {
        delete pendingRetryTimersRef.current[row.id];
        setPendingRetries((prev) => {
          if (!prev[row.id]) return prev;
          const next = { ...prev };
          delete next[row.id];
          return next;
        });
        void runSyncRef.current(row, { autoRetry: true });
      }, SYNC_RETRY_DELAY_MS);
      pendingRetryTimersRef.current[row.id] = timerId;
    },
    [clearPendingRetry],
  );

  const refreshStatus = useCallback(async () => {
    const res = await fetch("/api/admin/sync", { cache: "no-store" });
    if (!res.ok) return;
    const body = (await res.json()) as PanelStatus;
    setStatus(body);
    setRefreshing(body.refreshing);
    if (body.databaseStats) setDatabaseStats(body.databaseStats);
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
      } catch {
        setPausedJobs(prev);
      } finally {
        setPauseSavingJob(null);
      }
    },
    [pausedJobs],
  );

  useEffect(() => {
    void refreshStatus();
    const pollMs = refreshing || runningId != null ? 5_000 : 60_000;
    const id = window.setInterval(() => void refreshStatus(), pollMs);
    return () => window.clearInterval(id);
  }, [refreshStatus, refreshing, runningId]);

  const drainSyncQueueRef = useRef<() => void>(() => {});

  const finishRunningJob = useCallback(() => {
    setRunningJob(null, null);
    void refreshStatus();
    // Defer drain so runningIdRef is cleared before the next job starts.
    queueMicrotask(() => drainSyncQueueRef.current());
  }, [setRunningJob, refreshStatus]);

  const executeSync = useCallback(
    async (row: AdminSyncRow, opts?: { autoRetry?: boolean }) => {
      const actionId = row.actionId;
      if (!actionId) return;

      if (!opts?.autoRetry) {
        clearPendingRetry(row.id);
        syncAttemptCountRef.current[row.id] = 0;
      }

      const actionLabel = ADMIN_SYNC_ACTIONS[actionId]?.label ?? row.label;

      if (actionId === "full-resync") {
        beginRunLog("Full resync");
        setRunningJob("full-resync", actionLabel);
        refreshWaitingStatuses(actionLabel);
        try {
          const result = await runFullResyncChunked(row, {
            setRunningId: (id) => {
              // Keep label in sync when the chunked helper clears/sets the id.
              if (id == null) {
                runningIdRef.current = null;
                setRunningId(null);
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
          if (result.ok) {
            clearPendingRetry(row.id);
            syncAttemptCountRef.current[row.id] = 0;
          } else {
            handleSyncFailure(row, result.error ?? "Full resync failed");
          }
        } finally {
          commitRunLog();
          finishRunningJob();
        }
        return;
      }

      const startedAt = new Date().toISOString();
      const actionT0 = Date.now();
      beginRunLog(`Sync now · ${actionLabel}`);
      setRunningJob(actionId, actionLabel);
      refreshWaitingStatuses(actionLabel);
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
          appendRunLog({
            id: `${row.id}-${actionT0}`,
            label: actionLabel,
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
          handleSyncFailure(row, errText);
          return;
        }

        clearPendingRetry(row.id);
        syncAttemptCountRef.current[row.id] = 0;
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
        const finalText =
          formatSyncDescription(body.message, body.detail) ??
          body.message ??
          row.detail ??
          "";
        setDescriptions((prev) => ({ ...prev, [row.id]: finalText }));
        if (finalText) persistFinalStatus(row.id, finalText);
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
            id: `${row.id}-${actionT0}`,
            label: actionLabel,
            startedAt,
            finishedAt,
            durationMs,
            status: finalText || (body.message ?? "Complete"),
          });
        }
      } catch (err) {
        const errText = err instanceof Error ? err.message : "Sync failed";
        appendRunLog({
          id: `${row.id}-${actionT0}`,
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
        handleSyncFailure(row, errText);
      } finally {
        commitRunLog();
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
      handleSyncFailure,
      setRunningJob,
      refreshWaitingStatuses,
      finishRunningJob,
    ],
  );

  const runSync = useCallback(
    async (row: AdminSyncRow, opts?: { autoRetry?: boolean }) => {
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
        if (!opts?.autoRetry) {
          clearPendingRetry(row.id);
          syncAttemptCountRef.current[row.id] = 0;
        }
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

      await executeSync(row, opts);
    },
    [executeSync, replaceSyncQueue, clearPendingRetry],
  );

  runSyncRef.current = runSync;

  const executeSyncAll = useCallback(async () => {

    const stepsToRun = ADMIN_SYNC_ALL_CLIENT_STEPS.filter(
      (actionId) => !isSyncAllActionPaused(actionId, pausedJobs),
    );
    const skippedPaused = ADMIN_SYNC_ALL_CLIENT_STEPS.filter((actionId) =>
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
            if (syncAllFinalText) persistFinalStatus(rowId, syncAllFinalText);
            const queued = Boolean(body.backgroundQueued);
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
        if (stepBody.databaseStats) setDatabaseStats(stepBody.databaseStats);

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
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 px-5 sm:px-6 py-3 border-b border-charcoal/[0.08] bg-cream/20">
        <div className="min-w-0 space-y-1">
          <p className="text-xs text-slate leading-relaxed max-w-2xl">
            Sync all runs steps 1→5 automatically, skipping any row with Pause checked. You can
            press Sync now on as many rows as you want — if a sync is already running, the next
            ones queue in click order with status Waiting for … to finish. Use Pause to skip that
            row&apos;s Sync all step and automated / cron schedule.
          </p>
          <p className="font-mono text-[9px] text-charcoal/45 leading-snug max-w-2xl">
            The in-progress sync stays at the top; otherwise sorted by most-recent End time.
            The Order badge shows the manual step number, which may differ from the row&apos;s
            visual position. Steps 3–5 also run as part of a Full resync (step 1).
            Step 2 (Incremental) runs on its own 30-min schedule and is not triggered by a full resync.
          </p>
        </div>
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
          Database inventory
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse">
            <thead>
              <tr>
                <th className={`${TH} border-charcoal/[0.08]`}>Database</th>
                <th className={`${TH} border-charcoal/[0.08]`}>Location</th>
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
        <table className="w-full min-w-[1120px] border-collapse table-fixed">
          <colgroup>
            <col className="w-[3.25rem]" />
            <col className="w-[3rem]" />
            <col className="w-[7.5rem]" />
            <col className="w-[9.5rem]" />
            <col />
            <col className="w-[9rem]" />
            <col className="w-[7rem]" />
            <col className="w-[13rem]" />
            <col className="w-[11rem]" />
          </colgroup>
          <thead>
            <tr>
              <th
                className={`${TH} sticky left-0 z-30 bg-cream shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]`}
                title="Pause automated / cron sync for this row"
              >
                Pause
              </th>
              <th
                className={`${TH} sticky left-[3.25rem] z-30 bg-cream shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]`}
              >
                Order
              </th>
              <th className={TH}>Action</th>
              <th className={TH}>Sync</th>
              <th className={TH}>Description</th>
              <th className={TH}>Status</th>
              <th className={TH}>Pages</th>
              <th className={TH}>Start / End / Next</th>
              <th className={`${TH} border-r-0`}>Errors</th>
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
                const aRunning = rowIsRunningForSort(a);
                const bRunning = rowIsRunningForSort(b);
                if (aRunning !== bRunning) return aRunning ? -1 : 1;
                const aFinished = parseIsoMs(
                  timingWithLogFallback(a, status, runTimings, runSnapshot).finished,
                );
                const bFinished = parseIsoMs(
                  timingWithLogFallback(b, status, runTimings, runSnapshot).finished,
                );
                return (bFinished ?? -Infinity) - (aFinished ?? -Infinity);
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
                row.id === "zip-boundaries";
              const nextRunAt = nextRunForRow(row, status);
              const visual = resolveSyncRowVisualStatus({
                row,
                timing,
                nextRunAt,
                status,
                isRunning: isRunning || isWaiting,
                syncAllRunning,
                fullResyncInProgress,
                error: rowError,
                nowMs,
              });
              const scheduleBreached = isScheduleBreached(
                nextRunAt,
                timing.finished,
                nowMs,
              );
              const manualOrder = ADMIN_MANUAL_SYNC_ORDER_BY_ROW[row.id];
              const pauseJob = SCHEDULED_SYNC_JOB_BY_ROW[row.id as AdminSyncPanelRowId];
              const stripe = index % 2 === 1;
              const stickyBg = stickyCellBg(visual, stripe);

              return (
                <tr
                  key={row.id}
                  className={`transition-colors duration-500 ${syncRowClassName(visual, stripe)}`}
                >
                  <td
                    className={`${TD} sticky left-0 z-20 ${stickyBg} shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]`}
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
                  <td
                    className={`${TD} sticky left-[3.25rem] z-20 ${stickyBg} shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]`}
                  >
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
                        onClick={() => runSync(row)}
                        disabled={disabled}
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
                  <td className={TD}>
                    <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-charcoal/60 leading-snug">
                      {row.label}
                    </p>
                  </td>
                  <td className={TD}>
                    <p className="text-sm leading-snug text-slate">
                      {row.detail ?? ""}
                    </p>
                  </td>
                  <td className={TD}>
                    <StatusCell
                      text={
                        isWaiting
                          ? (descriptions[row.id] ??
                            formatWaitingStatus(
                              runningLabelRef.current ?? "current sync",
                            ))
                          : isRunning || syncAllRunning
                            ? (descriptions[row.id] ?? "Running…")
                            : (descriptions[row.id] ??
                              finalStatuses[row.id] ??
                              statusTextFromRunLog(row, runSnapshot))
                      }
                      isRunning={isRunning || syncAllRunning}
                      isWaiting={isWaiting}
                    />
                  </td>
                  <td className={TD}>
                    <SyncImpactedPages rowId={row.id} />
                  </td>
                  <td className={TD}>
                    {(() => {
                      // Date once above Start (from start, else finished). End/Updated are
                      // always time-only — midnight crossover is obvious from the clock.
                      const anchorIso = timing.started ?? timing.finished;
                      const dateLabel = anchorIso ? formatDateShort(anchorIso) : null;
                      const anchorCal = isoCalendarDate(anchorIso);
                      const nextSameDay =
                        nextRunAt != null &&
                        anchorCal != null &&
                        isoCalendarDate(nextRunAt) === anchorCal;

                      const startMs = parseIsoMs(timing.started);
                      const endMs = parseIsoMs(timing.finished);
                      const elapsedMs =
                        startMs != null && endMs != null && endMs >= startMs
                          ? endMs - startMs
                          : null;

                      const isPostDeployNext =
                        row.id === "full-resync" &&
                        status?.scheduleHints?.fullResyncSource === "post-deploy";
                      const hungNext =
                        isTimingHung(timing, nowMs) ||
                        (row.id === "refresh-finished" && status?.refreshing);
                      let nextStatusText: string | null = null;
                      let nextStatusClass = "text-sage/80";
                      if (isPostDeployNext) {
                        nextStatusText = "Post-deploy warm";
                        nextStatusClass = "text-gold";
                      } else if (hungNext) {
                        nextStatusText = "Hung";
                        nextStatusClass = "text-rose-600/80";
                      } else if (scheduleBreached) {
                        // Font only — row color stays green/idle for a completed run.
                        nextStatusText = "Overdue";
                        nextStatusClass = "text-rose-600/80";
                      } else if (visual === "ok" || nextRunAt != null) {
                        nextStatusText = "On schedule";
                        nextStatusClass = "text-sage/80";
                      }
                      const nextTimeText = isPostDeployNext
                        ? formatAdminNextSyncCountdown(nextRunAt, now)
                        : nextSameDay
                          ? formatTimeOnly(nextRunAt)
                          : formatAdminNextSyncAt(nextRunAt, now);
                      const nextTimeClass =
                        scheduleBreached || hungNext ? "text-rose-700" : "text-navy";

                      const nextLabel = (
                        <>
                          Next
                          {nextStatusText ? (
                            <span className={`normal-case tracking-wide ${nextStatusClass}`}>
                              {" "}
                              ({nextStatusText})
                            </span>
                          ) : null}
                        </>
                      );

                      return (
                        <div className="flex flex-col gap-0.5 w-full min-w-[11rem]">
                          {dateLabel ? (
                            <div className="grid grid-cols-2 gap-x-2 w-full min-w-0 mb-0.5">
                              <span aria-hidden className="block" />
                              <p className="text-left font-mono text-[9px] tracking-wide text-charcoal/40 uppercase">
                                {dateLabel}
                              </p>
                            </div>
                          ) : null}
                          {showSingleTimestamp ? (
                            <SyncTimestamp
                              label="Updated"
                              value={timing.finished}
                              timeOnly
                            />
                          ) : (
                            <>
                              <SyncTimestamp
                                label="Start"
                                value={timing.started}
                                timeOnly
                              />
                              <SyncTimestamp
                                label="End"
                                value={timing.finished}
                                timeOnly
                              />
                              <SyncTimingRow
                                label="Elapsed"
                                value={formatElapsed(elapsedMs)}
                              />
                            </>
                          )}
                          {nextRunAt != null ? (
                            <SyncTimingRow
                              label={nextLabel}
                              value={nextTimeText}
                              valueClassName={`font-semibold ${nextTimeClass}`}
                            />
                          ) : null}
                        </div>
                      );
                    })()}
                  </td>
                  <td className={`${TD} border-r-0`}>
                    {rowError ? (
                      <div className="space-y-1.5">
                        <p className="font-mono text-[9px] leading-snug text-coral break-words whitespace-pre-line">
                          {rowError}
                        </p>
                        {row.actionId && !isRunning && !isWaiting && !syncAllRunning && (
                          <button
                            type="button"
                            onClick={() => runSync(row)}
                            disabled={false}
                            className="font-mono text-[9px] tracking-[0.1em] uppercase rounded-full px-2.5 py-1 border border-coral/40 text-coral bg-rose-50 hover:bg-rose-100 disabled:opacity-40 disabled:pointer-events-none transition-colors"
                          >
                            {pendingRetry ? "↺ Retry now" : "↺ Retry"}
                          </button>
                        )}
                      </div>
                    ) : (
                      <span className="font-mono text-[9px] text-charcoal/30">—</span>
                    )}
                  </td>
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
