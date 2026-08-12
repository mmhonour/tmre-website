import 'server-only'

import { execute, query, queryOne } from '@/lib/db/postgres'
import { normalizePropertyAddress } from '@/lib/property-address'
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

/** Bidirectional listing join for rows that have a street number + unique address_norm. */
export async function backfillVisionListingLinks(town: string): Promise<{
  visionLinked: number
  listingsLinked: number
}> {
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
  }>(
    `SELECT id, mls_id, address_street, postal_code, vision_pid
       FROM listings
      WHERE lower(town) = lower($1)
        AND address_street IS NOT NULL
        AND trim(address_street) <> ''`,
    [town],
  )

  const visionByNorm = new Map<string, string[]>()
  for (const v of visionRows) {
    if (!v.address_norm) continue
    const list = visionByNorm.get(v.address_norm) ?? []
    list.push(v.vision_pid)
    visionByNorm.set(v.address_norm, list)
  }

  const listingByNorm = new Map<string, { id: string; mls_id: string | null }[]>()
  for (const l of listingRows) {
    if (!l.address_street) continue
    const norm = normalizePropertyAddress(town, l.address_street, l.postal_code)
    const list = listingByNorm.get(norm) ?? []
    list.push({ id: l.id, mls_id: l.mls_id })
    listingByNorm.set(norm, list)
  }

  let visionLinked = 0
  let listingsLinked = 0

  for (const [norm, pids] of visionByNorm) {
    if (pids.length !== 1) continue
    const listings = listingByNorm.get(norm)
    if (!listings || listings.length !== 1) continue
    const visionPid = pids[0]!
    const listing = listings[0]!

    visionLinked += await execute(
      `UPDATE vision_addresses
          SET listing_id = $3, mls_id = COALESCE($4, mls_id)
        WHERE town = $1 AND vision_pid = $2 AND listing_id IS NULL`,
      [town, visionPid, listing.id, listing.mls_id],
    )
    listingsLinked += await execute(
      `UPDATE listings
          SET vision_pid = $2
        WHERE id = $1 AND (vision_pid IS NULL OR vision_pid = '')`,
      [listing.id, visionPid],
    )
  }

  return { visionLinked, listingsLinked }
}
