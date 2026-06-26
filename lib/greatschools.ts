import { promises as fs } from 'node:fs'
import nodePath from 'node:path'
import type { Listing } from './rets'

// GreatSchools Partner API (Pro Search / Data API).
// Auth: x-api-key header. State must be uppercase two-letter (e.g. CT).
// The exact endpoint path can vary by partner contract — override if needed.
const DEFAULT_BASE = 'https://gs-api.greatschools.org'
const DEFAULT_NEARBY_PATH = '/nearby-schools'
const DEFAULT_RADIUS_MILES = 5
const DEFAULT_LIMIT = 25
const REQUEST_TIMEOUT_MS = 8_000
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000
const MAX_CONCURRENT = 6
const GRID_PRECISION = 2 // ~1.1km grid → heavy reuse across listings on the same block

const CACHE_FILE = nodePath.join(process.cwd(), 'data', 'school-cache.json')

export type GreatSchoolsRatings = {
  elementary: number | null
  middle: number | null
  high: number | null
}

type CacheEntry = {
  fetchedAt: number
  ratings: GreatSchoolsRatings | null
}

type RawSchool = {
  level?: string | string[]
  levelCode?: string | string[]
  'level-codes'?: string
  gsRating?: number | string | null
  rating?: number | string | null
  overallRating?: number | string | null
  distance?: number | null
  name?: string
}

let memoryCache: Map<string, CacheEntry> | null = null
let diskLoaded = false

function gridKey(lat: number, lng: number): string {
  return `${lat.toFixed(GRID_PRECISION)},${lng.toFixed(GRID_PRECISION)}`
}

async function loadDiskCache(): Promise<void> {
  if (diskLoaded) return
  diskLoaded = true
  memoryCache = new Map()
  try {
    const raw = await fs.readFile(CACHE_FILE, 'utf8')
    const parsed = JSON.parse(raw) as Record<string, CacheEntry>
    for (const [k, v] of Object.entries(parsed)) {
      if (v && typeof v.fetchedAt === 'number') memoryCache.set(k, v)
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn('[greatschools] cache read failed', err)
    }
  }
}

let writeQueued = false
async function persistDiskCache(): Promise<void> {
  if (writeQueued) return
  writeQueued = true
  setTimeout(async () => {
    writeQueued = false
    if (!memoryCache) return
    try {
      const obj: Record<string, CacheEntry> = {}
      for (const [k, v] of memoryCache) obj[k] = v
      await fs.mkdir(nodePath.dirname(CACHE_FILE), { recursive: true })
      await fs.writeFile(CACHE_FILE, JSON.stringify(obj), 'utf8')
    } catch (err) {
      console.warn('[greatschools] cache write failed', err)
    }
  }, 1500).unref()
}

function classifyLevel(school: RawSchool): 'elementary' | 'middle' | 'high' | null {
  const fields = [school.level, school.levelCode, school['level-codes']]
    .flatMap((v) => (Array.isArray(v) ? v : v ? [v] : []))
    .map((v) => String(v).toLowerCase())
  const blob = fields.join(' ')
  if (/(^|[\s,])h(igh)?($|[\s,])/.test(blob) || blob.includes('high')) return 'high'
  if (
    /(^|[\s,])m($|[\s,])/.test(blob) ||
    blob.includes('middle') ||
    blob.includes('junior')
  )
    return 'middle'
  if (
    /(^|[\s,])e($|[\s,])/.test(blob) ||
    blob.includes('elementary') ||
    blob.includes('primary')
  )
    return 'elementary'
  return null
}

function gsRatingFor(school: RawSchool): number | null {
  for (const key of ['gsRating', 'rating', 'overallRating'] as const) {
    const v = school[key]
    if (v == null) continue
    const n = typeof v === 'number' ? v : Number(v)
    if (Number.isFinite(n) && n >= 1 && n <= 10) return n
  }
  return null
}

