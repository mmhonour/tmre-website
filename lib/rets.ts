import 'server-only'

import { parseLotAcresFromRaw } from '@/lib/listing-lot-acres'
import { propertyTaxFromRaw } from '@/lib/listing-property-tax'

type RetsClientModule = typeof import('rets-client')

let retsLib: RetsClientModule | null = null
let retsUnavailable = false

/** Lazy-load rets-client so native deps (node-expat) don't crash route modules at import time. */
function loadRetsClient(): RetsClientModule {
  if (retsUnavailable) {
    throw new Error('RETS client unavailable in this runtime')
  }
  if (!retsLib) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      retsLib = require('rets-client') as RetsClientModule
    } catch (err) {
      retsUnavailable = true
      const message = err instanceof Error ? err.message : String(err)
      console.warn('[rets] native RETS client unavailable:', message)
      throw new Error(`RETS client unavailable: ${message}`)
    }
  }
  return retsLib
}

export type RawRetsRecord = Record<string, string>

export type Address = {
  street: string
  unit: string
  city: string
  state: string
  postalCode: string
  full: string
}

export type Schools = {
  elementary: string | null
  middle: string | null
  high: string | null
  district: string | null
}

export type Listing = {
  mlsId: string
  listingKey: string
  status: string
  propertyType: string
  style: string
  address: Address
  price: number | null
  originalListPrice: number | null
  beds: number | null
  baths: number | null
  sqft: number | null
  /** Lot size in acres when disclosed in MLS. */
  lotAcres: number | null
  yearBuilt: number | null
  dom: number | null
  listDate: string | null
  modificationTimestamp: string | null
  priceChangeTimestamp: string | null
  statusChangeTimestamp: string | null
  latitude: number | null
  longitude: number | null
  photoCount: number | null
  ownerName: string | null
  remarks: string | null
  /** Annual property tax from MLS (cached in SQLite). */
  propertyTax?: number | null
  /** Tax fiscal year label from MLS (cached in SQLite). */
  propertyTaxYear?: string | null
  schools: Schools
  raw: RawRetsRecord
}

export type SearchParams = {
  city?: string
  county?: string
  zip?: string
  status?: string
  propertyType?: string
  minPrice?: number
  maxPrice?: number
  limit?: number
  closedAfter?: string   // ISO date e.g. "2024-01-01"
  closedBefore?: string  // ISO date e.g. "2024-12-31"
  /** ISO datetime — only rows modified at or after this instant (RETS ModificationTimestamp). */
  modifiedAfter?: string
  /** Space-separated tokens matched with wildcards on UnparsedAddress (live RETS). */
  addressContains?: string
}

export type MarketStats = {
  city: string
  activeCount: number
  medianPrice: number | null
  avgDaysOnMarket: number | null
  avgPricePerSqft: number | null
  avgBeds: number | null
  sampleSize: number
}

const DEFAULT_LIMIT = 100
const SEARCH_TTL_MS = 5 * 60 * 1000
const STATS_TTL_MS = 10 * 60 * 1000

type CacheEntry<T> = { value: T; expiresAt: number }
const cache = new Map<string, CacheEntry<unknown>>()

function getCached<T>(key: string): T | null {
  const hit = cache.get(key)
  if (!hit) return null
  if (hit.expiresAt < Date.now()) {
    cache.delete(key)
    return null
  }
  return hit.value as T
}

function setCached<T>(key: string, value: T, ttlMs: number): void {
  cache.set(key, { value, expiresAt: Date.now() + ttlMs })
}

function requireEnv() {
  const { RETS_SERVER_URL, RETS_USERNAME, RETS_PASSWORD } = process.env
  if (!RETS_SERVER_URL || !RETS_USERNAME || !RETS_PASSWORD) {
    throw new Error(
      'RETS env vars missing - set RETS_SERVER_URL, RETS_USERNAME, RETS_PASSWORD in .env.local',
    )
  }
  return {
    loginUrl: RETS_SERVER_URL,
    username: RETS_USERNAME,
    password: RETS_PASSWORD,
    version: 'RETS/1.7.2',
    userAgent: 'tmre-website/0.1',
  }
}

