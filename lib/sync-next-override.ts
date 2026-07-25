import 'server-only'

import {
  getSyncMeta,
  setSyncMetaDurable,
  deleteSyncMetaDurable,
} from '@/lib/db/sync-meta-store'
import { getSyncMeta as getSyncMetaFresh } from '@/lib/db/sync-meta'
import {
  isSyncNextOverrideJobId,
  syncNextOverrideStepMs,
  type SyncNextOverrideJobId,
  type SyncNextOverrides,
} from '@/lib/sync-next-override-shared'
import { SCHEDULED_SYNC_JOB_IDS } from '@/lib/scheduled-sync-jobs-shared'

export type { SyncNextOverrideJobId, SyncNextOverrides } from '@/lib/sync-next-override-shared'
export { syncNextOverrideStepMs, isSyncNextOverrideJobId } from '@/lib/sync-next-override-shared'

function metaKey(jobId: SyncNextOverrideJobId): string {
  return `sync_next_override_${jobId}`
}

function parseOverrideIso(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null
  const ms = Date.parse(raw.trim())
  if (Number.isNaN(ms)) return null
  return new Date(ms).toISOString()
}

export function getSyncNextOverride(jobId: SyncNextOverrideJobId): string | null {
  return parseOverrideIso(getSyncMeta(metaKey(jobId)))
}

export function readSyncNextOverrides(): SyncNextOverrides {
  const out: SyncNextOverrides = {}
  for (const jobId of SCHEDULED_SYNC_JOB_IDS) {
    const iso = getSyncNextOverride(jobId)
    if (iso) out[jobId] = iso
  }
  return out
}

export async function readSyncNextOverridesFresh(): Promise<SyncNextOverrides> {
  const out: SyncNextOverrides = {}
  for (const jobId of SCHEDULED_SYNC_JOB_IDS) {
    const iso = parseOverrideIso(await getSyncMetaFresh(metaKey(jobId)))
    if (iso) out[jobId] = iso
  }
  return out
}

/** True when Admin set Next in the future — automatic cron/catch-up should wait. */
export function shouldDeferScheduledJob(
  jobId: SyncNextOverrideJobId,
  now = new Date(),
): boolean {
  const override = getSyncNextOverride(jobId)
  if (!override) return false
  return Date.parse(override) > now.getTime()
}

/** True when Admin pulled Next to now/past — treat as due. */
export function isSyncNextOverrideDue(
  jobId: SyncNextOverrideJobId,
  now = new Date(),
): boolean {
  const override = getSyncNextOverride(jobId)
  if (!override) return false
  return Date.parse(override) <= now.getTime()
}

/**
 * Apply Admin Next override on top of the natural schedule.
 * Override replaces the natural next when present.
 */
export function applySyncNextOverride(
  naturalIso: string | null,
  jobId: SyncNextOverrideJobId | null | undefined,
): string | null {
  if (!jobId) return naturalIso
  const override = getSyncNextOverride(jobId)
  return override ?? naturalIso
}

export async function setSyncNextOverride(
  jobId: SyncNextOverrideJobId,
  nextAtIso: string | null,
): Promise<string | null> {
  if (!isSyncNextOverrideJobId(jobId)) {
    throw new Error(`Unknown sync job: ${jobId}`)
  }
  if (nextAtIso == null) {
    await deleteSyncMetaDurable(metaKey(jobId))
    return null
  }
  const iso = parseOverrideIso(nextAtIso)
  if (!iso) throw new Error('Invalid nextAt timestamp')
  await setSyncMetaDurable(metaKey(jobId), iso)
  return iso
}

/** Nudge Next earlier (negative steps) or later (positive steps) from a base ISO. */
export async function nudgeSyncNextOverride(input: {
  jobId: SyncNextOverrideJobId
  /** Current displayed next (natural or override) — used as baseline when no override yet. */
  baseNextAt: string | null
  steps: number
}): Promise<{ nextAt: string | null; overrides: SyncNextOverrides }> {
  const { jobId, baseNextAt, steps } = input
  if (!Number.isFinite(steps) || steps === 0) {
    return { nextAt: getSyncNextOverride(jobId), overrides: readSyncNextOverrides() }
  }

  const stepMs = syncNextOverrideStepMs(jobId)
  const baselineMs =
    Date.parse(getSyncNextOverride(jobId) ?? baseNextAt ?? '') || Date.now()
  if (Number.isNaN(baselineMs)) {
    throw new Error('No baseline next time to nudge')
  }

  const nextMs = baselineMs + steps * stepMs
  // Floor at "due now" — don't schedule in the distant past.
  const floored = Math.max(Date.now() - 30_000, nextMs)
  const nextAt = await setSyncNextOverride(jobId, new Date(floored).toISOString())
  return { nextAt, overrides: readSyncNextOverrides() }
}

/** Clear override after a successful run so natural cadence resumes. */
export async function clearSyncNextOverrideAfterRun(
  jobId: SyncNextOverrideJobId | null | undefined,
): Promise<void> {
  if (!jobId || !isSyncNextOverrideJobId(jobId)) return
  if (!getSyncMeta(metaKey(jobId))) return
  await deleteSyncMetaDurable(metaKey(jobId))
}
