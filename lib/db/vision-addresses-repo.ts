import 'server-only'

import { execute, query, queryOne } from '@/lib/db/postgres'
import {
  addressMatchKey,
  normalizePropertyAddress,
  normalizeStreetLine,
} from '@/lib/property-address'
import type { VisionParcelParse } from '@/lib/vision-gis-parse'

let visionAddressesReady = false
let visionAddressesPromise: Promise<void> | null = null

/** Idempotent DDL — Netlify may not run migrations on deploy. */
export async function ensureVisionAddressesTable(): Promise<void> {
  if (visionAddressesReady) return
  if (!visionAddressesPromise) {
    visionAddressesPromise = (async () => {
      try {
        await query(`
          CREATE TABLE IF NOT EXISTS vision_addresses (
            town                     text NOT NULL,
            vision_pid               text NOT NULL,
            account_number           text,
            mblu                     text,
            use_code                 text,
            use_code_description     text,
            address_full             text,
            address_norm             text,
            street_no                text,
            street_name              text,
            city                     text,
            state                    text,
            zip                      text,
            owner_name               text,
            assessed_value           integer,
            appraisal_value          integer,
            building_count           integer,
            year_built               integer,
            living_area_sqft         integer,
            beds                     integer,
            full_baths               integer,
            half_baths               integer,
            total_rooms              integer,
            style                    text,
            model                    text,
            acres                    double precision,
            zoning                   text,
            last_sale_price          integer,
            last_sale_date           text,
            last_sale_book_page      text,
            photo_url                text,
            parcel_url               text NOT NULL,
            field_card_r2_key        text,
            field_card_content_type  text,
            field_card_scraped_at    timestamptz,
            listing_id               text,
            mls_id                   text,
            content_fingerprint      text,
            source_host              text NOT NULL,
            scraped_at               timestamptz NOT NULL,
            updated_at               timestamptz NOT NULL,
            PRIMARY KEY (town, vision_pid)
          )
        `)
        await query(`
          CREATE INDEX IF NOT EXISTS idx_vision_addr_town_norm
            ON vision_addresses (town, address_norm)
            WHERE address_norm IS NOT NULL
        `)
        await query(`
          CREATE INDEX IF NOT EXISTS idx_vision_addr_mblu
            ON vision_addresses (town, mblu)
            WHERE mblu IS NOT NULL
        `)
        await query(`
          CREATE INDEX IF NOT EXISTS idx_vision_addr_listing_id
            ON vision_addresses (listing_id)
            WHERE listing_id IS NOT NULL
        `)
        await query(`
          ALTER TABLE listings ADD COLUMN IF NOT EXISTS vision_pid text
        `)
        await query(`
          CREATE INDEX IF NOT EXISTS idx_listings_vision_pid
            ON listings (vision_pid)
            WHERE vision_pid IS NOT NULL
        `)
        visionAddressesReady = true
      } catch (err) {
        visionAddressesReady = false
        console.warn('[vision-addresses-repo] ensure table failed', err)
        throw err
      }
    })().finally(() => {
      visionAddressesPromise = null
    })
  }
  await visionAddressesPromise
  if (!visionAddressesReady) {
    throw new Error('vision_addresses table is not ready')
  }
}

export async function getVisionFingerprint(
  town: string,
  visionPid: string,
): Promise<string | null> {
  const row = await queryOne<{ content_fingerprint: string | null }>(
    `SELECT content_fingerprint FROM vision_addresses
      WHERE town = $1 AND vision_pid = $2`,
    [town, visionPid],
  )
  return row?.content_fingerprint ?? null
}