function num(v: string | undefined): number | null {
  if (v === undefined || v === null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function str(v: string | undefined): string {
  return (v ?? '').trim()
}

function buildAddress(r: RawRetsRecord): Address {
  const parts = [
    str(r.StreetNumber),
    str(r.StreetDirPrefix),
    str(r.StreetName),
    str(r.StreetType),
    str(r.StreetDirSuffix),
  ].filter(Boolean)
  const street = parts.join(' ')
  const unit = str(r.UnitNumber)
  const city = str(r.City)
  const state = str(r.State)
  const postalCode = str(r.PostalCode)
  const full = [
    [street, unit && `#${unit}`].filter(Boolean).join(' '),
    city,
    [state, postalCode].filter(Boolean).join(' '),
  ]
    .filter(Boolean)
    .join(', ')
  return { street, unit, city, state, postalCode, full }
}

function pickField(r: RawRetsRecord, candidates: string[]): string | null {
  for (const k of candidates) {
    const v = str(r[k])
    if (v) return v
  }
  return null
}

function buildSchools(r: RawRetsRecord): Schools {
  return {
    elementary: pickField(r, [
      'ElementarySchool',
      'ElementarySchoolName',
      'ElementarySchool1',
    ]),
    middle: pickField(r, [
      'MiddleJrHighSchool',
      'MiddleSchool',
      'MiddleSchoolName',
      'IntermediateSchool',
      'JuniorHighSchool',
    ]),
    high: pickField(r, ['HighSchool', 'HighSchoolName', 'SeniorHighSchool']),
    district: pickField(r, ['SchoolDistrict', 'SchoolDistrictName', 'SchoolDistrict1']),
  }
}

/** Re-derive schools from raw RETS fields (handles newly mapped names on cached rows). */
export function refreshListingSchools(listing: Listing): Listing {
  if (!listing.raw || Object.keys(listing.raw).length === 0) return listing
  return { ...listing, schools: buildSchools(listing.raw) }
}

function mapListing(r: RawRetsRecord): Listing {
  const { annualAmount: propertyTax, yearLabel: propertyTaxYear } =
    propertyTaxFromRaw(r)
  return {
    mlsId: str(r.ListingId),
    listingKey: str(r.ListingKey),
    status: str(r.MLSStatus),
    propertyType: str(r.PropertyType),
    style: str(r.Style),
    address: buildAddress(r),
    price: num(r.ListPrice) ?? num(r.CurrentPrice) ?? num(r.Price),
    originalListPrice: num(r.OriginalListPrice),
    beds: num(r.BedsTotal) ?? num(r.BedroomsTotal),
    baths: num(r.BathsTotal) ?? num(r.BathroomsTotalInteger) ?? num(r.BathroomsFull),
    sqft:
      num(r.SqFtTotal) ??
      num(r.LivingAreaSQFTPerPublicRecord) ??
      num(r.SqFtEstHeatedAboveGrade),
    lotAcres: parseLotAcresFromRaw(r),
    yearBuilt: num(r.YearBuilt),
    dom: num(r.DOM),
    listDate: str(r.ListingContractDate) || null,
    modificationTimestamp: str(r.ModificationTimestamp) || null,
    priceChangeTimestamp: str(r.PriceChangeTimestamp) || null,
    statusChangeTimestamp: str(r.StatusChangeTimestamp) || null,
    latitude: num(r.Latitude),
    longitude: num(r.Longitude),
    photoCount: num(r.PhotoCount) ?? num(r.PhotosCount),
    ownerName: pickField(r, [
      'OwnerName',
      'TaxOwnerName',
      'OwnerName1',
      'PublicOwnerName',
      'OwnerOfRecord',
      'TaxAssessorName',
    ]),
    remarks: pickField(r, ['PublicRemarks', 'Remarks', 'MarketingRemarks']),
    propertyTax,
    propertyTaxYear,
    schools: buildSchools(r),
    raw: r,
  }
}

function escapeDmqlValue(v: string): string {
  return v.replace(/[(),|+~]/g, '')
}

const CITY_CODES: Record<string, string> = {
  norwalk: '350',
  westport: '540',
  wilton: '550',
  weston: '530',
  fairfield: '200',
  greenwich: '220',
  stamford: '470',
  'new canaan': '310',
  'new fairfield': '320',
  ridgefield: '390',
}

const STATUS_CODES: Record<string, string> = {
  active: 'A',
  'coming soon': 'CS',
  pending: 'P',
  closed: 'C',
  expired: 'X',
  withdrawn: 'W',
}

const COUNTY_CODES: Record<string, string> = {
  fairfield: 'Fairfield',
}

function resolveCityCode(name: string): string | null {
  const key = name.trim().toLowerCase()
  return CITY_CODES[key] ?? null
}

function resolveStatusCode(name: string): string | null {
  const key = name.trim().toLowerCase()
  return STATUS_CODES[key] ?? null
}

function buildDmql(params: SearchParams): string {
  const clauses: string[] = []
  const statusKey = params.status?.trim().toLowerCase() ?? ''
  const closedWindow = Boolean(params.closedAfter || params.closedBefore)
  if (params.status) {
    const code = resolveStatusCode(params.status)
    // SmartMLS throws NO_RECORDS_FOUND on MLSStatus=|C - use a date window for closed sales.
    if (code && !(statusKey === 'closed' && closedWindow)) {
      clauses.push(`(MLSStatus=|${code})`)
    }
  }
  if (params.city) {
    const code = resolveCityCode(params.city)
    if (code) clauses.push(`(City=|${code})`)
  }
  if (params.county) {
    const key = params.county.trim().toLowerCase()
    const value = COUNTY_CODES[key] ?? params.county
    clauses.push(`(County=${escapeDmqlValue(value)})`)
  }
  if (params.zip) clauses.push(`(PostalCode=${escapeDmqlValue(params.zip)})`)
  if (params.propertyType) {
    clauses.push(`(PropertyType=${escapeDmqlValue(params.propertyType)})`)
  }
  if (params.minPrice != null || params.maxPrice != null) {
    const lo = params.minPrice != null ? Math.floor(params.minPrice) : ''
    const hi = params.maxPrice != null ? Math.floor(params.maxPrice) : ''
    clauses.push(
      lo && hi ? `(ListPrice=${lo}-${hi})` : lo ? `(ListPrice=${lo}+)` : `(ListPrice=0-${hi})`,
    )
  }
  if (params.closedAfter || params.closedBefore) {
    const lo = params.closedAfter ?? '2000-01-01'
    const hi = params.closedBefore ?? new Date().toISOString().slice(0, 10)
    clauses.push(`(StatusChangeTimestamp=${lo}-${hi})`)
  }
  if (params.modifiedAfter) {
    clauses.push(`(ModificationTimestamp=${params.modifiedAfter}+)`)
  }
  if (params.addressContains) {
    const tokens = params.addressContains
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map(escapeDmqlValue)
    if (tokens.length > 0) {
      clauses.push(`(UnparsedAddress=*${tokens.join('*')}*)`)
    }
  }
  if (clauses.length === 0) clauses.push('(ModificationTimestamp=1900-01-01+)')
  return clauses.join(',')
}

export async function withRetsClient<T>(fn: (c: any) => Promise<T>): Promise<T> {
  const settings = requireEnv()
  const rets = loadRetsClient()
  let value: T | undefined
  let error: unknown
  let captured = false
  await (rets as any).getAutoLogoutClient(settings, async (client: unknown) => {
    try {
      value = await fn(client)
      captured = true
    } catch (err) {
      error = err
      captured = true
    }
  })
  if (!captured) throw new Error('RETS client closed without returning a result')
  if (error) throw error
  return value as T
}

async function withClient<T>(fn: (c: any) => Promise<T>): Promise<T> {
  return withRetsClient(fn)
}

export async function searchListings(params: SearchParams = {}): Promise<Listing[]> {
  const limit = Math.min(Math.max(params.limit ?? DEFAULT_LIMIT, 1), 2500)
  const dmql = buildDmql(params)
  const cacheKey = `search:${limit}:${dmql}`
  const cached = getCached<Listing[]>(cacheKey)
  if (cached) return cached

  const records = await withClient(async (client) => {
    try {
      const result = await client.search.query('Property', 'Property', dmql, {
        limit,
        offset: 1,
      })
      return (result?.results ?? []) as RawRetsRecord[]
    } catch (err) {
      if (isRetsNoRecordsError(err)) return []
      throw err
    }
  })

  const listings = records.map(mapListing)
  setCached(cacheKey, listings, SEARCH_TTL_MS)
  return listings
}

function extractFirstUrl(value: unknown, depth = 0): string | null {
  if (value == null || depth > 6) return null
  if (typeof value === 'string') {
    return /^https?:\/\//i.test(value) ? value : null
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = extractFirstUrl(item, depth + 1)
      if (found) return found
    }
    return null
  }
  if (typeof value === 'object') {
    for (const v of Object.values(value as Record<string, unknown>)) {
      const found = extractFirstUrl(v, depth + 1)
      if (found) return found
    }
  }
  return null
}

const PHOTO_TTL_MS = 12 * 60 * 60 * 1000

const PHOTO_TYPES = ['Photo', 'LargePhoto', 'HiRes', 'Thumbnail']

function isRetsNoRecordsError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const code = String((err as { replyCode?: string }).replyCode ?? '')
  const tag = String((err as { replyTag?: string }).replyTag ?? '')
  return code === '20201' || tag === 'NO_RECORDS_FOUND'
}

