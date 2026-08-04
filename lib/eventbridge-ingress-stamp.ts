import 'server-only'

import { setSyncMetaDurable } from '@/lib/db/sync-meta-store'
import { isScheduledSyncJobId } from '@/lib/scheduled-sync-jobs-shared'

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
 * Record every ingress hit — including auth failures and Configure skips —
 * so Admin can show “EventBridge last fired” when Scheduler is EventBridge.
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
