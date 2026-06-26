import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DATA_DIR = path.join(process.cwd(), 'data')
const VISITORS_FILE = path.join(DATA_DIR, 'visitors.json')
const VID_COOKIE = 'tmre_vid'
const VID_MAX_AGE = 60 * 60 * 24 * 365

type GeoInfo = {
  city: string | null
  region: string | null
  postal: string | null
  country: string | null
  org: string | null
}

export type VisitorRecord = {
  vid: string
  firstSeen: string
  lastSeen: string
  pageviews: number
  ip: string | null
  geo: GeoInfo
  pages: { path: string; at: string }[]
  email?: string | null
  zip?: string | null
  name?: string | null
  audienceType?: string | null
  leadId?: string | null
}

function extractIp(req: NextRequest): string | null {
  const fwd = req.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  const real = req.headers.get('x-real-ip')
  if (real) return real.trim()
  return null
}

async function geolocate(ip: string | null): Promise<GeoInfo> {
  const empty: GeoInfo = { city: null, region: null, postal: null, country: null, org: null }
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

async function readVisitors(): Promise<Record<string, VisitorRecord>> {
  try {
    const raw = await fs.readFile(VISITORS_FILE, 'utf8')
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, VisitorRecord>) : {}
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return {}
    throw err
  }
}

async function writeVisitors(visitors: Record<string, VisitorRecord>): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true })
  await fs.writeFile(VISITORS_FILE, JSON.stringify(visitors, null, 2), 'utf8')
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
    const visitors = await readVisitors()
    const existing = visitors[vid]
    if (existing) {
      existing.lastSeen = now
      existing.pageviews += 1
      existing.pages.push({ path: pagePath, at: now })
      if (existing.pages.length > 50) existing.pages = existing.pages.slice(-50)
      if (ip && !existing.ip) existing.ip = ip
    } else {
      const geo = await geolocate(ip)
      visitors[vid] = {
        vid,
        firstSeen: now,
        lastSeen: now,
        pageviews: 1,
        ip,
        geo,
        pages: [{ path: pagePath, at: now }],
        email: null,
        zip: null,
        name: null,
        audienceType: null,
        leadId: null,
      }
    }
    await writeVisitors(visitors)
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
