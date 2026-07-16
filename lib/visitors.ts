import 'server-only'

import { promises as fs } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

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

export function emptyVisitorGeo(): VisitorGeo {
  return { city: null, region: null, postal: null, country: null, org: null }
}

let corruptBackupWritten = false

function salvageVisitorsMap(raw: string): Record<string, VisitorRecord> {
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, VisitorRecord>) : {}
  } catch {
    // Interleaved concurrent writes typically leave a valid object as the
    // prefix, with garbage appended after the top-level closing brace. Nested
    // braces are indented, so the first `\n}` sits at column 0 and marks the
    // end of the top-level object.
    const closeIdx = raw.indexOf('\n}')
    if (closeIdx !== -1) {
      try {
        const parsed = JSON.parse(raw.slice(0, closeIdx + 2))
        if (parsed && typeof parsed === 'object') {
          return parsed as Record<string, VisitorRecord>
        }
      } catch {
        // fall through to empty reset
      }
    }
    return {}
  }
}

export async function readVisitorsMap(): Promise<Record<string, VisitorRecord>> {
  let raw: string
  try {
    raw = await fs.readFile(VISITORS_FILE, 'utf8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return {}
    throw err
  }

  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, VisitorRecord>) : {}
  } catch (err) {
    console.warn('[visitors] visitors.json corrupt — salvaging', err)
    // Preserve the corrupt file once per process so nothing is silently lost.
    if (!corruptBackupWritten) {
      corruptBackupWritten = true
      const backup = `${VISITORS_FILE}.corrupt-${Date.now()}.json`
      try {
        await fs.writeFile(backup, raw, 'utf8')
        console.warn(`[visitors] backed up corrupt file to ${backup}`)
      } catch {
        // best effort
      }
    }
    return salvageVisitorsMap(raw)
  }
}

async function writeVisitorsMap(map: Record<string, VisitorRecord>): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true })
  // Write atomically: temp file + rename can't leave a partially written
  // (and therefore unparseable) visitors.json behind.
  const tmp = `${VISITORS_FILE}.${process.pid}.${randomUUID()}.tmp`
  await fs.writeFile(tmp, JSON.stringify(map, null, 2), 'utf8')
  await fs.rename(tmp, VISITORS_FILE)
}

// Single in-process queue shared by every writer (pageview logging and lead
// attachment) so their read-modify-write cycles can never interleave and
// corrupt the file. Safe for the single Node server that owns this file.
let writeQueue: Promise<unknown> = Promise.resolve()

export function updateVisitors<T>(
  mutator: (map: Record<string, VisitorRecord>) => T | Promise<T>,
): Promise<T> {
  const task = async () => {
    const map = await readVisitorsMap()
    const result = await mutator(map)
    await writeVisitorsMap(map)
    return result
  }
  const run = writeQueue.then(task, task)
  writeQueue = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

export async function readVisitorRecords(): Promise<VisitorRecord[]> {
  const parsed = await readVisitorsMap()
  return Object.values(parsed)
    .filter((row): row is VisitorRecord => {
      if (!row || typeof row !== 'object') return false
      const v = row as Partial<VisitorRecord>
      return typeof v.vid === 'string'
    })
    .sort((a, b) => Date.parse(b.lastSeen) - Date.parse(a.lastSeen))
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
