import 'server-only'

import {
  getVisionAddress,
  listVisionAddressesByNorm,
  searchVisionAddresses,
  type VisionAddressRecord,
} from '@/lib/db/vision-addresses-repo'
import { readListingByIdFromDb } from '@/lib/db/listings-repo'
import { queryOne } from '@/lib/db/postgres'
import { buildListingPhotoProxyUrls } from '@/lib/listing-photos-cache'
import { listingDetailHref } from '@/lib/listing-url'
import type { Listing } from '@/lib/rets'

export const WESTPORT_LOOKUP_TOWN = 'Westport'

export type WestportLookupHit = {
  visionPid: string
  addressFull: string
  street: string
  mblu: string | null
  ownerName: string | null
  listingId: string | null
  mlsId: string | null
  status: string | null
  price: number | null
  siblingCount: number
}

export type MergedField<T> = {
  value: T | null
  source: 'listing' | 'vision' | null
}

export type WestportMergedProperty = {
  town: string
  visionPid: string
  addressFull: string
  street: string
  mblu: string | null
  parcelUrl: string | null
  siblings: WestportLookupHit[]
  listing: {
    mlsId: string
    listingKey: string
    href: string
    status: string
    photoCount: number | null
  } | null
  photos: string[]
  price: MergedField<number>
  status: MergedField<string>
  dom: MergedField<number>
  remarks: MergedField<string>
  beds: MergedField<number>
  baths: MergedField<number>
  sqft: MergedField<number>
  yearBuilt: MergedField<number>
  acres: MergedField<number>
  zoning: MergedField<string>
  ownerName: MergedField<string>
  assessedValue: MergedField<number>
  lastSalePrice: MergedField<number>
  lastSaleDate: MergedField<string>
  style: MergedField<string>
}

function listingWins<T>(
  listingVal: T | null | undefined,
  visionVal: T | null | undefined,
): MergedField<T> {
  if (listingVal != null) {
    return { value: listingVal, source: 'listing' }
  }
  if (visionVal != null) {
    return { value: visionVal, source: 'vision' }
  }
  return { value: null, source: null }
}

function visionFill<T>(
  listingVal: T | null | undefined,
  visionVal: T | null | undefined,
): MergedField<T> {
  return listingWins(listingVal, visionVal)
}

function streetLine(v: VisionAddressRecord): string {
  const fromParts = [v.streetNo, v.streetName].filter(Boolean).join(' ').trim()
  return fromParts || v.addressFull?.split(',')[0]?.trim() || 'Westport parcel'
}

function bathsFromVision(v: VisionAddressRecord): number | null {
  const full = v.fullBaths
  const half = v.halfBaths
  if (full == null && half == null) return null
  return (full ?? 0) + (half ?? 0) * 0.5
}

function hitFromVision(
  v: VisionAddressRecord,
  listing: { status: string | null; price: number | null } | null,
  siblingCount: number,
): WestportLookupHit {
  return {
    visionPid: v.visionPid,
    addressFull: v.addressFull || `${streetLine(v)}, Westport`,
    street: streetLine(v),
    mblu: v.mblu,
    ownerName: v.ownerName,
    listingId: v.listingId,
    mlsId: v.mlsId,
    status: listing?.status ?? (v.listingId || v.mlsId ? 'Listed' : null),
    price: listing?.price ?? null,
    siblingCount,
  }
}

async function listingForVision(
  v: VisionAddressRecord,
): Promise<Listing | null> {
  if (v.listingId) {
    const byId = await readListingByIdFromDb(v.listingId)
    if (byId) return byId
  }
  if (v.mlsId) {
    const byMls = await readListingByIdFromDb(v.mlsId)
    if (byMls) return byMls
  }
  const row = await queryOne<{ id: string }>(
    `SELECT id FROM listings
      WHERE vision_pid = $1 AND lower(town) = lower($2)
      LIMIT 1`,
    [v.visionPid, v.town],
  )
  if (!row?.id) return null
  return readListingByIdFromDb(row.id)
}

