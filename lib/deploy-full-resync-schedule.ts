import 'server-only'

import { deleteSyncMeta, getSyncMeta, setSyncMeta } from '@/lib/db/sync-meta-store'
import { scheduleListingsDbBlobPersist } from '@/lib/listings-db-persist'
import { hasLocalListingsCache } from '@/lib/listings-store'
import { isServerlessRuntime } from '@/lib/runtime-host'
import { nextDailyTimeEt, parseIsoMs } from '@/lib/admin-sync-schedule'

const SCHEDULED_AT_KEY = 'deploy_full_resync_scheduled_at'
const DEPLOY_ID_KEY = 'deploy_full_resync_deploy_id'
const TRIGGERED_AT_KEY = 'deploy_full_resync_triggered_at'
const COMPLETED_DEPLOY_ID_KEY = 'deploy_full_resync_completed_deploy_id'

export type PostDeployFullResyncStatus = {
  deployId: string | null
  scheduledAt: string | null
  triggeredAt: string | null
  completedDeployId: string | null
  /** Full resync still expected for the current deploy. */
  pending: boolean
  /** Why the next full resync is scheduled. */
  source: 'post-deploy' | 'daily' | null
  /** Earliest ISO timestamp for the next full resync row. */
  nextAt: string | null
}

function postDeployDelayMs(): number {
  return Math.max(
    30_000,
    Number(
      process.env.POST_DEPLOY_FULL_SYNC_DELAY_MS ??
        process.env.OVERDUE_SYNC_CATCHUP_DELAY_MS ??
        '120000',
    ),
  )
}

export function readNetlifyDeployId(): string | null {
  const id =
    process.env.DEPLOY_ID?.trim() ||
    process.env.NETLIFY_DEPLOY_ID?.trim() ||
    process.env.BUILD_ID?.trim() ||
    null
  return id || null
}

function shouldTrackPostDeployWarm(): boolean {
  return isServerlessRuntime() && process.env.NETLIFY === 'true'
}

/** Read-only view for admin schedule + countdown. */
export function readPostDeployFullResyncStatus(now = new Date()): PostDeployFullResyncStatus {
  const deployId = readNetlifyDeployId()
  const scheduledAt = getSyncMeta(SCHEDULED_AT_KEY)
  const scheduledDeployId = getSyncMeta(DEPLOY_ID_KEY)
  const triggeredAt = getSyncMeta(TRIGGERED_AT_KEY)
  const completedDeployId = getSyncMeta(COMPLETED_DEPLOY_ID_KEY)

  const pending =
    shouldTrackPostDeployWarm() &&
    deployId != null &&
    completedDeployId !== deployId &&
    !hasLocalListingsCache()

  const postDeployAt =
    pending && scheduledAt && scheduledDeployId === deployId ? scheduledAt : null
  const dailyAt = nextDailyTimeEt(5, 0, now).toISOString()

  let nextAt: string | null = dailyAt
  let source: PostDeployFullResyncStatus['source'] = 'daily'

  if (postDeployAt) {
    const postMs = parseIsoMs(postDeployAt)
    const dailyMs = parseIsoMs(dailyAt)
    if (postMs != null && (dailyMs == null || postMs <= dailyMs)) {
      nextAt = postDeployAt
      source = 'post-deploy'
    }
  } else if (!hasLocalListingsCache() && shouldTrackPostDeployWarm()) {
    source = 'post-deploy'
    nextAt = new Date(now.getTime() + postDeployDelayMs()).toISOString()
  }

  return {
    deployId,
    scheduledAt,
    triggeredAt,
    completedDeployId,
    pending,
    source,
    nextAt,
  }
}

/** Schedule and optionally trigger post-deploy full warm (idempotent per deploy). */
export async function ensurePostDeployFullResyncScheduled(now = new Date()): Promise<void> {
  if (!shouldTrackPostDeployWarm()) return

  const deployId = readNetlifyDeployId()
  if (!deployId) return

  const completedDeployId = getSyncMeta(COMPLETED_DEPLOY_ID_KEY)
  if (completedDeployId === deployId) return

  if (hasLocalListingsCache()) {
    setSyncMeta(COMPLETED_DEPLOY_ID_KEY, deployId)
    scheduleListingsDbBlobPersist('post-deploy-already-warm')
    return
  }

  const scheduledDeployId = getSyncMeta(DEPLOY_ID_KEY)
  let scheduledAt = getSyncMeta(SCHEDULED_AT_KEY)

  if (scheduledDeployId !== deployId || !scheduledAt) {
    scheduledAt = new Date(now.getTime() + postDeployDelayMs()).toISOString()
    setSyncMeta(DEPLOY_ID_KEY, deployId)
    setSyncMeta(SCHEDULED_AT_KEY, scheduledAt)
    deleteSyncMeta(TRIGGERED_AT_KEY)
    scheduleListingsDbBlobPersist('post-deploy-schedule')
    console.info(
      `[deploy-full-resync] scheduled post-deploy warm at ${scheduledAt} for deploy ${deployId.slice(0, 8)}…`,
    )
  }

  const dueMs = parseIsoMs(scheduledAt)
  if (dueMs == null || now.getTime() < dueMs) return
  if (getSyncMeta(TRIGGERED_AT_KEY)) return
  if (getSyncMeta('refresh_in_progress') === '1') return

  const { queueNetlifyFullSync } = await import('@/lib/netlify-sync-trigger')
  const queued = await queueNetlifyFullSync()
  setSyncMeta(TRIGGERED_AT_KEY, now.toISOString())
  scheduleListingsDbBlobPersist('post-deploy-trigger')
  console.info(
    queued
      ? `[deploy-full-resync] queued background full warm for deploy ${deployId.slice(0, 8)}…`
      : `[deploy-full-resync] background full warm queue failed — use admin step 1`,
  )
}

/** Call after a successful full resync completes. */
export function markPostDeployFullResyncComplete(): void {
  const deployId = readNetlifyDeployId()
  if (!deployId) return
  setSyncMeta(COMPLETED_DEPLOY_ID_KEY, deployId)
  scheduleListingsDbBlobPersist('post-deploy-complete')
}

export function postDeployDelayLabel(): string {
  const sec = Math.round(postDeployDelayMs() / 1000)
  if (sec < 60) return `${sec}s`
  const min = Math.round(sec / 60)
  return `${min} min`
}
