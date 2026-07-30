import 'server-only'

import { query } from '@/lib/db/postgres'

export const LEAD_AUDIENCE_TYPES = [
  'seller',
  'buyer',
  'investor',
  'contractor',
] as const

export type LeadAudienceType = (typeof LEAD_AUDIENCE_TYPES)[number]

export type Lead = {
  id: string
  name: string
  email: string
  phone: string | null
  zip: string
  town: string | null
  audience_type: LeadAudienceType
  source: string
  createdAt: string
}

let ensured = false

/** Ensure leads table exists (idempotent; complements db/migrations/0011). */
export async function ensureLeadsTable(): Promise<void> {
  if (ensured) return
  await query(`
    CREATE TABLE IF NOT EXISTS leads (
      id             text PRIMARY KEY,
      name           text NOT NULL,
      email          text NOT NULL,
      phone          text,
      zip            text NOT NULL,
      town           text,
      audience_type  text NOT NULL,
      source         text NOT NULL DEFAULT 'website',
      created_at     timestamptz NOT NULL DEFAULT now()
    )
  `)
  await query(`
    CREATE INDEX IF NOT EXISTS idx_leads_created_at
      ON leads (created_at DESC)
  `)
  await query(`
    CREATE INDEX IF NOT EXISTS idx_leads_email
      ON leads (email)
  `)
  ensured = true
}

type LeadRow = {
  id: string
  name: string
  email: string
  phone: string | null
  zip: string
  town: string | null
  audience_type: string
  source: string
  created_at: Date | string
}

function rowToLead(row: LeadRow): Lead {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    zip: row.zip,
    town: row.town,
    audience_type: row.audience_type as LeadAudienceType,
    source: row.source,
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : row.created_at,
  }
}

export function isLeadAudienceType(value: unknown): value is LeadAudienceType {
  return (
    typeof value === 'string' &&
    (LEAD_AUDIENCE_TYPES as readonly string[]).includes(value)
  )
}

export async function insertLead(lead: Lead): Promise<Lead> {
  await ensureLeadsTable()
  await query(
    `INSERT INTO leads (
       id, name, email, phone, zip, town, audience_type, source, created_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::timestamptz)`,
    [
      lead.id,
      lead.name,
      lead.email,
      lead.phone,
      lead.zip,
      lead.town,
      lead.audience_type,
      lead.source,
      lead.createdAt,
    ],
  )
  return lead
}

export async function listLeads(limit = 500): Promise<Lead[]> {
  await ensureLeadsTable()
  const cap = Math.min(Math.max(limit, 1), 2000)
  const rows = await query<LeadRow>(
    `SELECT id, name, email, phone, zip, town, audience_type, source, created_at
     FROM leads
     ORDER BY created_at DESC
     LIMIT $1`,
    [cap],
  )
  return rows.map(rowToLead)
}