export async function searchWestportLookup(
  q: string,
  limit = 12,
): Promise<WestportLookupHit[]> {
  const visionHits = await searchVisionAddresses({
    town: WESTPORT_LOOKUP_TOWN,
    q,
    limit,
  })
  const siblingCounts = new Map<string, number>()
  for (const v of visionHits) {
    const key = v.addressNorm || v.visionPid
    siblingCounts.set(key, (siblingCounts.get(key) ?? 0) + 1)
  }

  const listings = await Promise.all(visionHits.map((v) => listingForVision(v)))
  const out: WestportLookupHit[] = []
  visionHits.forEach((v, i) => {
    const listing = listings[i]
    const key = v.addressNorm || v.visionPid
    out.push(
      hitFromVision(
        v,
        listing
          ? { status: listing.status, price: listing.price }
          : null,
        siblingCounts.get(key) ?? 1,
      ),
    )
  })

  const looksLikeMls = /^[A-Za-z0-9-]{5,}$/.test(q.trim()) && !/\s/.test(q.trim())
  if (looksLikeMls && out.length < limit) {
    const listing = await readListingByIdFromDb(q.trim())
    const town = listing?.address.city?.trim().toLowerCase()
    if (listing && town === 'westport') {
      const already = out.some(
        (h) => h.mlsId === listing.mlsId || h.listingId === listing.listingKey,
      )
      if (!already) {
        out.unshift({
          visionPid: '',
          addressFull: listing.address.full || listing.address.street,
          street: listing.address.street || listing.address.full,
          mblu: null,
          ownerName: listing.ownerName,
          listingId: listing.listingKey,
          mlsId: listing.mlsId,
          status: listing.status,
          price: listing.price,
          siblingCount: 1,
        })
      }
    }
  }

  return out.slice(0, limit)
}

export async function mergeWestportProperty(
  visionPid: string,
): Promise<WestportMergedProperty | null> {
  const vision = await getVisionAddress(WESTPORT_LOOKUP_TOWN, visionPid)
  if (!vision) return null

  const listing = await listingForVision(vision)
  const siblings = vision.addressNorm
    ? (await listVisionAddressesByNorm(WESTPORT_LOOKUP_TOWN, vision.addressNorm))
        .filter((s) => s.visionPid !== vision.visionPid)
        .map((s) => hitFromVision(s, null, 0))
    : []

  const mlsId = listing?.mlsId ?? vision.mlsId
  const photos =
    listing && mlsId
      ? buildListingPhotoProxyUrls(mlsId, Math.min(listing.photoCount ?? 0, 8))
      : vision.photoUrl
        ? [vision.photoUrl]
        : []

  const listingHref = listing
    ? listingDetailHref(
        listing.mlsId,
        listing.address.street || listing.address.full,
        listing.address.city,
      )
    : null

  return {
    town: WESTPORT_LOOKUP_TOWN,
    visionPid: vision.visionPid,
    addressFull:
      listing?.address.full ||
      vision.addressFull ||
      `${streetLine(vision)}, Westport, CT`,
    street: listing?.address.street || streetLine(vision),
    mblu: vision.mblu,
    parcelUrl: vision.parcelUrl,
    siblings,
    listing: listing
      ? {
          mlsId: listing.mlsId,
          listingKey: listing.listingKey,
          href: listingHref!,
          status: listing.status,
          photoCount: listing.photoCount,
        }
      : null,
    photos,
    price: listingWins(listing?.price, null),
    status: listingWins(listing?.status, 'Off market'),
    dom: listingWins(listing?.dom, null),
    remarks: listingWins(listing?.remarks, null),
    beds: visionFill(listing?.beds, vision.beds),
    baths: visionFill(listing?.baths, bathsFromVision(vision)),
    sqft: visionFill(listing?.sqft, vision.livingAreaSqft),
    yearBuilt: visionFill(listing?.yearBuilt, vision.yearBuilt),
    acres: visionFill(listing?.lotAcres, vision.acres),
    zoning: visionFill(null, vision.zoning),
    ownerName: visionFill(listing?.ownerName, vision.ownerName),
    assessedValue: visionFill(listing?.assessedValue, vision.assessedValue),
    lastSalePrice: visionFill(null, vision.lastSalePrice),
    lastSaleDate: visionFill(null, vision.lastSaleDate),
    style: visionFill(listing?.style, vision.style),
  }
}
