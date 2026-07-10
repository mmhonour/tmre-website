import 'server-only'

import { promises as fs } from 'node:fs'
import path from 'node:path'

const DATA_DIR = path.join(process.cwd(), 'data')
export const VISITORS_FILE = path.join(DATA_DIR, 'visitors.json')

export type VisitorGeo = {
  city: string | null
  region: string | null
  postal: string | null
  country: string | null
  org: string | null
}

export type VisitorPageHit = {
  path: string
  at: string
}

export type VisitorRecord = {
  vid: string
  firstSeen: string
  lastSeen: string
  pageviews: number
  ip: string | null
  geo: VisitorGeo
  pages: VisitorPageHit[]
  email?: string | null
  zip?: string | null
  name?: string | null
  audienceType?: string | null
  leadId?: string | null
}

export async function readVisitorRecords(): Promise<VisitorRecord[]> {
  try {
    const raw = await fs.readFile(VISITORS_FILE, 'utf8')
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (!parsed || typeof parsed !== 'object') return []
    return Object.values(parsed)
      .filter((row): row is VisitorRecord => {
        if (!row || typeof row !== 'object') return false
        const v = row as Partial<VisitorRecord>
        return typeof v.vid === 'string'
      })
      .sort((a, b) => Date.parse(b.lastSeen) - Date.parse(a.lastSeen))
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw err
  }
}

export function formatVisitorLocation(visitor: VisitorRecord): string {
  const { geo, zip } = visitor
  const parts = [geo.city, geo.region, geo.postal || zip].filter(Boolean)
  if (parts.length > 0) return parts.join(', ')
  if (geo.country) return geo.country
  return 'Unknown location'
}

export function formatVisitorIdentity(visitor: VisitorRecord): string {
  if (visitor.name && visitor.email) return `${visitor.name} · ${visitor.email}`
  if (visitor.email) return visitor.email
  if (visitor.name) return visitor.name
  return 'Anonymous'
}