export async function upsertVisionAddress(
  parsed: VisionParcelParse,
  opts: {
    scrapedAt: string
    fieldCardR2Key: string | null
    rewriteBlob: boolean
    changed: boolean
  },
): Promise<void> {
  await execute(
    `
    INSERT INTO vision_addresses (
      town, vision_pid, account_number, mblu, use_code, use_code_description,
      address_full, address_norm, street_no, street_name, city, state, zip,
      owner_name, assessed_value, appraisal_value, building_count, year_built,
      living_area_sqft, beds, full_baths, half_baths, total_rooms, style, model,
      acres, zoning, last_sale_price, last_sale_date, last_sale_book_page,
      photo_url, parcel_url, field_card_r2_key, field_card_content_type,
      field_card_scraped_at, content_fingerprint, source_host, scraped_at, updated_at
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,
      $19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,
      $35,$36,$37,$38,$39
    )
    ON CONFLICT (town, vision_pid) DO UPDATE SET
      account_number = EXCLUDED.account_number,
      mblu = EXCLUDED.mblu,
      use_code = EXCLUDED.use_code,
      use_code_description = EXCLUDED.use_code_description,
      address_full = EXCLUDED.address_full,
      address_norm = EXCLUDED.address_norm,
      street_no = EXCLUDED.street_no,
      street_name = EXCLUDED.street_name,
      city = EXCLUDED.city,
      state = EXCLUDED.state,
      zip = COALESCE(EXCLUDED.zip, vision_addresses.zip),
      owner_name = EXCLUDED.owner_name,
      assessed_value = EXCLUDED.assessed_value,
      appraisal_value = EXCLUDED.appraisal_value,
      building_count = EXCLUDED.building_count,
      year_built = EXCLUDED.year_built,
      living_area_sqft = EXCLUDED.living_area_sqft,
      beds = EXCLUDED.beds,
      full_baths = EXCLUDED.full_baths,
      half_baths = EXCLUDED.half_baths,
      total_rooms = EXCLUDED.total_rooms,
      style = EXCLUDED.style,
      model = EXCLUDED.model,
      acres = EXCLUDED.acres,
      zoning = EXCLUDED.zoning,
      last_sale_price = EXCLUDED.last_sale_price,
      last_sale_date = EXCLUDED.last_sale_date,
      last_sale_book_page = EXCLUDED.last_sale_book_page,
      photo_url = EXCLUDED.photo_url,
      parcel_url = EXCLUDED.parcel_url,
      field_card_r2_key = CASE
        WHEN $40 THEN EXCLUDED.field_card_r2_key
        ELSE COALESCE(vision_addresses.field_card_r2_key, EXCLUDED.field_card_r2_key)
      END,
      field_card_content_type = CASE
        WHEN $40 THEN EXCLUDED.field_card_content_type
        ELSE COALESCE(vision_addresses.field_card_content_type, EXCLUDED.field_card_content_type)
      END,
      field_card_scraped_at = CASE
        WHEN $40 THEN EXCLUDED.field_card_scraped_at
        ELSE COALESCE(vision_addresses.field_card_scraped_at, EXCLUDED.field_card_scraped_at)
      END,
      content_fingerprint = EXCLUDED.content_fingerprint,
      source_host = EXCLUDED.source_host,
      scraped_at = EXCLUDED.scraped_at,
      updated_at = CASE
        WHEN $41 THEN EXCLUDED.updated_at
        ELSE vision_addresses.updated_at
      END
    `,
    [
      parsed.town,
      parsed.visionPid,
      parsed.accountNumber,
      parsed.mblu,
      parsed.useCode,
      parsed.useCodeDescription,
      parsed.addressFull,
      parsed.addressNorm,
      parsed.streetNo,
      parsed.streetName,
      parsed.city,
      parsed.state,
      parsed.zip,
      parsed.ownerName,
      parsed.assessedValue,
      parsed.appraisalValue,
      parsed.buildingCount,
      parsed.yearBuilt,
      parsed.livingAreaSqft,
      parsed.beds,
      parsed.fullBaths,
      parsed.halfBaths,
      parsed.totalRooms,
      parsed.style,
      parsed.model,
      parsed.acres,
      parsed.zoning,
      parsed.lastSalePrice,
      parsed.lastSaleDate,
      parsed.lastSaleBookPage,
      parsed.photoUrl,
      parsed.parcelUrl,
      opts.fieldCardR2Key,
      opts.fieldCardR2Key ? 'text/html; charset=utf-8' : null,
      opts.rewriteBlob ? opts.scrapedAt : null,
      parsed.contentFingerprint,
      parsed.sourceHost,
      opts.scrapedAt,
      opts.scrapedAt,
      opts.rewriteBlob,
      opts.changed,
    ],
  )
}

export async function countVisionAddresses(town?: string): Promise<number> {
  if (town) {
    const row = await queryOne<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM vision_addresses WHERE town = $1`,
      [town],
    )
    return Number(row?.count ?? 0)
  }
  const row = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM vision_addresses`,
  )
  return Number(row?.count ?? 0)
}

export async function listVisionPidsForTown(
  town: string,
  afterPid: string | null,
  limit: number,
): Promise<string[]> {
  const rows = afterPid
    ? await query<{ vision_pid: string }>(
        `SELECT vision_pid FROM vision_addresses
          WHERE town = $1 AND vision_pid > $2
          ORDER BY vision_pid ASC
          LIMIT $3`,
        [town, afterPid, limit],
      )
    : await query<{ vision_pid: string }>(
        `SELECT vision_pid FROM vision_addresses
          WHERE town = $1
          ORDER BY vision_pid ASC
          LIMIT $2`,
        [town, limit],
      )
  return rows.map((r) => r.vision_pid)
}

