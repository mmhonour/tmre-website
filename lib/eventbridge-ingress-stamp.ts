import 'server-only'

import {
  deleteSyncMetaDurable,
  getSyncMeta,
  setSyncMetaDurable,
} from '@/lib/db/sync-meta-store'
import { getSyncMeta as getSyncMetaFresh } from '@/lib/db/sync-meta'
import { isScheduledSyncJobId } from '@/lib/scheduled-sync-jobs-shared'

/** Match Admin Dashboard hang window — open queue past this is orphaned. */
export const EVENTBRIDGE_QUEUED_ORPHAN_MS = 45 * 60 * 1000

/** ISO timestamp of last HTTP hit to eventbridge-sync-ingress for this job. */
export function eventbridgeIngressAtKey(jobId: string): string {
  return `last_eventbridge_ingress_at_${jobId}`
}

/** Short outcome line for Admin Dashboard (queued / skipped / unauthorized / …). */
export function eventbridgeIngressResultKey(jobId: string): string {
  return `last_eventbridge_ingress_result_${jobId}`
}

export type EventBridgeIngressOutcome =
  | 'queued'
  | 'ok'
  | 'skipped'
  | 'unauthorized'
  | 'failed'
  | 'bad_request'
  | 'method_not_allowed'

export type EventBridgeIngressStamp = {
  at: string
  outcome: EventBridgeIngressOutcome
  reason?: string
  httpStatus: number
}

function metaJobKey(jobId: string | null | undefined): string {
  if (jobId && isScheduledSyncJobId(jobId)) return jobId
  if (jobId && /^[a-z0-9-]{1,64}$/i.test(jobId)) return jobId.toLowerCase()
  return 'unknown'
}

export function formatEventBridgeIngressResult(
  stamp: EventBridgeIngressStamp,
): string {
  const reason = stamp.reason?.trim()
  const core = reason
    ? `${stamp.outcome}: ${reason}`
    : stamp.outcome
  return `${core} · HTTP ${stamp.httpStatus}`
}

/**
 * Record every ingress hit — including auth failures and Configure skips — so
 * Admin can show “EventBridge last fired” whenever AWS is armed as a clock.
 */
export async function stampEventBridgeIngressHit(input: {
  jobId?: string | null
  outcome: EventBridgeIngressOutcome
  reason?: string
  httpStatus: number
  at?: string
}): Promise<EventBridgeIngressStamp> {
  const at = input.at ?? new Date().toISOString()
  const jobKey = metaJobKey(input.jobId)
  const stamp: EventBridgeIngressStamp = {
    at,
    outcome: input.outcome,
    reason: input.reason?.trim() || undefined,
    httpStatus: input.httpStatus,
  }
  const resultLine = formatEventBridgeIngressResult(stamp)
  await setSyncMetaDurable(eventbridgeIngressAtKey(jobKey), at)
  await setSyncMetaDurable(eventbridgeIngressResultKey(jobKey), resultLine)
  return stamp
}

function parseIsoMs(iso: string | null | undefined): number | null {
  if (!iso?.trim()) return null
  const ms = Date.parse(iso)
  return Number.isNaN(ms) ? null : ms
}

/**
 * When AWS stamped `queued` but the worker never wrote End past the hang
 * window, rewrite the ingress result and clear open Start/live so Dashboard
 * does not stay pink on “queued — no End yet” forever.
 */
export async function healStaleEventBridgeQueuedIncremental(
  nowMs = Date.now(),
): Promise<{ healed: boolean; result: string | null; at: string | null }> {
  const atKey = eventbridgeIngressAtKey('incremental')
  const resultKey = eventbridgeIngressResultKey('incremental')
  const at =
    (await getSyncMetaFresh(atKey)) ?? getSyncMeta(atKey)
  const result =
    (await getSyncMetaFresh(resultKey)) ?? getSyncMeta(resultKey)
  const ingressMs = parseIsoMs(at)
  const resultLine = result?.trim() ?? ''

  if (
    ingressMs == null ||
    !/^queued\b/i.test(resultLine) ||
    nowMs - ingressMs < EVENTBRIDGE_QUEUED_ORPHAN_MS
  ) {
    return { healed: false, result: resultLine || null, at: at ?? null }
  }

  const endAt =
    (await getSyncMetaFresh('last_incremental_sync')) ??
    getSyncMeta('last_incremental_sync')
  const endMs = parseIsoMs(endAt)
  // End after this ingress = worker finished — leave the queued stamp alone.
  if (endMs != null && endMs >= ingressMs) {
    return { healed: false, result: resultLine || null, at: at ?? null }
  }

  const orphanLine =
    'orphaned: queued — worker never wrote End · Sync now to recover'
  await setSyncMetaDurable(resultKey, orphanLine)

  const startAt =
    (await getSyncMetaFresh('last_incremental_sync_started')) ??
    getSyncMeta('last_incremental_sync_started')
  const startMs = parseIsoMs(startAt)
  if (startMs != null && (endMs == null || startMs > endMs)) {
    await deleteSyncMetaDurable('last_incremental_sync_started')
  }

  try {
    const { clearIncrementalSyncLive } = await import(
      '@/lib/incremental-sync-live'
    )
    await clearIncrementalSyncLive()
  } catch {
    /* live clear best-effort */
  }

  return { healed: true, result: orphanLine, at: at ?? null }
}