function isPhotoMedia(record: RawRetsRecord): boolean {
  const category = str(record.MediaCategory).toLowerCase()
  return !category || category === 'photo'
}

function mediaPhotoUrl(
  record: RawRetsRecord,
  size: 'full' | 'mid' | 'thumb' = 'full',
): string | null {
  const full = str(record.MediaURL)
  const mid = str(record.MediaMidsizeURL)
  const thumb = str(record.MediaThumbnailURL)
  if (size === 'thumb') return thumb || mid || full || null
  if (size === 'mid') return mid || full || thumb || null
  return full || mid || thumb || null
}

function sortMediaRecords(records: RawRetsRecord[]): RawRetsRecord[] {
  return [...records].sort((a, b) => {
    const pa = str(a.PreferredPhoto).toUpperCase() === 'Y' ? 0 : 1
    const pb = str(b.PreferredPhoto).toUpperCase() === 'Y' ? 0 : 1
    if (pa !== pb) return pa - pb
    return (num(a.MediaOrder) ?? 999) - (num(b.MediaOrder) ?? 999)
  })
}

async function queryMediaRecords(
  dmql: string,
  limit: number,
): Promise<RawRetsRecord[]> {
  try {
    return await withClient(async (client) => {
      const result = await client.search.query('Media', 'Media', dmql, {
        limit,
        offset: 1,
      })
      return ((result?.results ?? []) as RawRetsRecord[]).filter(isPhotoMedia)
    })
  } catch (err) {
    if (isRetsNoRecordsError(err)) return []
    throw err
  }
}

