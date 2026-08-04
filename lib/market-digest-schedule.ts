import 'server-only'

import { getSyncMeta as getSyncMetaFresh } from '@/lib/db/sync-meta'
import { setSyncMetaDurable } from '@/lib/db/sync-meta-store'
import { MARKET_DIGEST_SUBJECT_KEY } from '@/lib/market-digest-config'
import { subjectTemplateForWeekdayChange } from '@/lib/market-digest-shared'
import {
  normalizeStartTimeEt,
  readSyncScheduleConfigFresh,
  resolveWeekdayEt,
  writeSyncScheduleConfig,
  type SyncScheduleConfig,
  type SyncScheduleWeekdayEt,
} from '@/lib/sync-schedule-config'

/**
 * Persist market-digest day/time on the shared sync_schedule_config (Postgres).
 * When weekday changes, rewrite the subject template day name if it still
 * matches the prior default / leading “X market brief” pattern.
 */
export async function updateMarketDigestSchedule(opts: {
  weekdayEt?: SyncScheduleWeekdayEt
  startTimeEt?: string
}): Promise<SyncScheduleConfig> {
  const config = await readSyncScheduleConfigFresh()
  const job = { ...config.jobs['market-digest'] }
  const prevWeekday = resolveWeekdayEt(job)

  if (opts.weekdayEt != null) {
    job.weekdayEt = opts.weekdayEt
  }
  if (opts.startTimeEt != null) {
    const normalized = normalizeStartTimeEt(opts.startTimeEt)
    if (!normalized) throw new Error('startTimeEt must be HH:MM')
    job.startTimeEt = normalized
  }

  const nextWeekday = resolveWeekdayEt(job)
  if (nextWeekday !== prevWeekday) {
    const currentSubject = (await getSyncMetaFresh(MARKET_DIGEST_SUBJECT_KEY)) ?? ''
    const nextSubject = subjectTemplateForWeekdayChange(
      currentSubject,
      prevWeekday,
      nextWeekday,
    )
    await setSyncMetaDurable(MARKET_DIGEST_SUBJECT_KEY, nextSubject)
  }

  return writeSyncScheduleConfig({
    ...config,
    jobs: { ...config.jobs, 'market-digest': job },
  })
}
