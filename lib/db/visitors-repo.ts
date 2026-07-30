import 'server-only'

import { query, queryOne, withTransaction } from '@/lib/db/postgres'
import type { PoolClient } from 'pg'
import type {
  VisitorGeo,
  VisitorIdentitySource,
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

/**
 * Read rows carry contact details resolved across the tables that already hold
 * them: `leads` (via lead_id), `site_users` and `saved_search_alerts` (via
 * visitor_id). Nothing here is enriched from outside — every value was supplied
 * by the visitor.
 */
type VisitorIdentityRow = VisitorRow & {
  phone: string | null
  visitor_email: string | null
  visitor_name: string | null
  has_lead: boolean
  has_account: boolean
  has_alert: boolean
  last_login_at: Date | string | null
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

type IdentityJoins = { leads: boolean; siteUsers: boolean; alerts: boolean }

let identityJoins: IdentityJoins | null = null

/**
 * Which identity tables exist. Probed once rather than assumed: a database
 * missing migration 0004 / 0008 / 0011 would otherwise fail the whole visitors
 * read on an unknown relation.
 */
async function detectIdentityJoins(): Promise<IdentityJoins> {
  if (identityJoins) return identityJoins
  try {
    const rows = await query<{ table_name: string }>(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = current_schema()
         AND table_name IN ('leads', 'site_users', 'saved_search_alerts')`,
    )
    const names = new Set(rows.map((r) => r.table_name))
    identityJoins = {
      leads: names.has('leads'),
      siteUsers: names.has('site_users'),
      alerts: names.has('saved_search_alerts'),
    }
  } catch {
    identityJoins = { leads: false, siteUsers: false, alerts: false }
  }
  return identityJoins
}

function identitySelect(joins: IdentityJoins): string {
  const emails = ['v.email']
  const names = ['v.name']
  const phones: string[] = []
  const flags: string[] = []
  const from = ['FROM visitors v']

  if (joins.leads) {
    from.push('LEFT JOIN leads l ON l.id = v.lead_id')
    emails.push('l.email')
    names.push('l.name')
    phones.push('l.phone')
    flags.push('(l.id IS NOT NULL) AS has_lead')
  } else {
    flags.push('false AS has_lead')
  }

  if (joins.siteUsers) {
    from.push(`LEFT JOIN LATERAL (
       SELECT su.email, su.name, su.last_login_at
       FROM site_users su
       WHERE su.visitor_id = v.vid
       ORDER BY su.last_login_at DESC NULLS LAST
       LIMIT 1
     ) acct ON true`)
    emails.push('acct.email')
    names.push('acct.name')
    flags.push('(acct.email IS NOT NULL) AS has_account', 'acct.last_login_at')
  } else {
    flags.push('false AS has_account', 'NULL::timestamptz AS last_login_at')
  }

  if (joins.alerts) {
    from.push(`LEFT JOIN LATERAL (
       SELECT a.email, a.phone
       FROM saved_search_alerts a
       WHERE a.visitor_id = v.vid
         AND (a.email IS NOT NULL OR a.phone IS NOT NULL)
       ORDER BY a.active DESC, a.updated_at DESC
       LIMIT 1
     ) alert ON true`)
    emails.push('alert.email')
    phones.push('alert.phone')
    flags.push('(alert.email IS NOT NULL OR alert.phone IS NOT NULL) AS has_alert')
  } else {
    flags.push('false AS has_alert')
  }

  return `SELECT
       v.vid, v.first_seen, v.last_seen, v.pageviews, v.ip, v.geo, v.pages,
       v.zip, v.audience_type, v.lead_id,
       v.email AS visitor_email,
       v.name AS visitor_name,
       COALESCE(${emails.join(', ')}) AS email,
       COALESCE(${names.join(', ')}) AS name,
       ${phones.length > 0 ? `COALESCE(${phones.join(', ')})` : 'NULL::text'} AS phone,
       ${flags.join(',\n       ')}
     ${from.join('\n     ')}`
}

function identityRowToRecord(row: VisitorIdentityRow): VisitorRecord {
  const sources: VisitorIdentitySource[] = []
  if (row.has_lead) sources.push('lead')
  if (row.has_account) sources.push('account')
  if (row.has_alert) sources.push('alert')
  if (!row.has_lead && (row.visitor_email || row.visitor_name)) sources.push('form')

  return {
    ...rowToRecord(row),
    phone: row.phone,
    identitySources: sources,
    lastLoginAt: row.last_login_at ? tsToIso(row.last_login_at) : null,
  }
}

export async function readVisitorByVid(vid: string): Promise<VisitorRecord | null> {
  await ensureVisitorsTable()
  const id = vid.trim()
  if (!id) return null
  const joins = await detectIdentityJoins()
  const row = await queryOne<VisitorIdentityRow>(
    `${identitySelect(joins)} WHERE v.vid = $1`,
    [id],
  )
  return row ? identityRowToRecord(row) : null
}

export async function listVisitorRecords(limit = 500): Promise<VisitorRecord[]> {
  await ensureVisitorsTable()
  const capped = Math.min(Math.max(1, Math.floor(limit)), 5000)
  const joins = await detectIdentityJoins()
  const rows = await query<VisitorIdentityRow>(
    `${identitySelect(joins)}
     ORDER BY v.last_seen DESC
     LIMIT $1`,
    [capped],
  )
  return rows.map(identityRowToRecord)
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

/** Attach email/name from alert or I'm interested without a lead id. */
export async function attachProfileFieldsToVisitor(
  vid: string,
  profile: { email?: string | null; name?: string | null },
): Promise<void> {
  await ensureVisitorsTable()
  const id = vid.trim()
  if (!id) return
  const email = profile.email?.trim().toLowerCase() || null
  const name = profile.name?.trim() || null
  if (!email && !name) return
  await query(
    `UPDATE visitors SET
       email = COALESCE($2, email),
       name = COALESCE($3, name),
       updated_at = now()
     WHERE vid = $1`,
    [id, email, name],
  )
}
