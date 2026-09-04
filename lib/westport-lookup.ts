import 'server-only'

import {
  getVisionAddress,
  listVisionAddressesByNorm,
  persistVisionFieldCardJson,
  searchVisionAddresses,
  type VisionAddressRecord,
} from '@/lib/db/vision-addresses-repo'
import { readListingByIdFromDb } from '@/lib/db/listings-repo'
import { query, queryOne } from '@/lib/db/postgres'
import { buildListingPhotoProxyUrls } from '@/lib/listing-photos-cache'
import { listingDetailHref } from '@/lib/listing-url'
import {
  normalizePropertyAddress,
  normalizeStreetLine,
  streetSearchVariants,
} from '@/lib/property-address'
import { visionListingKeys } from '@/lib/vision-listing-match'
import {
  fetchVisionFieldCardPdfJson,
  fieldCardNeedsRefresh,
  mergeFieldCardJson,
} from '@/lib/vision-field-card-pdf'
import { getVisionFieldCardHtml } from '@/lib/r2-vision-store'
import type { Listing } from '@/lib/rets'
import {
  fieldCardFromTypedVision,
  lastSaleAsOwnership,
  ownerDisplayNameFromFields,
  ownerMailingAddressFromFields,
  ownershipFromFieldCardFields,
  parseVisionFieldCardJson,
  countVisionQuitclaims,
  visionDeedDisplayRows,
  visionLastPaidSale,
  visionPurchaseDate,
  visionPurchaseYear,
  type VisionDeedDisplayRow,
  type VisionFieldCardField,
  type VisionOwnershipRow,
} from '@/lib/vision-gis-parse'

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

export type WestportFieldCard = {
  fields: VisionFieldCardField[]
  ownership: VisionOwnershipRow[]
  /** True when `vision_addresses.field_card` jsonb already had parsed fields. */
  storedJson: boolean
  photoUrl: string | null
  parcelUrl: string
  r2Key: string | null
}

