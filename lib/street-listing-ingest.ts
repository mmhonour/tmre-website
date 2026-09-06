import 'server-only'

import { listingRowId } from '@/lib/db/listings-repo'
import { query } from '@/lib/db/postgres'
import {
  getVisionAddress,
  type VisionAddressRecord,
} from '@/lib/db/vision-addresses-repo'
import {
  getVisionStreetParcelByPid,
  stampStreetParcelListingIngest,
} from '@/lib/db/vision-streets-repo'
import {
  ingestFindListingIfMissing,
  type FindListingIngestPhase,
} from '@/lib/find-listing-ingest'
import { listingIngestTown } from '@/lib/find-listing-ingest-shared'
import { normalizePropertyAddress } from '@/lib/property-address'
import type { Listing } from '@/lib/rets'
import type { StreetListingCard } from '@/lib/street-listing-card-shared'
import { writeStreetListingIngestProgress } from '@/lib/street-listing-ingest-progress'
import type { StreetListingIngestPhase } from '@/lib/street-listing-ingest-progress-shared'

export type StreetListingIngestResult = {
  listing: StreetListingCard | null
  ingested: boolean
  phase: StreetListingIngestPhase
  message: string
}

export function streetListingCardFromListing(
  listing: Listing,
  townFallback?: string,
): StreetListingCard | null {
  const id = listingRowId(listing) || listing.mlsId?.trim()
  if (!id) return null
  return {
    id,
    mlsId: listing.mlsId?.trim() || null,
    status: listing.status?.trim() || 'MLS',
    price: listing.price,
    street: listing.address.street || listing.address.full || '',
    town: listing.address.city?.trim() || townFallback || '',
  }
}

function emptyVisionRecord(input: {
  town: string
  visionPid: string
  streetName: string
  addressLabel: string
  lastSaleDate?: string | null
  listingId?: string | null
  mlsId?: string | null
  mblu?: string | null
  streetNo?: string | null
  addressFull?: string | null
  addressNorm?: string | null
  zip?: string | null
}): VisionAddressRecord {
  const house =
    input.streetNo?.trim() ||
    input.addressLabel.match(/^\d+[A-Za-z]?/)?.[0] ||
    null
  const streetLine =
    [house, input.streetName].filter(Boolean).join(' ').trim() ||
    input.addressLabel
  const addressFull =
    input.addressFull?.trim() || `${input.addressLabel}, ${input.town}, CT`
  return {
    town: input.town,
    visionPid: input.visionPid,
    accountNumber: null,
    mblu: input.mblu ?? null,
    useCode: null,
    useCodeDescription: null,
    addressFull,
    addressNorm:
      input.addressNorm?.trim() ||
      normalizePropertyAddress(input.town, streetLine, input.zip ?? null),
    streetNo: house,
    streetName: input.streetName,
    city: input.town,
    state: 'CT',
    zip: input.zip ?? null,
    ownerName: null,
    ownerMailingAddress: null,
    assessedValue: null,
    appraisalValue: null,
    yearBuilt: null,
    livingAreaSqft: null,
    beds: null,
    fullBaths: null,
    halfBaths: null,
    style: null,
    acres: null,
    zoning: null,
    lastSalePrice: null,
    lastSaleDate: input.lastSaleDate ?? null,
    lastSaleBookPage: null,
    buildingCount: null,
    totalRooms: null,
    model: null,
    photoUrl: null,
    parcelUrl: '',
    listingId: input.listingId ?? null,
    mlsId: input.mlsId ?? null,
    fieldCard: null,
    fieldCardR2Key: null,
  }
}

export async function visionRecordForStreetParcel(
  town: string,
  visionPid: string,
): Promise<VisionAddressRecord | null> {
  const existing = await getVisionAddress(town, visionPid)
  if (existing) return existing
  const parcel = await getVisionStreetParcelByPid(town, visionPid)
  if (!parcel) return null
  return emptyVisionRecord({
    town,
    visionPid,
    streetName: parcel.streetName,
    addressLabel: parcel.addressLabel,
  })
}

