import 'server-only'

import { getSyncMeta as getSyncMetaFresh } from '@/lib/db/sync-meta'
import { getSyncMeta, setSyncMetaDurable } from '@/lib/db/sync-meta-store'
import {
  emptyScheduledSyncPausedJobs,
  isScheduledSyncJobId,
  SCHEDULED_SYNC_JOB_IDS,
  type ScheduledSyncJobId,
  type ScheduledSyncPausedJobs,
} from '@/lib/scheduled-sync-jobs-shared'

export {
  emptyScheduledSyncPausedJobs,
  isScheduledSyncJobId,
  SCHEDULED_SYNC_JOB_IDS,
  type ScheduledSyncJobId,
  type ScheduledSyncPausedJobs,
} from '@/lib/scheduled-sync-jobs-shared'

// ---------------------------------------------------------------------------
// Admin kill-switch for AUTOMATED syncs (Netlify cron functions, the startup
// overdue catch-up, and the long-lived Node timers). Stored in sync_meta so it
// survives redeploys and is toggleable from /admin with no code change.
//
// Pause is per job (admin sync table PAUSE column). Manual "run step" buttons
// are intentionally NOT gated.
//
// Legacy key `scheduled_sync_paused=1` still means "all jobs paused" until the
// next per-job write expands it into the jobs map.
// ---------------------------------------------------------------------------

export const SCHEDULED_SYNC_PAUSED_KEY = 'scheduled_sync_paused'
export const SCHEDULED_SYNC_PAUSED_JOBS_KEY = 'scheduled_sync_paused_jobs'

function truthy(raw: string | null): boolean {
  return raw === '1' || raw === 'true'
}

function parsePausedJobs(raw: string | null): ScheduledSyncPausedJobs {
  const base = emptyScheduledSyncPausedJobs()
  if (!raw) return base
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    for (const id of SCHEDULED_SYNC_JOB_IDS) {
      if (typeof parsed[id] === 'boolean') base[id] = parsed[id]
    }
  } catch {
    /* ignore corrupt JSON */
  }
  return base
}

function allJobsPaused(flag: boolean): ScheduledSyncPausedJobs {
  const jobs = emptyScheduledSyncPausedJobs()
  for (const id of SCHEDULED_SYNC_JOB_IDS) jobs[id] = flag
  return jobs
}

/** Effective pause map: legacy global OR per-job flags. */
export function resolveScheduledSyncPausedJobs(
  globalRaw: string | null,
  jobsRaw: string | null,
): ScheduledSyncPausedJobs {
  if (truthy(globalRaw)) return allJobsPaused(true)
  return parsePausedJobs(jobsRaw)
}

/**
 * Synchronous read from the hydrated in-memory sync_meta cache. Correct inside
 * the Next server. Do NOT rely on this inside standalone Netlify cron functions —
 * use the Fresh variants there.
 */
export function getScheduledSyncPausedJobs(): ScheduledSyncPausedJobs {
  return resolveScheduledSyncPausedJobs(
    getSyncMeta(SCHEDULED_SYNC_PAUSED_KEY),
    getSyncMeta(SCHEDULED_SYNC_PAUSED_JOBS_KEY),
  )
}

export async function getScheduledSyncPausedJobsFresh(): Promise<ScheduledSyncPausedJobs> {
  try {
    const [globalRaw, jobsRaw] = await Promise.all([
      getSyncMetaFresh(SCHEDULED_SYNC_PAUSED_KEY),
      getSyncMetaFresh(SCHEDULED_SYNC_PAUSED_JOBS_KEY),
    ])
    return resolveScheduledSyncPausedJobs(globalRaw, jobsRaw)
  } catch {
    return getScheduledSyncPausedJobs()
  }
}

export function isScheduledSyncJobPaused(jobId: ScheduledSyncJobId): boolean {
  return getScheduledSyncPausedJobs()[jobId]
}

export async function isScheduledSyncJobPausedFresh(
  jobId: ScheduledSyncJobId,
): Promise<boolean> {
  const jobs = await getScheduledSyncPausedJobsFresh()
  return jobs[jobId]
}

/**
 * True when every known scheduled job is paused (legacy global or all checkboxes).
 * Prefer {@link isScheduledSyncJobPaused} / Fresh for entry-point gates.
 */
export function isScheduledSyncPaused(): boolean {
  const jobs = getScheduledSyncPausedJobs()
  return SCHEDULED_SYNC_JOB_IDS.every((id) => jobs[id])
}

export async function isScheduledSyncPausedFresh(): Promise<boolean> {
  const jobs = await getScheduledSyncPausedJobsFresh()
  return SCHEDULED_SYNC_JOB_IDS.every((id) => jobs[id])
}

/** Persist one job's pause flag (durable) and return the effective jobs map. */
export async function setScheduledSyncJobPaused(
  jobId: ScheduledSyncJobId,
  paused: boolean,
): Promise<ScheduledSyncPausedJobs> {
  let jobs: ScheduledSyncPausedJobs
  try {
    const [globalRaw, jobsRaw] = await Promise.all([
      getSyncMetaFresh(SCHEDULED_SYNC_PAUSED_KEY),
      getSyncMetaFresh(SCHEDULED_SYNC_PAUSED_JOBS_KEY),
    ])
    if (truthy(globalRaw)) {
      jobs = allJobsPaused(true)
      await setSyncMetaDurable(SCHEDULED_SYNC_PAUSED_KEY, '0')
    } else {
      jobs = parsePausedJobs(jobsRaw)
    }
  } catch {
    jobs = getScheduledSyncPausedJobs()
    if (isScheduledSyncPaused()) {
      jobs = allJobsPaused(true)
      await setSyncMetaDurable(SCHEDULED_SYNC_PAUSED_KEY, '0')
    }
  }

  jobs[jobId] = paused
  await setSyncMetaDurable(SCHEDULED_SYNC_PAUSED_JOBS_KEY, JSON.stringify(jobs))
  return jobs
}

/** @deprecated Prefer {@link setScheduledSyncJobPaused}. Sets/clears all jobs. */
export async function setScheduledSyncPaused(paused: boolean): Promise<boolean> {
  const jobs = allJobsPaused(paused)
  await setSyncMetaDurable(SCHEDULED_SYNC_PAUSED_KEY, '0')
  await setSyncMetaDurable(SCHEDULED_SYNC_PAUSED_JOBS_KEY, JSON.stringify(jobs))
  return paused
}