export type WestportMergedProperty = {
  town: string
  visionPid: string
  addressFull: string
  street: string
  mblu: string | null
  parcelUrl: string | null
  fieldCard: WestportFieldCard
  siblings: WestportLookupHit[]
  /** True when this request pulled the row from RETS into listings. */
  listingIngested: boolean
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
  /** Current owner (+ co-owner when the Field Card lists one). */
  ownerDisplayName: string | null
  /** VGSI mailing address (often the same as the parcel, sometimes a PO box / out of town). */
  ownerMailingAddress: string | null
  /** Date of the last paid purchase (not a $0 quitclaim). */
  purchaseDate: string | null
  lastSoldPrice: number | null
  /** Year from {@link purchaseDate}. */
  purchaseYear: number | null
  quitclaimCount: number
  deedHistory: VisionDeedDisplayRow[]
  assessedValue: MergedField<number>
  appraisalValue: MergedField<number>
  lastSalePrice: MergedField<number>
  lastSaleDate: MergedField<string>
  lastSaleBookPage: MergedField<string>
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

function resolveOwnership(
  json: ReturnType<typeof fieldCardFromTypedVision>,
  vision: VisionAddressRecord,
): VisionOwnershipRow[] {
  if (json.ownership && json.ownership.length > 0) return json.ownership
  const fromFields = ownershipFromFieldCardFields(json.fields)
  if (fromFields.length > 0) return fromFields
  return lastSaleAsOwnership(vision)
}

async function resolveWestportFieldCard(
  vision: VisionAddressRecord,
): Promise<WestportFieldCard> {
  let json = vision.fieldCard
  const storedMailing =
    ownerMailingAddressFromFields(json?.fields ?? []) ?? vision.ownerMailingAddress
  if (
    !json ||
    json.fields.length === 0 ||
    fieldCardNeedsRefresh(json) ||
    !storedMailing
  ) {
    try {
      const typed = fieldCardFromTypedVision(vision)
      let htmlCard: ReturnType<typeof parseVisionFieldCardJson> | null = null
      let raw = await getVisionFieldCardHtml(
        WESTPORT_LOOKUP_TOWN,
        vision.visionPid,
      )
      if (!raw && vision.parcelUrl) {
        try {
          const res = await fetch(vision.parcelUrl, {
            headers: { accept: 'text/html' },
            cache: 'no-store',
          })
          if (res.ok) raw = await res.text()
        } catch {
          /* live VGSI HTML is optional when R2 is empty */
        }
      }
      if (raw) htmlCard = parseVisionFieldCardJson(raw)
      const pdfCard = await fetchVisionFieldCardPdfJson(
        WESTPORT_LOOKUP_TOWN,
        vision.visionPid,
      )
      json = mergeFieldCardJson(typed, htmlCard, pdfCard)
      if (json.fields.length > 0) {
        await persistVisionFieldCardJson(
          WESTPORT_LOOKUP_TOWN,
          vision.visionPid,
          json,
        )
      }
    } catch (err) {
      console.warn('[westport-lookup] field card JSON backfill failed', err)
    }
  }
  if (!json || json.fields.length === 0) {
    json = fieldCardFromTypedVision(vision)
  }
  return {
    fields: json.fields,
    ownership: resolveOwnership(json, vision),
    storedJson: json.fields.length > 0,
    photoUrl: vision.photoUrl,
    parcelUrl: vision.parcelUrl,
    r2Key: vision.fieldCardR2Key,
  }
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
  const byPid = await queryOne<{ id: string }>(
    `SELECT id FROM listings
      WHERE vision_pid = $1 AND lower(town) = lower($2)
      ORDER BY
        CASE status_bucket
          WHEN 'Active' THEN 0
          WHEN 'Closed' THEN 1
          WHEN 'Expired' THEN 2
          ELSE 3
        END,
        modification_timestamp DESC NULLS LAST
      LIMIT 1`,
    [v.visionPid, v.town],
  )
  if (byPid?.id) {
    const listing = await readListingByIdFromDb(byPid.id)
    if (listing) return listing
  }
  if (v.listingId) {
    const byId = await readListingByIdFromDb(v.listingId)
    if (byId) return byId
  }
  if (v.mlsId) {
    const byMls = await readListingByIdFromDb(v.mlsId)
    if (byMls) return byMls
  }
  const { findListingInDbByVisionAddress, stampVisionListingLink } = await import(
    '@/lib/find-listing-ingest'
  )
  const byKey = await findListingInDbByVisionAddress(v)
  if (byKey) {
    await stampVisionListingLink(v, byKey)
    return byKey
  }
  return null
}

type WestportListingSearchRow = {
  id: string
  mls_id: string | null
  address_street: string | null
  address_full: string | null
  status_bucket: string | null
  price: number | string | null
  vision_pid: string | null
}

async function searchWestportListingRows(
  q: string,
  limit: number,
): Promise<WestportListingSearchRow[]> {
  const street = normalizeStreetLine(q)
  if (street.length < 2) return []
  const variants = streetSearchVariants(q)
  const prefixes = variants.map((variant) => `${variant.toLowerCase()}%`)
  const tokenPatterns = variants.map(
    (variant) => `%${variant.toLowerCase().split(/\s+/).filter(Boolean).join('%')}%`,
  )
  const patterns = [...new Set([...prefixes, ...tokenPatterns])]
  const likes = patterns
    .map((_, i) => {
      const p = `$${i + 2}`
      return `(lower(coalesce(address_street, '')) LIKE ${p} OR lower(coalesce(address_full, '')) LIKE ${p})`
    })
    .join(' OR ')
  return query<WestportListingSearchRow>(
    `SELECT id, mls_id, address_street, address_full, status_bucket, price, vision_pid
       FROM listings
      WHERE lower(town) = lower($1)
        AND (${likes})
      ORDER BY
        CASE status_bucket
          WHEN 'Active' THEN 0
          WHEN 'Closed' THEN 1
          WHEN 'Expired' THEN 2
          ELSE 3
        END,
        modification_timestamp DESC NULLS LAST
      LIMIT $${patterns.length + 2}`,
    [
      WESTPORT_LOOKUP_TOWN,
      ...patterns,
      Math.min(Math.max(limit * 3, 8), 48),
    ],
  )
}

function looksLikeStreetQuery(raw: string): boolean {
  return /^\d+[A-Za-z]?\s+[A-Za-z]/.test(raw.trim())
}

function listingRowStatusRank(bucket: string | null): number {
  if (bucket === 'Active') return 0
  if (bucket === 'Closed') return 1
  if (bucket === 'Expired') return 2
  return 3
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

  const seenPids = new Set(out.map((h) => h.visionPid).filter(Boolean))
  const seenMls = new Set(
    out.flatMap((h) => [h.mlsId, h.listingId].filter((v): v is string => Boolean(v))),
  )
  const seenNorms = new Set<string>()
  for (const v of visionHits) {
    if (!v.addressNorm) continue
    const keys = visionListingKeys(v.addressNorm)
    seenNorms.add(keys.exact)
    seenNorms.add(keys.loose)
  }

  const listingRows = await searchWestportListingRows(q, limit)
  const groups = new Map<string, WestportListingSearchRow[]>()
  for (const row of listingRows) {
    const street = row.address_street || row.address_full || ''
    if (!street.trim()) continue
    const keys = visionListingKeys(
      normalizePropertyAddress(WESTPORT_LOOKUP_TOWN, street, null),
    )
    const list = groups.get(keys.exact) ?? []
    list.push(row)
    groups.set(keys.exact, list)
  }

  for (const [key, group] of groups) {
    if (out.length >= limit) break
    const loose = visionListingKeys(key).loose
    if (seenNorms.has(key) || seenNorms.has(loose)) continue
    const preferred = group.slice().sort((a, b) => {
      return listingRowStatusRank(a.status_bucket) - listingRowStatusRank(b.status_bucket)
    })[0]!
    if (preferred.vision_pid && seenPids.has(preferred.vision_pid)) continue
    if (preferred.mls_id && seenMls.has(preferred.mls_id)) continue
    if (seenMls.has(preferred.id)) continue

    if (preferred.vision_pid) {
      const vision = await getVisionAddress(WESTPORT_LOOKUP_TOWN, preferred.vision_pid)
      if (vision) {
        const listing = await listingForVision(vision)
        out.push(
          hitFromVision(
            vision,
            listing
              ? { status: listing.status, price: listing.price }
              : {
                  status: preferred.status_bucket,
                  price:
                    preferred.price == null ? null : Number(preferred.price),
                },
            group.length,
          ),
        )
        seenPids.add(vision.visionPid)
        seenNorms.add(key)
        continue
      }
    }

    const priceNum =
      preferred.price == null || preferred.price === ''
        ? null
        : Number(preferred.price)
    out.push({
      visionPid: preferred.vision_pid ?? '',
      addressFull: preferred.address_full || `${preferred.address_street}, Westport`,
      street: preferred.address_street || preferred.address_full || 'Westport listing',
      mblu: null,
      ownerName: null,
      listingId: preferred.id,
      mlsId: preferred.mls_id,
      status: preferred.status_bucket,
      price: Number.isFinite(priceNum) ? priceNum : null,
      siblingCount: group.length,
    })
    if (preferred.mls_id) seenMls.add(preferred.mls_id)
    seenMls.add(preferred.id)
    seenNorms.add(key)
  }

  const hasListingHit = out.some((h) => Boolean(h.mlsId || h.listingId))
  if (
    !hasListingHit &&
    looksLikeStreetQuery(q) &&
    out.length < limit
  ) {
    const { ingestFindListingByStreetQuery, stampVisionListingLink } =
      await import('@/lib/find-listing-ingest')
    const listing = await ingestFindListingByStreetQuery(q)
    const town = listing?.address.city?.trim().toLowerCase()
    if (listing && town === 'westport') {
      const street = listing.address.street || listing.address.full || q
      const visionHit = out.find((h) => h.visionPid)
      if (visionHit?.visionPid) {
        const vision = await getVisionAddress(
          WESTPORT_LOOKUP_TOWN,
          visionHit.visionPid,
        )
        if (vision) await stampVisionListingLink(vision, listing)
      }
      const already = out.some(
        (h) => h.mlsId === listing.mlsId || h.listingId === listing.listingKey,
      )
      if (!already) {
        out.unshift({
          visionPid: visionHit?.visionPid ?? '',
          addressFull: listing.address.full || `${street}, Westport`,
          street,
          mblu: visionHit?.mblu ?? null,
          ownerName: listing.ownerName ?? visionHit?.ownerName ?? null,
          listingId: listing.listingKey,
          mlsId: listing.mlsId,
          status: listing.status,
          price: listing.price,
          siblingCount: 1,
        })
      } else if (visionHit && !visionHit.mlsId) {
        visionHit.listingId = listing.listingKey
        visionHit.mlsId = listing.mlsId
        visionHit.status = listing.status
        visionHit.price = listing.price
      }
    }
  }

  const looksLikeMls = /^[A-Za-z0-9-]{5,}$/.test(q.trim()) && !/\s/.test(q.trim())
  if (looksLikeMls && out.length < limit) {
    let listing = await readListingByIdFromDb(q.trim())
    if (!listing) {
      const { ingestFindListingByMlsQuery } = await import(
        '@/lib/find-listing-ingest'
      )
      listing = await ingestFindListingByMlsQuery(q.trim())
    }
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
  options: { ingest?: boolean } = {},
): Promise<WestportMergedProperty | null> {
  const vision = await getVisionAddress(WESTPORT_LOOKUP_TOWN, visionPid)
  if (!vision) return null

  let listing = await listingForVision(vision)
  let listingIngested = false
  if (!listing && options.ingest !== false) {
    const { ingestFindListingIfMissing } = await import(
      '@/lib/find-listing-ingest'
    )
    const pulled = await ingestFindListingIfMissing(vision, listing)
    listing = pulled.listing
    listingIngested = pulled.ingested
  }
  const siblings = vision.addressNorm
    ? (await listVisionAddressesByNorm(WESTPORT_LOOKUP_TOWN, vision.addressNorm))
        .filter((s) => s.visionPid !== vision.visionPid)
        .map((s) => hitFromVision(s, null, 0))
    : []

  const mlsId = listing?.mlsId ?? vision.mlsId
  const mlsPhotos =
    listing && mlsId && (listing.photoCount ?? 0) > 0
      ? buildListingPhotoProxyUrls(mlsId, Math.min(listing.photoCount ?? 0, 8))
      : []
  const photos = mlsPhotos.length > 0
    ? mlsPhotos
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

  const fieldCard = await resolveWestportFieldCard(vision)

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
    fieldCard,
    siblings,
    listingIngested,
    listing: listing
      ? {
          mlsId: listing.mlsId,
          listingKey: listing.listingKey ?? listing.mlsId,
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
    ownerDisplayName: ownerDisplayNameFromFields(
      fieldCard.fields,
      vision.ownerName ?? listing?.ownerName,
    ),
    ownerMailingAddress:
      ownerMailingAddressFromFields(fieldCard.fields) ??
      vision.ownerMailingAddress,
    purchaseDate: visionPurchaseDate({
      lastSaleDate: vision.lastSaleDate,
      lastSalePrice: vision.lastSalePrice,
      ownership: fieldCard.ownership,
    }),
    lastSoldPrice:
      visionLastPaidSale({
        lastSaleDate: vision.lastSaleDate,
        lastSalePrice: vision.lastSalePrice,
        ownership: fieldCard.ownership,
      })?.price ?? null,
    purchaseYear: visionPurchaseYear({
      lastSaleDate: vision.lastSaleDate,
      lastSalePrice: vision.lastSalePrice,
      ownership: fieldCard.ownership,
    }),
    quitclaimCount: countVisionQuitclaims(fieldCard.ownership),
    deedHistory: visionDeedDisplayRows(fieldCard.ownership),
    assessedValue: visionFill(listing?.assessedValue, vision.assessedValue),
    appraisalValue: visionFill(null, vision.appraisalValue),
    lastSalePrice: visionFill(null, vision.lastSalePrice),
    lastSaleDate: visionFill(null, vision.lastSaleDate),
    lastSaleBookPage: visionFill(null, vision.lastSaleBookPage),
    style: visionFill(listing?.style, vision.style),
  }
}