async function fetchMediaRecordsForListing(
  listingKey: string,
  mlsId?: string | null,
  limit = 250,
): Promise<RawRetsRecord[]> {
  const key = listingKey.trim()
  const id = mlsId?.trim() ?? ''
  if (key) {
    const byKey = await queryMediaRecords(
      `(MediaResourceKey=${escapeDmqlValue(key)})`,
      limit,
    )
    if (byKey.length) return sortMediaRecords(byKey)
  }
  if (id) {
    const byId = await queryMediaRecords(
      `(MediaResourceId=${escapeDmqlValue(id)})`,
      limit,
    )
    if (byId.length) return sortMediaRecords(byId)
  }
  return []
}

export async function fetchPreferredPhotoUrl(
  listingKey: string,
  mlsId?: string,
): Promise<string | null> {
  const key = listingKey.trim()
  const id = mlsId?.trim() ?? ''
  if (!key && !id) return null
  const cacheKey = `photo:preferred:${key}:${id}`
  const cached = getCached<string | null>(cacheKey)
  if (cached !== null) return cached

  const media = await fetchMediaRecordsForListing(key, id, 10)
  const fromMedia = media
    .map((record) => mediaPhotoUrl(record, 'mid'))
    .find((url): url is string => Boolean(url))
  if (fromMedia) {
    setCached(cacheKey, fromMedia, PHOTO_TTL_MS)
    return fromMedia
  }

  const objectKey = key || id
  for (const photoType of PHOTO_TYPES) {
    try {
      const url = await withClient(async (client) => {
        const result = await client.objects.getPreferredObjects(
          'Property',
          photoType,
          objectKey,
          { Location: 1, alwaysGroupObjects: true },
        )
        return extractFirstUrl(result)
      })
      if (url) {
        setCached(cacheKey, url, PHOTO_TTL_MS)
        return url
      }
    } catch {
      // try next type
    }
  }
  setCached(cacheKey, null, 5 * 60 * 1000)
  return null
}

