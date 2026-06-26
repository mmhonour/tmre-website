import * as rets from 'rets-client'

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
}

export type MarketStats = {
  city: string
  activeCount: number
  medianPrice: number | null
  avgDaysOnMarket: number | null
  avgPricePerSqft: number | null
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
      'RETS env vars missing — set RETS_SERVER_URL, RETS_USERNAME, RETS_PASSWORD in .env.local',
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
      'MiddleSchool',
      'MiddleSchoolName',
      'IntermediateSchool',
      'JuniorHighSchool',
    ]),
    high: pickField(r, ['HighSchool', 'HighSchoolName', 'SeniorHighSchool']),
    district: pickField(r, ['SchoolDistrict', 'SchoolDistrictName', 'SchoolDistrict1']),
  }
}

function mapListing(r: RawRetsRecord): Listing {
  return {
    mlsId: str(r.ListingId),
    listingKey: str(r.ListingKey),
    status: str(r.MLSStatus),
    propertyType: str(r.PropertyType),
    style: str(r.Style),
    address: buildAddress(r),
    price: num(r.ListPrice) ?? num(r.CurrentPrice) ?? num(r.Price),
    originalListPrice: num(r.OriginalListPrice),
    beds: num(r.BedsTotal),
    baths: num(r.BathsTotal),
    sqft:
      num(r.SqFtTotal) ??
      num(r.LivingAreaSQFTPerPublicRecord) ??
      num(r.SqFtEstHeatedAboveGrade),
    yearBuilt: num(r.YearBuilt),
    dom: num(r.DOM),
    listDate: str(r.ListingContractDate) || null,
    modificationTimestamp: str(r.ModificationTimestamp) || null,
    priceChangeTimestamp: str(r.PriceChangeTimestamp) || null,
    statusChangeTimestamp: str(r.StatusChangeTimestamp) || null,
    latitude: num(r.Latitude),
    longitude: num(r.Longitude),
    photoCount: num(r.PhotoCount),
    ownerName: pickField(r, [
      'OwnerName',
      'TaxOwnerName',
      'OwnerName1',
      'PublicOwnerName',
      'OwnerOfRecord',
      'TaxAssessorName',
    ]),
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
  wilton: '530',
  fairfield: '200',
  greenwich: '220',
  stamford: '470',
  'new fairfield': '320',
}

const STATUS_CODES: Record<string, string> = {
  active: 'A',
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
  if (params.status) {
    const code = resolveStatusCode(params.status)
    if (code) clauses.push(`(MLSStatus=|${code})`)
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
  if (clauses.length === 0) clauses.push('(ModificationTimestamp=1900-01-01+)')
  return clauses.join(',')
}

async function withClient<T>(fn: (c: any) => Promise<T>): Promise<T> {
  const settings = requireEnv()
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

export async function searchListings(params: SearchParams = {}): Promise<Listing[]> {
  const limit = Math.min(Math.max(params.limit ?? DEFAULT_LIMIT, 1), 2500)
  const dmql = buildDmql(params)
  const cacheKey = `search:${limit}:${dmql}`
  const cached = getCached<Listing[]>(cacheKey)
  if (cached) return cached

  const records = await withClient(async (client) => {
    const result = await client.search.query('Property', 'Property', dmql, {
      limit,
      offset: 1,
    })
    return (result?.results ?? []) as RawRetsRecord[]
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

export async function fetchPreferredPhotoUrl(
  mlsId: string,
): Promise<string | null> {
  const id = mlsId.trim()
  if (!id) return null
  const cacheKey = `photo:preferred:${id}`
  const cached = getCached<string | null>(cacheKey)
  if (cached !== null) return cached

  try {
    const url = await withClient(async (client) => {
      const result = await client.objects.getPreferredObjects(
        'Property',
        'Photo',
        id,
        { Location: 1, alwaysGroupObjects: true },
      )
      return extractFirstUrl(result)
    })
    setCached(cacheKey, url, PHOTO_TTL_MS)
    return url
  } catch (err) {
    console.error('[rets.fetchPreferredPhotoUrl] failed', err)
    setCached(cacheKey, null, 5 * 60 * 1000)
    return null
  }
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

export async function fetchAllPhotoUrls(mlsId: string): Promise<string[]> {
  const id = mlsId.trim()
  if (!id) return []
  const cacheKey = `photo:all:${id}`
  const cached = getCached<string[]>(cacheKey)
  if (cached) return cached

  try {
    const urls = await withClient(async (client) => {
      const result = await client.objects.getAllObjects(
        'Property',
        'Photo',
        id,
        { Location: 1, alwaysGroupObjects: true },
      )
      const acc: string[] = []
      collectAllUrls(result, acc)
      return acc
    })
    setCached(cacheKey, urls, PHOTO_TTL_MS)
    return urls
  } catch (err) {
    console.error('[rets.fetchAllPhotoUrls] failed', err)
    setCached(cacheKey, [], 5 * 60 * 1000)
    return []
  }
}

export async function getListingByMlsId(mlsId: string): Promise<Listing | null> {
  const trimmed = mlsId.trim()
  if (!trimmed) return null
  const cacheKey = `mls:${trimmed}`
  const cached = getCached<Listing | null>(cacheKey)
  if (cached !== null) return cached

  const records = await withClient(async (client) => {
    const result = await client.search.query(
      'Property',
      'Property',
      `(ListingId=${escapeDmqlValue(trimmed)})`,
      { limit: 1, offset: 1 },
    )
    return (result?.results ?? []) as RawRetsRecord[]
  })

  const listing = records[0] ? mapListing(records[0]) : null
  setCached(cacheKey, listing, SEARCH_TTL_MS)
  return listing
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

  const stats: MarketStats = {
    city,
    activeCount: listings.length,
    medianPrice: median(prices),
    avgDaysOnMarket: mean(doms),
    avgPricePerSqft: mean(ppsf),
    sampleSize: listings.length,
  }
  setCached(cacheKey, stats, STATS_TTL_MS)
  return stats
}