export type VisionListingLinkSample = {
  addressNorm: string
  visionPid: string
  listingId: string
  mlsId: string | null
}

export type VisionListingLinkReport = {
  town: string
  dryRun: boolean
  visionCandidates: number
  listingCandidates: number
  uniqueMatches: number
  alreadyLinked: number
  visionLinked: number
  listingsLinked: number
  skippedAmbiguous: number
  /** Keys with 1 Vision PID and 2+ listings — now stamped, not skipped. */
  multiListingKeys: number
  /** @deprecated Always 0. Re-lists are stamped; use multiListingKeys. */
  skippedMultiListing: number
  unmatchedListings: number
  unmatchedVision: number
  samples: {
    matched: VisionListingLinkSample[]
    ambiguous: { addressNorm: string; visionPids: number; listings: number }[]
  }
}

type ListingLinkRow = {
  id: string
  mls_id: string | null
  visionPid: string | null
  statusBucket: string | null
  modifiedAt: Date | string | null
}

function listingStatusRank(bucket: string | null | undefined): number {
  switch (bucket) {
    case 'Active':
      return 0
    case 'Closed':
      return 1
    case 'Expired':
      return 2
    default:
      return 3
  }
}

function pickPreferredListing(listings: ListingLinkRow[]): ListingLinkRow {
  return listings.slice().sort((a, b) => {
    const rank = listingStatusRank(a.statusBucket) - listingStatusRank(b.statusBucket)
    if (rank !== 0) return rank
    const at = a.modifiedAt ? new Date(a.modifiedAt).getTime() : 0
    const bt = b.modifiedAt ? new Date(b.modifiedAt).getTime() : 0
    return bt - at
  })[0]!
}

/**
 * Join listings ↔ vision when the address has exactly one Vision PID.
 * Every listing at that address gets `vision_pid` (re-lists included).
 * Two or more Vision PIDs at the same key stay unmatched (condos / split lots).
 */