function collectAllUrls(value: unknown, out: string[], depth = 0): void {
  if (value == null || depth > 8) return
  if (typeof value === 'string') {
    if (/^https?:\/\//i.test(value) && !out.includes(value)) out.push(value)
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) collectAllUrls(item, out, depth + 1)
    return
  }
  if (typeof value === 'object') {
    for (const v of Object.values(value as Record<string, unknown>)) {
      collectAllUrls(v, out, depth + 1)
    }
  }
}

export async function fetchAllPhotoUrls(
  listingKey: string,
  /** If provided, proxy URLs like /api/listings/{mlsId}/photos/{index} will be
   *  returned as a fallback when the RETS server doesn't support Location:1. */
  mlsIdForProxy?: string,
  photoCountHint?: number | null,
): Promise<string[]> {
  const id = listingKey.trim()
  const mlsId = mlsIdForProxy?.trim() ?? ''
  if (!id && !mlsId) return []
  const cacheKey = `photo:all:${id}:${mlsId}`
  const cached = getCached<string[]>(cacheKey)
  if (cached && cached.length > 0) return cached

  const photoLimit = Math.min(Math.max(photoCountHint ?? 60, 1), 250)
  const media = await fetchMediaRecordsForListing(id, mlsId, photoLimit)
  const mediaUrls = media
    .map((record) => mediaPhotoUrl(record, 'full'))
    .filter((url): url is string => Boolean(url))
  if (mediaUrls.length > 0) {
    setCached(cacheKey, mediaUrls, PHOTO_TTL_MS)
    return mediaUrls
  }

  const objectKey = id || mlsId
  for (const photoType of PHOTO_TYPES) {
    try {
      const urls = await withClient(async (client) => {
        const result = await client.objects.getAllObjects(
          'Property',
          photoType,
          objectKey,
          { Location: 1, alwaysGroupObjects: true },
        )
        const acc: string[] = []
        collectAllUrls(result, acc)
        return acc
      })
      if (urls.length > 0) {
        setCached(cacheKey, urls, PHOTO_TTL_MS)
        return urls
      }
    } catch {
      // try next type
    }
  }

  // Location:1 returned no URLs - check how many photos exist via binary fetch
  // and return proxy URLs that the browser can call to stream the image.
  if (mlsId) {
    for (const photoType of PHOTO_TYPES) {
      try {
        const count = await withClient(async (client) => {
          const all = await client.objects.getAllObjects(
            'Property',
            photoType,
            objectKey,
            { Location: 0, alwaysGroupObjects: true },
          )
          const items: unknown[] = Array.isArray(all)
            ? all
            : Array.isArray((all as any)?.objects)
            ? (all as any).objects
            : []
          return items.filter((it) => {
            const buf = (it as any)?.dataBuffer ?? (it as any)?.data
            return Buffer.isBuffer(buf) && buf.length > 100
          }).length
        })
        if (count > 0) {
          const proxyUrls = Array.from({ length: count }, (_, i) =>
            `/api/listings/${encodeURIComponent(mlsId)}/photos/${i}`,
          )
          setCached(cacheKey, proxyUrls, PHOTO_TTL_MS)
          return proxyUrls
        }
      } catch {
        // try next type
      }
    }
  }

  const preferred = await fetchPreferredPhotoUrl(id, mlsId)
  if (preferred) {
    const single = [preferred]
    setCached(cacheKey, single, PHOTO_TTL_MS)
    return single
  }

  setCached(cacheKey, [], 5 * 60 * 1000)
  return []
}

