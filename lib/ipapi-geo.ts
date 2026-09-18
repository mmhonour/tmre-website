/**
 * Free ipapi.co lookup — no API key, ~1000 calls / 24h.
 * https://ipapi.co/api/
 *
 * Shared so /api/visitor-town and /api/visitor/log do not each burn a credit
 * for the same IP. Memory cache is per isolate; callers should also reuse
 * visitors.geo for IPs we have already seen.
 */

export type IpapiLookup = {
  city: string | null
  region: string | null
  postal: string | null
  country: string | null
  org: string | null
  latitude: number | null
  longitude: number | null
}

export const IPAPI_FREE_DAILY_CAP = 1000
const MEMORY_TTL_MS = 24 * 60 * 60 * 1000
const RATE_LIMIT_TTL_MS = 10 * 60 * 1000

export function emptyIpapiLookup(): IpapiLookup {
  return {
    city: null,
    region: null,
    postal: null,
    country: null,
    org: null,
    latitude: null,
    longitude: null,
  }
}

export function isPrivateOrLocalIp(ip: string | null | undefined): boolean {
  if (!ip) return true
  const v = ip.trim().toLowerCase()
  if (!v) return true
  if (v === '127.0.0.1' || v === '::1' || v === '0:0:0:0:0:0:0:1') return true
  if (v.startsWith('192.168.') || v.startsWith('10.')) return true
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(v)) return true
  if (v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80:')) return true
  return false
}

export function extractClientIp(headers: Headers): string | null {
  const fwd = headers.get('x-forwarded-for')
  if (fwd) {
    const first = fwd.split(',')[0]?.trim()
    if (first) return first
  }
  const real = headers.get('x-real-ip')?.trim()
  return real || null
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function asCoord(value: unknown): number | null {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

/** Parse ipapi.co JSON. Rate-limit / error payloads become empty. */
export function parseIpapiBody(body: Record<string, unknown>): IpapiLookup {
  if (body.error === true) return emptyIpapiLookup()
  const postalRaw = asString(body.postal)
  const postal =
    postalRaw && /^\d{5}/.test(postalRaw) ? postalRaw.slice(0, 5) : postalRaw
  return {
    city: asString(body.city),
    region: asString(body.region),
    postal,
    country: asString(body.country_name),
    org: asString(body.org),
    latitude: asCoord(body.latitude),
    longitude: asCoord(body.longitude),
  }
}

type MemoryHit = { at: number; value: IpapiLookup; ttl: number }

const memory = new Map<string, MemoryHit>()
const inflight = new Map<string, Promise<IpapiLookup>>()

export function rememberIpapiLookup(ip: string, value: IpapiLookup): void {
  memory.set(ip, { at: Date.now(), value, ttl: MEMORY_TTL_MS })
}

export function peekIpapiLookup(ip: string): IpapiLookup | null {
  const hit = memory.get(ip)
  if (!hit) return null
  if (Date.now() - hit.at > hit.ttl) {
    memory.delete(ip)
    return null
  }
  return hit.value
}

async function fetchIpapi(ip: string): Promise<IpapiLookup> {
  const empty = emptyIpapiLookup()
  try {
    const res = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, {
      headers: { 'user-agent': 'tmre-website/0.1' },
      signal: AbortSignal.timeout(3500),
    })
    if (res.status === 429) {
      memory.set(ip, { at: Date.now(), value: empty, ttl: RATE_LIMIT_TTL_MS })
      console.warn('[ipapi] free daily cap reached (429)')
      return empty
    }
    if (!res.ok) return empty
    const body = (await res.json()) as Record<string, unknown>
    const value = parseIpapiBody(body)
    const ttl =
      body.error === true && body.reason === 'RateLimited'
        ? RATE_LIMIT_TTL_MS
        : MEMORY_TTL_MS
    memory.set(ip, { at: Date.now(), value, ttl })
    return value
  } catch (err) {
    console.warn('[ipapi] lookup failed', err)
    return empty
  }
}

/** One free ipapi.co lookup per IP per isolate-day. Coalesces in-flight calls. */
export async function lookupIpapi(ip: string | null | undefined): Promise<IpapiLookup> {
  if (!ip || isPrivateOrLocalIp(ip)) return emptyIpapiLookup()
  const cached = peekIpapiLookup(ip)
  if (cached) return cached
  const pending = inflight.get(ip)
  if (pending) return pending
  const job = fetchIpapi(ip).finally(() => inflight.delete(ip))
  inflight.set(ip, job)
  return job
}
