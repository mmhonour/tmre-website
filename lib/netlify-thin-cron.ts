import 'server-only'

import type { NetlifyFunctionQueueResult } from '@/lib/netlify-sync-trigger'
import type { ScheduledSyncJobId } from '@/lib/scheduled-sync-jobs-shared'
import { readSyncScheduleConfigFresh } from '@/lib/sync-schedule-config'
import { resolveJobBudgetMinutes } from '@/lib/sync-schedule-config-shared'
import {
  SYNC_QUEUE_PRIORITY_SWEEP,
  isSyncQueueRunnerJob,
} from '@/lib/sync-queue-shared'

/** Shared JSON response for thin scheduled → background worker handoff. */
export function thinCronResponse(
  queued: NetlifyFunctionQueueResult,
  extra: Record<string, unknown> = {},
): Response {
  return new Response(
    JSON.stringify({
      ok: queued.ok,
      mode: 'scheduled-queue',
      workerQueued: queued,
      ...extra,
    }),
    {
      status: queued.ok ? 200 : 502,
      headers: { 'content-type': 'application/json' },
    },
  )
}

export function thinCronSkipped(reason: string): Response {
  return new Response(
    JSON.stringify({
      ok: true,
      mode: 'scheduled-queue',
      skipped: true,
      reason,
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  )
}

/**
 * How long a queued row may sit unclaimed, with a silent runner, before this
 * cron stops waiting and does the work itself.
 *
 * This is what used to be the Configure Scheduler radio. Nobody has to notice
 * Railway is down and flip a job back to Netlify: the stranded row says so.
 */
export const THIN_CRON_RESCUE_GRACE_MS = 15 * 60 * 1000

/**
 * Hand a due job to the sync queue and stand down — unless the queue is
 * stranded, in which case return null and let the caller run it here.
 *
 * Jobs the runner does not claim (`SYNC_QUEUE_RUNNER_JOBS`) never touch the
 * queue: their Netlify function still owns them end to end, so this returns
 * null immediately.
 */
export async function thinCronHandOffToQueue(
  jobId: ScheduledSyncJobId,
): Promise<Response | null> {
  if (!isSyncQueueRunnerJob(jobId)) return null

  try {
    const {
      enqueueSyncJob,
      readStrandedSyncQueueItem,
      readSyncQueueSnapshot,
      clearSyncQueueForJob,
    } = await import('@/lib/sync-queue')

    const enqueued = await enqueueSyncJob({
      jobId,
      trigger: 'netlify-cron',
      priority: SYNC_QUEUE_PRIORITY_SWEEP,
    })

    const stranded = await readStrandedSyncQueueItem(
      jobId,
      THIN_CRON_RESCUE_GRACE_MS,
    )
    if (stranded) {
      const snapshot = await readSyncQueueSnapshot(1)
      if (snapshot.runnerStale) {
        // Take the row off the queue before running here, so the runner cannot
        // wake up mid-pull and start a second copy of the same job.
        await clearSyncQueueForJob(jobId)
        console.warn(
          `[thin-cron] ${jobId} stranded since ${stranded.requestedAt} and the sync runner is silent — running on Netlify instead`,
        )
        return null
      }
    }

    const waitingNote = enqueued.enqueued
      ? 'queued for the sync runner'
      : enqueued.alreadyRunning
        ? 'already running on the sync runner'
        : enqueued.coolingDown
          ? (enqueued.reason ?? 'cooling down after a killed run')
          : 'already queued for the sync runner'
    return thinCronSkipped(`${waitingNote} — Netlify cron stood down`)
  } catch (err) {
    // A queue that cannot be read must not stop the job from running at all.
    console.warn(
      `[thin-cron] queue handoff for ${jobId} failed — running on Netlify`,
      err,
    )
    return null
  }
}

/** Budget in minutes for the rescue path, so logs name the same number Admin shows. */
export async function thinCronJobBudgetMinutes(
  jobId: ScheduledSyncJobId,
): Promise<number> {
  const config = await readSyncScheduleConfigFresh()
  return resolveJobBudgetMinutes(jobId, config.jobs[jobId])
}

export function thinCronError(label: string, err: unknown): Response {
  console.error(`[${label}]`, err)
  return new Response(
    JSON.stringify({
      ok: false,
      mode: 'scheduled-queue',
      error: err instanceof Error ? err.message : String(err),
    }),
    { status: 500, headers: { 'content-type': 'application/json' } },
  )
}