async function fetchNearby(
  lat: number,
  lng: number,
  apiKey: string,
): Promise<GreatSchoolsRatings | null> {
  const base = process.env.GREATSCHOOLS_API_BASE ?? DEFAULT_BASE
  const path = process.env.GREATSCHOOLS_NEARBY_PATH ?? DEFAULT_NEARBY_PATH
  const url = new URL(path, base)
  url.searchParams.set('lat', String(lat))
  url.searchParams.set('lon', String(lng))
  url.searchParams.set('distance', String(DEFAULT_RADIUS_MILES))
  url.searchParams.set('limit', String(DEFAULT_LIMIT))
  url.searchParams.set('state', 'CT')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      headers: {
        'x-api-key': apiKey,
        accept: 'application/json',
      },
      signal: controller.signal,
    })
    if (!res.ok) {
      console.warn(
        `[greatschools] ${url.pathname} returned HTTP ${res.status} — check GREATSCHOOLS_API_KEY / endpoint`,
      )
      return null
    }
    const body = (await res.json()) as unknown
    const schools = extractSchoolsArray(body)
    if (schools.length === 0) return null

    const closestByLevel: Record<'elementary' | 'middle' | 'high', RawSchool | null> = {
      elementary: null,
      middle: null,
      high: null,
    }
    for (const s of schools) {
      const level = classifyLevel(s)
      if (!level) continue
      const current = closestByLevel[level]
      if (!current) {
        closestByLevel[level] = s
        continue
      }
      const cd = Number(current.distance ?? Infinity)
      const sd = Number(s.distance ?? Infinity)
      if (sd < cd) closestByLevel[level] = s
    }
    return {
      elementary: gsRatingFor(closestByLevel.elementary ?? {}),
      middle: gsRatingFor(closestByLevel.middle ?? {}),
      high: gsRatingFor(closestByLevel.high ?? {}),
    }
  } catch (err) {
    console.warn('[greatschools] fetch failed', err)
    return null
  } finally {
    clearTimeout(timer)
  }
}

function extractSchoolsArray(body: unknown): RawSchool[] {
  if (Array.isArray(body)) return body as RawSchool[]
  if (body && typeof body === 'object') {
    const obj = body as Record<string, unknown>
    for (const key of ['schools', 'results', 'data', 'items']) {
      const v = obj[key]
      if (Array.isArray(v)) return v as RawSchool[]
    }
  }
  return []
}

async function lookupRatings(
  lat: number,
  lng: number,
  apiKey: string,
): Promise<GreatSchoolsRatings | null> {
  await loadDiskCache()
  const cache = memoryCache!
  const key = gridKey(lat, lng)
  const hit = cache.get(key)
  if (hit && Date.now() - hit.fetchedAt < CACHE_TTL_MS) return hit.ratings

  const ratings = await fetchNearby(lat, lng, apiKey)
  cache.set(key, { fetchedAt: Date.now(), ratings })
  void persistDiskCache()
  return ratings
}

async function pool<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let cursor = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = cursor++
      if (i >= items.length) return
      results[i] = await worker(items[i])
    }
  })
  await Promise.all(runners)
  return results
}

/**
 * Convert per-level GS ratings (1–10) into a single 0–100 composite for scoring.
 * Weighted: elementary 0.45, middle 0.25, high 0.30.
 */
export function compositeFromGsRatings(r: GreatSchoolsRatings): number | null {
  const e = r.elementary
  const m = r.middle
  const h = r.high
  const weights: [number | null, number][] = [
    [e, 0.45],
    [m, 0.25],
    [h, 0.3],
  ]
  const present = weights.filter(([v]) => v != null) as [number, number][]
  if (present.length === 0) return null
  const wsum = present.reduce((a, [, w]) => a + w, 0)
  const score = present.reduce((a, [v, w]) => a + v * w, 0) / wsum
  return Math.round(score * 10 * 10) / 10
}

/**
 * Resolve a 0–100 GreatSchools composite for every listing that has coordinates.
 * Returns a Map keyed by listing.mlsId. Calls without API key resolve to an empty map.
 */
export async function resolveSchoolRatings(
  listings: Listing[],
): Promise<Map<string, number>> {
  const apiKey = process.env.GREATSCHOOLS_API_KEY
  const out = new Map<string, number>()
  if (!apiKey) {
    console.warn('[greatschools] GREATSCHOOLS_API_KEY not set — skipping live lookups')
    return out
  }
  const located = listings.filter(
    (l): l is Listing & { latitude: number; longitude: number } =>
      typeof l.latitude === 'number' && typeof l.longitude === 'number',
  )
  if (located.length === 0) return out

  // Group by grid cell first — many listings on the same block share one API call.
  const groups = new Map<string, Listing[]>()
  for (const l of located) {
    const key = gridKey(l.latitude as number, l.longitude as number)
    const arr = groups.get(key) ?? []
    arr.push(l)
    groups.set(key, arr)
  }
  const entries = [...groups.entries()]

  await pool(entries, MAX_CONCURRENT, async ([, ls]) => {
    const first = ls[0]
    const ratings = await lookupRatings(first.latitude!, first.longitude!, apiKey)
    if (!ratings) return
    const composite = compositeFromGsRatings(ratings)
    if (composite == null) return
    for (const l of ls) out.set(l.mlsId, composite)
  })

  return out
}
