import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { isAdminAuthorizedRequest } from '@/lib/admin-auth'
import { recordContentView } from '@/lib/db/content-views-repo'
import { extractClientIp } from '@/lib/ipapi-geo'
import {
  ipapiLookupToVisitorGeo,
  resolveVisitorIpGeo,
} from '@/lib/visitor-ip-geo'
import {
  attachVisitorVisitFields,
  normalizeVisitorZip,
  readVisitorByVid,
  recordVisitorPageview,
} from '@/lib/visitors'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const VID_COOKIE = 'tmre_vid'
const VID_MAX_AGE = 60 * 60 * 24 * 365

export async function POST(req: NextRequest) {
  let body: { path?: unknown; zip?: unknown } = {}
  try {
    body = (await req.json()) as { path?: unknown; zip?: unknown }
  } catch {
    // empty body is fine
  }
  const pagePath =
    typeof body.path === 'string' && body.path.startsWith('/')
      ? body.path.slice(0, 200)
      : null
  const zip = normalizeVisitorZip(body.zip)
  const isAdmin = isAdminAuthorizedRequest(req)

  const existingVid = req.cookies.get(VID_COOKIE)?.value
  const vid = existingVid && /^[a-f0-9-]{36}$/i.test(existingVid) ? existingVid : randomUUID()
  const ip = extractClientIp(req.headers)
  const now = new Date().toISOString()

  try {
    if (!pagePath) {
      await attachVisitorVisitFields(vid, { zip, isAdmin })
    } else {
      const preexisting = await readVisitorByVid(vid)
      const lookup = preexisting ? null : await resolveVisitorIpGeo(ip)
      const geo = lookup ? ipapiLookupToVisitorGeo(lookup) : undefined
      const zipOrPostal = zip ?? normalizeVisitorZip(lookup?.postal)

      await recordVisitorPageview({
        vid,
        path: pagePath,
        at: now,
        ip,
        geo,
        zip: zipOrPostal,
        isAdmin,
      })

      try {
        await recordContentView({ vid, path: pagePath, at: now })
      } catch (err) {
        console.warn('[visitor/log] content view count failed', err)
      }
    }
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
