import 'server-only'

import { query, queryOne, withTransaction } from '@/lib/db/postgres'
import type { PoolClient } from 'pg'
import type {
  VisitorGeo,
  VisitorPageHit,
  VisitorRecord,
} from '@/lib/visitors-types'

export type { VisitorGeo, VisitorPageHit, VisitorRecord }

let ensured = false

/** Ensure visitors table exists (idempotent; complements db/migrations/0006). */
export async function ensureVisitorsTable(): Promise<void> {
  if (ensured) return
  await query(`
    CREATE TABLE IF NOT EXISTS visitors (
      vid            text PRIMARY KEY,
      first_seen     timestamptz NOT NULL,
      last_seen      timestamptz NOT NULL,
      pageviews      integer NOT NULL DEFAULT 1,
      ip             text,
      geo            jsonb NOT NULL DEFAULT '{}'::jsonb,
      pages          jsonb NOT NULL DEFAULT '[]'::jsonb,
      email          text,
      zip            text,
      name           text,
      audience_type  text,
      lead_id        text,
      created_at     timestamptz NOT NULL DEFAULT now(),
      updated_at     timestamptz NOT NULL DEFAULT now()
    )
  `)
  await query(`
    CREATE INDEX IF NOT EXISTS idx_visitors_last_seen
      ON visitors (last_seen DESC)
  `)
  await query(`
    CREATE INDEX IF NOT EXISTS idx_visitors_email
      ON visitors (email)
      WHERE email IS NOT NULL
  `)
  ensured = true
}

type VisitorRow = {
  vid: string
  first_seen: Date | string
  last_seen: Date | string
  pageviews: number
  ip: string | null
  geo: VisitorGeo | string
  pages: VisitorPageHit[] | string
  email: string | null
  zip: string | null
  name: string | null
  audience_type: string | null
  lead_id: string | null
}

function tsToIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value
}

function parseGeo(raw: VisitorGeo | string | null | undefined): VisitorGeo {
  if (!raw) {
    return { city: null, region: null, postal: null, country: null, org: null }
  }
  const geo = typeof raw === 'string' ? (JSON.parse(raw) as VisitorGeo) : raw
  return {
    city: geo.city ?? null,
    region: geo.region ?? null,
    postal: geo.postal ?? null,
    country: geo.country ?? null,
    org: geo.org ?? null,
  }
}

function parsePages(raw: VisitorPageHit[] | string | null | undefined): VisitorPageHit[] {
  if (!raw) return []
  const pages = typeof raw === 'string' ? (JSON.parse(raw) as VisitorPageHit[]) : raw
  if (!Array.isArray(pages)) return []
  return pages
    .filter(
      (p): p is VisitorPageHit =>
        Boolean(p) &&
        typeof p === 'object' &&
        typeof p.path === 'string' &&
        typeof p.at === 'string',
    )
    .slice(-50)
}

function rowToRecord(row: VisitorRow): VisitorRecord {
  return {
    vid: row.vid,
    firstSeen: tsToIso(row.first_seen),
    lastSeen: tsToIso(row.last_seen),
    pageviews: Number(row.pageviews) || 0,
    ip: row.ip,
    geo: parseGeo(row.geo),
    pages: parsePages(row.pages),
    email: row.email,
    zip: row.zip,
    name: row.name,
    audienceType: row.audience_type,
    leadId: row.lead_id,
  }
}

const SELECT_COLS = `
  vid, first_seen, last_seen, pageviews, ip, geo, pages,
  email, zip, name, audience_type, lead_id
`

export async function readVisitorByVid(vid: string): Promise<VisitorRecord | null> {
  await ensureVisitorsTable()
  const id = vid.trim()
  if (!id) return null
  const row = await queryOne<VisitorRow>(
    `SELECT ${SELECT_COLS} FROM visitors WHERE vid = $1`,
    [id],
  )
  return row ? rowToRecord(row) : null
}

export async function listVisitorRecords(limit = 500): Promise<VisitorRecord[]> {
  await ensureVisitorsTable()
  const capped = Math.min(Math.max(1, Math.floor(limit)), 5000)
  const rows = await query<VisitorRow>(
    `SELECT ${SELECT_COLS}
     FROM visitors
     ORDER BY last_seen DESC
     LIMIT $1`,
    [capped],
  )
  return rows.map(rowToRecord)
}

function trimPages(pages: VisitorPageHit[]): VisitorPageHit[] {
  return pages.length > 50 ? pages.slice(-50) : pages
}

export async function recordVisitorPageview(input: {
  vid: string
  path: string
  at: string
  ip: string | null
  /** Only applied when inserting a new visitor row. */
  geo?: VisitorGeo | null
}): Promise<void> {
  await ensureVisitorsTable()
  const vid = input.vid.trim()
  if (!vid) return

  const hit: VisitorPageHit = { path: input.path, at: input.at }
  const geo = input.geo ?? {
    city: null,
    region: null,
    postal: null,
    country: null,
    org: null,
  }

  await withTransaction(async (client: PoolClient) => {
    const existing = await client.query<VisitorRow>(
      `SELECT ${SELECT_COLS} FROM visitors WHERE vid = $1 FOR UPDATE`,
      [vid],
    )
    const row = existing.rows[0]
    if (row) {
      const pages = trimPages([...parsePages(row.pages), hit])
      await client.query(
        `UPDATE visitors SET
           last_seen = $2::timestamptz,
           pageviews = pageviews + 1,
           pages = $3::jsonb,
           ip = COALESCE(ip, $4),
           updated_at = now()
         WHERE vid = $1`,
        [vid, input.at, JSON.stringify(pages), input.ip],
      )
      return
    }

    await client.query(
      `INSERT INTO visitors (
         vid, first_seen, last_seen, pageviews, ip, geo, pages,
         email, zip, name, audience_type, lead_id
       ) VALUES (
         $1, $2::timestamptz, $2::timestamptz, 1, $3, $4::jsonb, $5::jsonb,
         NULL, NULL, NULL, NULL, NULL
       )
       ON CONFLICT (vid) DO UPDATE SET
         last_seen = EXCLUDED.last_seen,
         pageviews = visitors.pageviews + 1,
         pages = (
           SELECT COALESCE(jsonb_agg(elem ORDER BY ord), '[]'::jsonb)
           FROM (
             SELECT elem, ord
             FROM (
               SELECT value AS elem, ordinality AS ord
               FROM jsonb_array_elements(visitors.pages || EXCLUDED.pages)
                 WITH ORDINALITY
               ORDER BY ordinality DESC
               LIMIT 50
             ) newest
             ORDER BY ord ASC
           ) ordered
         ),
         ip = COALESCE(visitors.ip, EXCLUDED.ip),
         updated_at = now()`,
      [vid, input.at, input.ip, JSON.stringify(geo), JSON.stringify([hit])],
    )
  })
}

export async function attachLeadFieldsToVisitor(
  vid: string,
  lead: {
    email: string
    zip: string
    name: string
    audienceType: string
    leadId: string
  },
): Promise<void> {
  await ensureVisitorsTable()
  const id = vid.trim()
  if (!id) return
  await query(
    `UPDATE visitors SET
       email = $2,
       zip = $3,
       name = $4,
       audience_type = $5,
       lead_id = $6,
       updated_at = now()
     WHERE vid = $1`,
    [id, lead.email, lead.zip, lead.name, lead.audienceType, lead.leadId],
  )
}
