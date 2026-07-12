import 'server-only'

import { getSyncMeta, setSyncMeta } from '@/lib/db/sync-meta-store'

export * from '@/lib/spotlight-privacy-shared'

export const SPOTLIGHT_PRIVACY_SYNC_KEY = 'spotlight_privacy_overrides'

export function readSpotlightPrivacyOverrides(): import('@/lib/spotlight-privacy-shared').SpotlightPrivacyOverrides {
  const raw = getSyncMeta(SPOTLIGHT_PRIVACY_SYNC_KEY)
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as import('@/lib/spotlight-privacy-shared').SpotlightPrivacyOverrides
    if (!parsed || typeof parsed !== 'object') return {}
    return parsed
  } catch {
    return {}
  }
}

export function writeSpotlightPrivacyOverrides(
  overrides: import('@/lib/spotlight-privacy-shared').SpotlightPrivacyOverrides,
): void {
  setSyncMeta(SPOTLIGHT_PRIVACY_SYNC_KEY, JSON.stringify(overrides))
  void import('@/lib/listings-db-persist').then(({ scheduleListingsDbBlobPersist }) =>
    scheduleListingsDbBlobPersist('spotlight-privacy-overrides'),
  )
}