export async function backfillVisionListingLinks(
  town: string,
  options?: { dryRun?: boolean; sampleLimit?: number },
): Promise<VisionListingLinkReport> {
  const dryRun = options?.dryRun === true
  const sampleLimit = options?.sampleLimit ?? 12

  const visionRows = await query<{
    vision_pid: string
    address_norm: string | null
    street_no: string | null
    listing_id: string | null
  }>(
    `SELECT vision_pid, address_norm, street_no, listing_id
       FROM vision_addresses
      WHERE town = $1
        AND street_no IS NOT NULL
        AND address_norm IS NOT NULL`,
    [town],
  )

  const listingRows = await query<{
    id: string
    mls_id: string | null
    address_street: string | null
    postal_code: string | null
    vision_pid: string | null
    status_bucket: string | null
    modification_timestamp: Date | string | null
  }>(
    `SELECT id, mls_id, address_street, postal_code, vision_pid,
            status_bucket, modification_timestamp
       FROM listings
      WHERE lower(town) = lower($1)
        AND address_street IS NOT NULL
        AND trim(address_street) <> ''`,
    [town],
  )

  const visionByNorm = new Map<
    string,
    { visionPid: string; listingId: string | null }[]
  >()
  for (const v of visionRows) {
    if (!v.address_norm) continue
    const key = addressMatchKey(v.address_norm)
    const list = visionByNorm.get(key) ?? []
    list.push({ visionPid: v.vision_pid, listingId: v.listing_id })
    visionByNorm.set(key, list)
  }

  const listingByNorm = new Map<string, ListingLinkRow[]>()
  for (const l of listingRows) {
    if (!l.address_street) continue
    const norm = normalizePropertyAddress(town, l.address_street, l.postal_code)
    const key = addressMatchKey(norm)
    const list = listingByNorm.get(key) ?? []
    list.push({
      id: l.id,
      mls_id: l.mls_id,
      visionPid: l.vision_pid,
      statusBucket: l.status_bucket,
      modifiedAt: l.modification_timestamp,
    })
    listingByNorm.set(key, list)
  }

  let uniqueMatches = 0
  let alreadyLinked = 0
  let visionLinked = 0
  let listingsLinked = 0
  let skippedAmbiguous = 0
  let multiListingKeys = 0
  const matchedSamples: VisionListingLinkSample[] = []
  const ambiguousSamples: { addressNorm: string; visionPids: number; listings: number }[] =
    []

  const matchedNorms = new Set<string>()

  for (const [norm, pids] of visionByNorm) {
    const listings = listingByNorm.get(norm) ?? []
    if (pids.length !== 1) {
      skippedAmbiguous += 1
      if (ambiguousSamples.length < sampleLimit) {
        ambiguousSamples.push({
          addressNorm: norm,
          visionPids: pids.length,
          listings: listings.length,
        })
      }
      continue
    }
    if (listings.length === 0) continue

    if (listings.length > 1) multiListingKeys += 1

    uniqueMatches += 1
    matchedNorms.add(norm)
    const vision = pids[0]!
    const preferred = pickPreferredListing(listings)
    if (matchedSamples.length < sampleLimit) {
      matchedSamples.push({
        addressNorm: norm,
        visionPid: vision.visionPid,
        listingId: preferred.id,
        mlsId: preferred.mls_id,
      })
    }

    const visionAlready = vision.listingId === preferred.id
    const listingsAlready = listings.every(
      (listing) =>
        listing.visionPid != null &&
        listing.visionPid !== '' &&
        listing.visionPid === vision.visionPid,
    )
    if (visionAlready && listingsAlready) {
      alreadyLinked += 1
      continue
    }

    if (dryRun) continue

    visionLinked += await execute(
      `UPDATE vision_addresses
          SET listing_id = $3, mls_id = COALESCE($4, mls_id)
        WHERE town = $1 AND vision_pid = $2`,
      [town, vision.visionPid, preferred.id, preferred.mls_id],
    )
    listingsLinked += await execute(
      `UPDATE listings
          SET vision_pid = $2
        WHERE id = ANY($1::text[])
          AND (vision_pid IS NULL OR vision_pid = '')`,
      [listings.map((listing) => listing.id), vision.visionPid],
    )
  }

  let unmatchedVision = 0
  for (const [norm, pids] of visionByNorm) {
    if (pids.length !== 1) continue
    if (!matchedNorms.has(norm)) unmatchedVision += 1
  }
  let unmatchedListings = 0
  for (const [norm, listings] of listingByNorm) {
    const pids = visionByNorm.get(norm) ?? []
    if (pids.length === 1) continue
    unmatchedListings += listings.length
  }

  return {
    town,
    dryRun,
    visionCandidates: visionRows.length,
    listingCandidates: listingRows.length,
    uniqueMatches,
    alreadyLinked,
    visionLinked: dryRun ? 0 : visionLinked,
    listingsLinked: dryRun ? 0 : listingsLinked,
    skippedAmbiguous,
    multiListingKeys,
    skippedMultiListing: 0,
    unmatchedListings,
    unmatchedVision,
    samples: { matched: matchedSamples, ambiguous: ambiguousSamples },
  }
}

export type VisionAddressRecord = {
  town: string
  visionPid: string
  accountNumber: string | null
  mblu: string | null
  useCode: string | null
  useCodeDescription: string | null
  addressFull: string | null
  addressNorm: string | null
  streetNo: string | null
  streetName: string | null
  city: string | null
  state: string | null
  zip: string | null
  ownerName: string | null
  assessedValue: number | null
  appraisalValue: number | null
  yearBuilt: number | null
  livingAreaSqft: number | null
  beds: number | null
  fullBaths: number | null
  halfBaths: number | null
  style: string | null
  acres: number | null
  zoning: string | null
  lastSalePrice: number | null
  lastSaleDate: string | null
  lastSaleBookPage: string | null
  buildingCount: number | null
  totalRooms: number | null
  model: string | null
  photoUrl: string | null
  parcelUrl: string
  listingId: string | null
  mlsId: string | null
}

type VisionAddressSqlRow = {
  town: string
  vision_pid: string
  account_number: string | null
  mblu: string | null
  use_code: string | null
  use_code_description: string | null
  address_full: string | null
  address_norm: string | null
  street_no: string | null
  street_name: string | null
  city: string | null
  state: string | null
  zip: string | null
  owner_name: string | null
  assessed_value: number | string | null
  appraisal_value: number | string | null
  year_built: number | string | null
  living_area_sqft: number | string | null
  beds: number | string | null
  full_baths: number | string | null
  half_baths: number | string | null
  style: string | null
  acres: number | string | null
  zoning: string | null
  last_sale_price: number | string | null
  last_sale_date: string | null
  last_sale_book_page: string | null
  building_count: number | string | null
  total_rooms: number | string | null
  model: string | null
  photo_url: string | null
  parcel_url: string
  listing_id: string | null
  mls_id: string | null
}

