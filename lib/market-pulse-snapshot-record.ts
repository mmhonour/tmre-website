import 'server-only'

import { upsertMarketPulseSnapshot } from '@/lib/db/market-pulse-snapshots-repo'
import {
  getMarketDigestConfigFresh,
  marketDigestWeekKey,
} from '@/lib/market-digest-config'
import type { MarketDigestSnapshot } from '@/lib/market-digest-types'
import type { MarketPulseSnapshotSource } from '@/lib/db/market-pulse-snapshots-repo'

/**
 * Archive the pulse snapshot for this week's Eastern send-day.
 * Does not send mail. A same-week retry overwrites the row.
 */
export async function recordMarketPulseSnapshot(input: {
  snapshot: MarketDigestSnapshot
  source: MarketPulseSnapshotSource
  sentAt?: string | null
  now?: Date
}): Promise<{ slotDate: string }> {
  const config = await getMarketDigestConfigFresh()
  const slotDate = marketDigestWeekKey(input.now ?? new Date(), config.weekdayEt)
  await upsertMarketPulseSnapshot({
    slotDate,
    generatedAt: input.snapshot.generatedAt,
    sentAt: input.sentAt ?? null,
    source: input.source,
    payload: input.snapshot,
  })
  try {
    const { upsertMarketPulseWeekCache } = await import(
      '@/lib/market-pulse-week-cache'
    )
    const { defaultMarketPulseCombinedRows } = await import(
      '@/lib/market-pulse-combined-rows'
    )
    await upsertMarketPulseWeekCache({
      slotDate,
      generatedAt: input.snapshot.generatedAt,
      rows: defaultMarketPulseCombinedRows(input.snapshot),
    })
  } catch (err) {
    console.warn('[market-pulse-snapshot] could not write stats_cache week', err)
  }
  return { slotDate }
}
