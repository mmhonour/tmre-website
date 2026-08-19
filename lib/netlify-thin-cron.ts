import 'server-only'

import type { NetlifyFunctionQueueResult } from '@/lib/netlify-sync-trigger'
import type { ScheduledSyncJobId } from '@/lib/scheduled-sync-jobs-shared'
import {
  readSyncScheduleConfigFresh,
  shouldSkipScheduledJobWrongProviderFresh,
} from '@/lib/sync-schedule-config'
import {
  resolveJobScheduler,
  schedulerProviderLabel,
} from '@/lib/sync-schedule-config-shared'

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
 * When Configure points a job at another host, the Netlify thin cron stands
 * down. Names the host that actually owns it — the guard fires for Railway just
 * as much as EventBridge, and a wrong label here sends you hunting the wrong
 * scheduler.
 */
export async function thinCronSkipIfAnotherHostOwns(
  jobId: ScheduledSyncJobId,
): Promise<Response | null> {
  if (await shouldSkipScheduledJobWrongProviderFresh(jobId, 'netlify')) {
    const config = await readSyncScheduleConfigFresh()
    const owner = schedulerProviderLabel(
      resolveJobScheduler(config.jobs[jobId]),
    )
    return thinCronSkipped(`scheduler is ${owner} — Netlify cron ignored`)
  }
  return null
}

/** @deprecated Use thinCronSkipIfAnotherHostOwns — this name predates Railway. */
export const thinCronSkipIfEventBridgeOwns = thinCronSkipIfAnotherHostOwns

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
