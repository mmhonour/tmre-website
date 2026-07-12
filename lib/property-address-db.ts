import 'server-only'

import type { PropertyAddressRow } from '@/lib/property-address'
import { setSyncMeta } from '@/lib/db/sync-meta-store'
import {
  countPropertyAddresses,
  findPropertyAddressByNorm,
  loadMlsListingsForPropertySync,
  searchPropertyAddressesInDb,
  upsertPropertyAddress,
} from '@/lib/db/property-address-repo'

export {
  countPropertyAddresses,
  findPropertyAddressByNorm,
  loadMlsListingsForPropertySync,
  searchPropertyAddressesInDb,
  upsertPropertyAddress,
}

export function touchPropertyAddressSyncMeta(stats: {
  mlsRows: number
  assessorRows: number
  totalRows: number
  durationMs: number
}): void {
  const now = new Date().toISOString()
  setSyncMeta('property_addresses_synced_at', now)
  setSyncMeta(
    'property_addresses_last_stats',
    JSON.stringify({
      ...stats,
      syncedAt: now,
    }),
  )
}

export type { PropertyAddressRow }