export async function loadStreetListingCards(
  town: string,
  streetName: string,
): Promise<Map<string, StreetListingCard>> {
  const rows = await query<{
    vision_pid: string
    id: string
    mls_id: string | null
    status: string | null
    price: number | string | null
    street: string | null
    listing_town: string | null
  }>(
    `SELECT p.vision_pid,
            COALESCE(lpid.id, lid.id) AS id,
            COALESCE(lpid.mls_id, lid.mls_id) AS mls_id,
            COALESCE(lpid.status_bucket, lid.status_bucket, lpid.mls_status, lid.mls_status) AS status,
            COALESCE(lpid.price, lid.price) AS price,
            COALESCE(lpid.address_street, lid.address_street) AS street,
            COALESCE(lpid.town, lid.town) AS listing_town
       FROM vision_street_parcels p
       LEFT JOIN vision_addresses v
         ON v.town = p.town AND v.vision_pid = p.vision_pid
       LEFT JOIN listings lpid
         ON lpid.vision_pid = p.vision_pid
       LEFT JOIN listings lid
         ON v.listing_id IS NOT NULL AND v.listing_id <> '' AND lid.id = v.listing_id
      WHERE p.town = $1 AND p.street_name = $2
        AND COALESCE(lpid.id, lid.id) IS NOT NULL`,
    [town, streetName],
  )
  const out = new Map<string, StreetListingCard>()
  for (const row of rows) {
    const id = row.id?.trim()
    if (!id) continue
    const priceNum =
      row.price == null || row.price === '' ? null : Number(row.price)
    out.set(row.vision_pid, {
      id,
      mlsId: row.mls_id?.trim() || null,
      status: row.status?.trim() || 'MLS',
      price: priceNum != null && Number.isFinite(priceNum) ? priceNum : null,
      street: row.street?.trim() || '',
      town: row.listing_town?.trim() || town,
    })
  }
  return out
}

function mapIngestPhase(
  phase: FindListingIngestPhase,
): StreetListingIngestPhase {
  if (phase === 'checking-db') return 'checking-db'
  if (phase === 'rets-id') return 'rets-id'
  if (phase === 'rets-address') return 'rets-address'
  if (phase === 'rets-closed') return 'rets-closed'
  if (phase === 'found') return 'found'
  if (phase === 'error') return 'error'
  return 'none'
}

export async function ingestStreetListingIfMissing(
  town: string,
  visionPid: string,
  options: { writeProgress?: boolean } = {},
): Promise<StreetListingIngestResult> {
  const writeProgress = options.writeProgress !== false
  const vision = await visionRecordForStreetParcel(town, visionPid)
  if (!vision) {
    const message = 'No Vision street parcel for that address'
    if (writeProgress) {
      await writeStreetListingIngestProgress({
        town,
        visionPid,
        addressLabel: '',
        phase: 'none',
        message,
      })
    }
    return { listing: null, ingested: false, phase: 'none', message }
  }

  const ingestTown = listingIngestTown(vision)
  const addressLabel =
    [vision.streetNo, vision.streetName].filter(Boolean).join(' ').trim() ||
    vision.addressFull?.split(',')[0]?.trim() ||
    vision.visionPid

  const report = async (
    phase: StreetListingIngestPhase,
    message: string,
    listing: StreetListingCard | null = null,
  ) => {
    if (!writeProgress) return
    await writeStreetListingIngestProgress({
      town: ingestTown,
      visionPid,
      addressLabel,
      phase,
      message,
      listing,
    })
  }

  await report('queued', 'Searching RETS…')

  const pulled = await ingestFindListingIfMissing(vision, null, async (update) => {
    await report(mapIngestPhase(update.phase), update.message)
  })

  const card = pulled.listing
    ? streetListingCardFromListing(pulled.listing, ingestTown)
    : null
  const phase: StreetListingIngestPhase = card
    ? 'found'
    : pulled.listing
      ? 'found'
      : 'none'
  const message = card
    ? card.status
    : 'No MLS listing in RETS'

  await report(card ? 'found' : 'none', message, card)
  await stampStreetParcelListingIngest(ingestTown, visionPid).catch(() => {})

  return {
    listing: card,
    ingested: pulled.ingested,
    phase,
    message,
  }
}