/** Photo count for a listing - prefers MLS hint, then media, then RETS binary inventory. */
export async function discoverListingPhotoCount(
  listingKey: string,
  mlsId?: string | null,
  photoCountHint?: number | null,
): Promise<number> {
  const hint = photoCountHint ?? 0
  if (hint > 0) return Math.min(hint, 250)

  const id = listingKey.trim()
  const mid = mlsId?.trim() ?? ''
  const media = await fetchMediaRecordsForListing(id, mid, 250)
  if (media.length > 0) return media.length

  const objectKey = id || mid
  if (!objectKey) return 0

  for (const photoType of PHOTO_TYPES) {
    try {
      const count = await withClient(async (client) => {
        const all = await client.objects.getAllObjects(
          'Property',
          photoType,
          objectKey,
          { Location: 0, alwaysGroupObjects: true },
        )
        const items: unknown[] = Array.isArray(all)
          ? all
          : Array.isArray((all as { objects?: unknown[] })?.objects)
            ? (all as { objects: unknown[] }).objects
            : []
        return items.filter((it) => {
          const buf = (it as { dataBuffer?: Buffer; data?: Buffer })?.dataBuffer
            ?? (it as { data?: Buffer })?.data
          return Buffer.isBuffer(buf) && buf.length > 100
        }).length
      })
      if (count > 0) return count
    } catch {
      // try next type
    }
  }

  const preferred = await fetchPreferredPhotoUrl(id, mid)
  return preferred ? 1 : 0
}

/** Media CDN URL for one photo index (full, mid, or thumb). */
export async function fetchMediaPhotoUrlForIndex(
  listingKey: string,
  mlsId: string | null | undefined,
  index: number,
  size: 'full' | 'mid' | 'thumb' = 'full',
): Promise<string | null> {
  if (index < 0) return null
  const limit = Math.min(Math.max(index + 1, 12), 250)
  const media = await fetchMediaRecordsForListing(listingKey.trim(), mlsId, limit)
  if (media.length === 0) return null
  const record = sortMediaRecords(media)[index]
  return record ? mediaPhotoUrl(record, size) : null
}

/** Up to maxPhotos JPEG buffers - SQLite first, then media/RETS with persist. */
export async function fetchPhotoBuffers(
  listingKey: string,
  mlsId: string,
  maxPhotos = 5,
  photoCountHint?: number | null,
): Promise<Buffer[]> {
  const key = listingKey.trim()
  const id = mlsId.trim()
  if (!key && !id) return []

  const { readCachedListingPhotoBuffers, resolveListingPhotoBuffer } = await import(
    '@/lib/listing-photo-store'
  )
  const cacheId = key || id
  const cached = readCachedListingPhotoBuffers(cacheId, maxPhotos)
  if (cached.length >= maxPhotos) return cached.slice(0, maxPhotos)

  const buffers = [...cached]
  const startIndex = buffers.length
  const target = Math.min(maxPhotos, photoCountHint ?? maxPhotos, 60)

  for (let i = startIndex; i < target; i++) {
    if (buffers.length >= maxPhotos) break
    const resolved = await resolveListingPhotoBuffer({
      mlsId: cacheId,
      listingKey: key || id,
      photoIndex: i,
      photoCountHint,
    })
    if (resolved) buffers.push(resolved.data)
  }

  return buffers.slice(0, maxPhotos)
}