function numOrNull(v: number | string | null | undefined): number | null {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

function mapVisionAddressRow(row: VisionAddressSqlRow): VisionAddressRecord {
  return {
    town: row.town,
    visionPid: row.vision_pid,
    accountNumber: row.account_number,
    mblu: row.mblu,
    useCode: row.use_code,
    useCodeDescription: row.use_code_description,
    addressFull: row.address_full,
    addressNorm: row.address_norm,
    streetNo: row.street_no,
    streetName: row.street_name,
    city: row.city,
    state: row.state,
    zip: row.zip,
    ownerName: row.owner_name,
    assessedValue: numOrNull(row.assessed_value),
    appraisalValue: numOrNull(row.appraisal_value),
    yearBuilt: numOrNull(row.year_built),
    livingAreaSqft: numOrNull(row.living_area_sqft),
    beds: numOrNull(row.beds),
    fullBaths: numOrNull(row.full_baths),
    halfBaths: numOrNull(row.half_baths),
    style: row.style,
    acres: numOrNull(row.acres),
    zoning: row.zoning,
    lastSalePrice: numOrNull(row.last_sale_price),
    lastSaleDate: row.last_sale_date,
    lastSaleBookPage: row.last_sale_book_page,
    buildingCount: numOrNull(row.building_count),
    totalRooms: numOrNull(row.total_rooms),
    model: row.model,
    photoUrl: row.photo_url,
    parcelUrl: row.parcel_url,
    listingId: row.listing_id,
    mlsId: row.mls_id,
  }
}

const VISION_SELECT = `
  town, vision_pid, account_number, mblu, use_code, use_code_description,
  address_full, address_norm, street_no, street_name, city, state, zip,
  owner_name, assessed_value, appraisal_value, year_built, living_area_sqft,
  beds, full_baths, half_baths, style, acres, zoning,
  last_sale_price, last_sale_date, last_sale_book_page,
  building_count, total_rooms, model,
  photo_url, parcel_url, listing_id, mls_id
`

export async function getVisionAddress(
  town: string,
  visionPid: string,
): Promise<VisionAddressRecord | null> {
  await ensureVisionAddressesTable()
  const row = await queryOne<VisionAddressSqlRow>(
    `SELECT ${VISION_SELECT} FROM vision_addresses
      WHERE town = $1 AND vision_pid = $2`,
    [town, visionPid],
  )
  return row ? mapVisionAddressRow(row) : null
}

export async function listVisionAddressesByNorm(
  town: string,
  addressNorm: string,
): Promise<VisionAddressRecord[]> {
  await ensureVisionAddressesTable()
  const rows = await query<VisionAddressSqlRow>(
    `SELECT ${VISION_SELECT} FROM vision_addresses
      WHERE town = $1 AND address_norm = $2
      ORDER BY mblu NULLS LAST, vision_pid`,
    [town, addressNorm],
  )
  return rows.map(mapVisionAddressRow)
}

/** Prefix on address_norm; street-name / address_full contains as fallback. No RETS. */
export async function searchVisionAddresses(opts: {
  town: string
  q: string
  limit?: number
}): Promise<VisionAddressRecord[]> {
  await ensureVisionAddressesTable()
  const q = opts.q.trim()
  if (q.length < 2) return []
  const limit = Math.min(Math.max(opts.limit ?? 12, 1), 24)
  const street = normalizeStreetLine(q)
  const prefix = `${street}%`
  const contains = `%${q.toLowerCase().replace(/[%_]/g, '')}%`
  const streetLine = `${q.replace(/[%_]/g, '')}%`

  const rows = await query<VisionAddressSqlRow>(
    `SELECT ${VISION_SELECT} FROM vision_addresses
      WHERE town = $1
        AND (
          address_norm LIKE $2
          OR lower(coalesce(address_full, '')) LIKE $3
          OR lower(coalesce(street_name, '')) LIKE $3
          OR lower(trim(coalesce(street_no, '') || ' ' || coalesce(street_name, ''))) LIKE $4
        )
      ORDER BY
        CASE WHEN address_norm LIKE $2 THEN 0 ELSE 1 END,
        address_full NULLS LAST,
        vision_pid
      LIMIT $5`,
    [opts.town, prefix, contains, streetLine.toLowerCase(), limit],
  )
  return rows.map(mapVisionAddressRow)
}
