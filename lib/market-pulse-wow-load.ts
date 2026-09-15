import 'server-only'

import {
  readPriorMarketPulseSnapshot,
  type MarketPulseSnapshotRow,
} from '@/lib/db/market-pulse-snapshots-repo'
import {
  getMarketDigestConfigFresh,
  marketDigestWeekKey,
} from '@/lib/market-digest-config'
import type { MarketDigestSnapshot } from '@/lib/market-digest-types'
import { defaultMarketPulseCombinedRows } from '@/lib/market-pulse-combined-rows'
import {
  buildMarketPulseWow,
  type MarketPulseWowCompare,
} from '@/lib/market-pulse-wow'

export async function loadPriorMarketPulseSnapshot(
  now: Date = new Date(),
): Promise<MarketPulseSnapshotRow | null> {
  const config = await getMarketDigestConfigFresh()
  const slotDate = marketDigestWeekKey(now, config.weekdayEt)
  return readPriorMarketPulseSnapshot(slotDate)
}

/**
 * Live / send snapshot vs the previous Eastern send-day on
 * market_pulse_snapshots. Null until two Mondays are archived (or the prior
 * payload has no overlapping towns). Does not rebuild stats_cache.
 */
export async function loadMarketPulseWow(
  current: MarketDigestSnapshot,
  now: Date = new Date(),
): Promise<MarketPulseWowCompare | null> {
  const prior = await loadPriorMarketPulseSnapshot(now)
  if (!prior) return null
  return buildMarketPulseWow(
    defaultMarketPulseCombinedRows(current),
    defaultMarketPulseCombinedRows(prior.payload),
    prior.slotDate,
  )
}