export async function getListingByMlsId(id: string): Promise<Listing | null> {
  const trimmed = id.trim()
  if (!trimmed) return null
  const cacheKey = `mls:${trimmed}`
  const cached = getCached<Listing | null>(cacheKey)
  if (cached !== null) return cached

  const listing =
    (await searchListingByField('ListingId', trimmed)) ??
    (await searchListingByField('ListingKey', trimmed))

  setCached(cacheKey, listing, SEARCH_TTL_MS)
  return listing
}

async function searchListingByField(
  field: 'ListingKey' | 'ListingId',
  value: string,
): Promise<Listing | null> {
  const trimmed = value.trim()
  if (!trimmed) return null

  const records = await withClient(async (client) => {
    try {
      const result = await client.search.query(
        'Property',
        'Property',
        `(${field}=${escapeDmqlValue(trimmed)})`,
        { limit: 1, offset: 1 },
      )
      return (result?.results ?? []) as RawRetsRecord[]
    } catch (err) {
      if (isRetsNoRecordsError(err)) return []
      throw err
    }
  })

  return records[0] ? mapListing(records[0]) : null
}

function median(nums: number[]): number | null {
  if (nums.length === 0) return null
  const sorted = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

function mean(nums: number[]): number | null {
  if (nums.length === 0) return null
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

import { TMRE_TOWNS, type TmreTown } from './tmre-towns'

/** @deprecated Prefer `TMRE_TOWNS` from `./tmre-towns`. */
export const TMRE_MARKET_TOWNS = TMRE_TOWNS

/** @deprecated Prefer `TmreTown` from `./tmre-towns`. */
export type TmreMarketTown = TmreTown

/** Fetch active listings across multiple towns, deduped by MLS id. */
export async function searchListingsAcrossTowns(
  towns: readonly string[],
  params: Omit<SearchParams, 'city' | 'county'> = {},
): Promise<Listing[]> {
  const perTownLimit = params.limit ?? 500
  const batches = await Promise.all(
    towns.map((city) =>
      searchListings({ ...params, city, limit: perTownLimit }).catch(() => [] as Listing[]),
    ),
  )
  const seen = new Set<string>()
  const merged: Listing[] = []
  for (const batch of batches) {
    for (const l of batch) {
      const key = l.mlsId || l.listingKey
      if (!key || seen.has(key)) continue
      seen.add(key)
      merged.push(l)
    }
  }
  return merged
}

export async function getMarketStats(city: string): Promise<MarketStats> {
  const cacheKey = `stats:${city.toLowerCase()}`
  const cached = getCached<MarketStats>(cacheKey)
  if (cached) return cached

  const listings = await searchListings({
    city,
    status: 'Active',
    limit: 500,
  })

  const prices = listings.map((l) => l.price).filter((p): p is number => p != null && p > 0)
  const doms = listings.map((l) => l.dom).filter((d): d is number => d != null && d >= 0)
  const ppsf = listings
    .map((l) => (l.price && l.sqft && l.sqft > 0 ? l.price / l.sqft : null))
    .filter((v): v is number => v != null && Number.isFinite(v) && v > 0)
  const beds = listings
    .map((l) => l.beds)
    .filter((b): b is number => b != null && b > 0)

  const stats: MarketStats = {
    city,
    activeCount: listings.length,
    medianPrice: median(prices),
    avgDaysOnMarket: mean(doms),
    avgPricePerSqft: mean(ppsf),
    avgBeds: mean(beds),
    sampleSize: listings.length,
  }
  setCached(cacheKey, stats, STATS_TTL_MS)
  return stats
}
