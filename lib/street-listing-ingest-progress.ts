import 'server-only'

import { getSyncMeta } from '@/lib/db/sync-meta'
import { setSyncMetaDurable } from '@/lib/db/sync-meta-store'
import type { StreetListingCard } from '@/lib/street-listing-card-shared'
import {
  parseStreetListingIngestProgress,
  streetListingIngestMetaKey,
  type StreetListingIngestPhase,
  type StreetListingIngestProgress,
} from '@/lib/street-listing-ingest-progress-shared'

export async function readStreetListingIngestProgress(
  town: string,
  visionPid: string,
): Promise<StreetListingIngestProgress | null> {
  const raw = await getSyncMeta(streetListingIngestMetaKey(town, visionPid))
  return parseStreetListingIngestProgress(raw)
}

export async function writeStreetListingIngestProgress(input: {
  town: string
  visionPid: string
  addressLabel: string
  phase: StreetListingIngestPhase
  message: string
  listing?: StreetListingCard | null
}): Promise<StreetListingIngestProgress> {
  const payload: StreetListingIngestProgress = {
    town: input.town,
    visionPid: input.visionPid,
    addressLabel: input.addressLabel,
    phase: input.phase,
    message: input.message,
    listing: input.listing ?? null,
    updatedAt: new Date().toISOString(),
  }
  await setSyncMetaDurable(
    streetListingIngestMetaKey(input.town, input.visionPid),
    JSON.stringify(payload),
  )
  return payload
}
