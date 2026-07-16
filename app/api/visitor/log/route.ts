import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import {
  emptyVisitorGeo,
  readVisitorsMap,
  updateVisitors,
  type VisitorGeo,
} from '@/lib/visitors'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const VID_COOKIE = 'tmre_vid'
const VID_MAX_AGE = 60 * 60 * 24 * 365

function extractIp(req: NextRequest): string | null {
  const fwd = req.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  const real = req.headers.get('x-real-ip')
  if (real) return real.trim()
  return null
}

async function geolocate(ip: string | null): Promise<VisitorGeo> {
  const empty: VisitorGeo = emptyVisitorGeo()
  if (!ip || ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.')) {
    return empty
  }
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 3500)
    const res = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, {
      signal: controller.signal,
      headers: { 'user-agent': 'tmre-website/0.1' },
    })
    clearTimeout(timer)
    if (!res.ok) return empty
    const body = (await res.json()) as Record<string, unknown>
    return {
      city: typeof body.city === 'string' ? body.city : null,
      region: typeof body.region === 'string' ? body.region : null,
      postal: typeof body.postal === 'string' ? body.postal : null,
      country: typeof body.country_name === 'string' ? body.country_name : null,
      org: typeof body.org === 'string' ? body.org : null,
    }
  } catch (err) {
    console.warn('[visitor/log] geolocate failed', err)
    return empty
  }
}

export async function POST(req: NextRequest) {
  let body: { path?: unknown } = {}
  try {
    body = (await req.json()) as { path?: unknown }
  } catch {
    // empty body is fine
  }
  const pagePath =
    typeof body.path === 'string' && body.path.startsWith('/') ? body.path.slice(0, 200) : '/'

  const existingVid = req.cookies.get(VID_COOKIE)?.value
  const vid = existingVid && /^[a-f0-9-]{36}$/i.test(existingVid) ? existingVid : randomUUID()
  const ip = extractIp(req)
  const now = new Date().toISOString()

  try {
    // Geolocation is a slow network call — do it outside the write lock so it
    // can't stall other pageviews. A pre-read (unsynchronized) decides whether
    // this vid is likely new and therefore needs geo lookup.
    const preexisting = (await readVisitorsMap())[vid]
    const geo = preexisting ? null : await geolocate(ip)

    await updateVisitors((visitors) => {
      const existing = visitors[vid]
      if (existing) {
        existing.lastSeen = now
        existing.pageviews += 1
        existing.pages.push({ path: pagePath, at: now })
        if (existing.pages.length > 50) existing.pages = existing.pages.slice(-50)
        if (ip && !existing.ip) existing.ip = ip
      } else {
        visitors[vid] = {
          vid,
          firstSeen: now,
          lastSeen: now,
          pageviews: 1,
          ip,
          geo: geo ?? emptyVisitorGeo(),
          pages: [{ path: pagePath, at: now }],
          email: null,
          zip: null,
          name: null,
          audienceType: null,
          leadId: null,
        }
      }
    })
  } catch (err) {
    console.error('[visitor/log] write failed', err)
  }

  const res = NextResponse.json({ vid })
  if (!existingVid) {
    res.cookies.set(VID_COOKIE, vid, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: VID_MAX_AGE,
      path: '/',
    })
  }
  return res
}
