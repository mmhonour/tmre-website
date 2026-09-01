/**
 * One sync job, one process.
 *
 * Forked by services/mls-sync/job-runner.ts for every claimed `sync_queue` row.
 * Everything the job touches — RETS pages, a town's inventory, the stats
 * payloads — lives and dies in this heap, so the worst a runaway job can do is
 * kill itself. The parent stays up, records the outcome, and takes the next row.
 *
 * That is the whole point of the fork: an OOM used to take the always-on service
 * down with it, which lost the in-memory queue, re-ran the same fatal job on
 * boot, and left Admin showing a Start with no End.
 *
 * Contract with the parent (IPC, JSON):
 *   child → parent  { type: 'ready' }
 *                   { type: 'heartbeat' }
 *                   { type: 'result', ok, message, detail?, recordsFetched? }
 *   parent → child  { type: 'shutdown' }   (asked to stop; SIGTERM follows)
 *
 * Exit codes: 0 = job reported ok, 1 = job reported failure, 2 = crashed before
 * reporting. Anything else (or a signal) is the parent's `crashed` outcome.
 */

import { existsSync } from 'node:fs'

if (existsSync('.env.local')) {
  process.loadEnvFile('.env.local')
}

/** Same flag the service sets: skip the site-cache warm that OOMed this box. */
process.env.MLS_SYNC_SERVICE = '1'

import type { AdminSyncActionId } from '../../lib/admin-sync-types'

export type SyncJobChildSpec = {
  queueId: number
  jobId: AdminSyncActionId
  trigger: string
  /** Incremental only — scope the pull to these TMRE towns. */
  towns?: string[]
  /** Incremental only. */
  statusScope?: 'all' | 'active' | 'closed'
  /**
   * Market brief only: send even though the slot says not to. A sweep must not
   * (the slot check is what stops a second Monday email); an operator pressing
   * Sync now must.
   */
  force?: boolean
  /**
   * Market brief only: advance the last-sent stamp on success, marking the slot
   * served. False for the Communications test send, which must not cancel the
   * real Monday brief.
   */
  stampWeek?: boolean
}

export type SyncJobChildMessage =
  | { type: 'ready' }
  | { type: 'heartbeat' }
  | {
      type: 'result'
      ok: boolean
      message: string
      detail?: string
      recordsFetched?: number
    }

const HEARTBEAT_MS = 20_000

function send(message: SyncJobChildMessage): void {
  process.send?.(message)
}

function parseSpec(): SyncJobChildSpec {
  const raw = process.env.SYNC_JOB_SPEC
  if (!raw) throw new Error('SYNC_JOB_SPEC is not set on the child process')
  return JSON.parse(raw) as SyncJobChildSpec
}

async function main(): Promise<number> {
  const spec = parseSpec()
  send({ type: 'ready' })

  const heartbeat = setInterval(() => send({ type: 'heartbeat' }), HEARTBEAT_MS)
  heartbeat.unref()

  // A shutdown request is the parent being polite before SIGTERM. Nothing here
  // can safely abandon a half-written upsert, so log it and let the signal land.
  process.on('message', (message: unknown) => {
    if (
      message &&
      typeof message === 'object' &&
      (message as { type?: unknown }).type === 'shutdown'
    ) {
      console.warn(
        `[sync-job ${spec.jobId}] parent asked to stop — finishing the current step`,
      )
    }
  })

  const { hydrateSyncMetaStore } = await import('../../lib/db/sync-meta-store')
  const { runAdminSyncAction } = await import('../../lib/admin-sync-actions')

  await hydrateSyncMetaStore()

  console.info(
    `[sync-job ${spec.jobId}] starting in child pid ${process.pid} (queue #${spec.queueId}, ${spec.trigger})`,
  )

  const result = await runAdminSyncAction(spec.jobId, {
    // Already inside the isolated process the queue handed this job to; never
    // bounce it onward to a Netlify background function from here.
    executeInProcess: true,
    ...(spec.towns?.length ? { towns: spec.towns } : {}),
    ...(spec.statusScope && spec.statusScope !== 'all'
      ? { statusScope: spec.statusScope }
      : {}),
    ...(typeof spec.force === 'boolean' ? { force: spec.force } : {}),
    ...(typeof spec.stampWeek === 'boolean'
      ? { stampWeek: spec.stampWeek }
      : {}),
  })

  clearInterval(heartbeat)
  send({
    type: 'result',
    ok: result.ok,
    message: result.message,
    ...(result.detail ? { detail: result.detail } : {}),
    ...(typeof result.recordsFetched === 'number'
      ? { recordsFetched: result.recordsFetched }
      : {}),
  })
  console.info(
    `[sync-job ${spec.jobId}] finished ok=${result.ok} in ${result.durationMs}ms — ${result.message}`,
  )
  return result.ok ? 0 : 1
}

main()
  .then(async (code) => {
    // The pg pool holds the event loop open; close it so a healthy child exits
    // on its own rather than looking hung until the deadline kills it.
    try {
      const { closePool } = await import('../../lib/db/postgres')
      await closePool()
    } catch {
      /* exiting anyway */
    }
    process.exit(code)
  })
  .catch((err) => {
    console.error('[sync-job] child failed', err)
    send({
      type: 'result',
      ok: false,
      message: 'Sync job crashed',
      detail: err instanceof Error ? err.message : String(err),
    })
    process.exit(2)
  })
