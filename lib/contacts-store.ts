import 'server-only'

import { query } from '@/lib/db/postgres'

export type ContactRecord = {
  id: string
  name: string
  email: string
  phone: string | null
  source: string
  listingInfo: string | null
  address: string | null
  createdAt: string
}

let ensured = false

/** Ensure contacts table exists (idempotent; complements db/migrations/0034). */
export async function ensureContactsTable(): Promise<void> {
  if (ensured) return
  await query(`
    CREATE TABLE IF NOT EXISTS contacts (
      id             text PRIMARY KEY,
      name           text NOT NULL,
      email          text NOT NULL,
      phone          text,
      source         text NOT NULL DEFAULT 'nav-contact',
      listing_info   text,
      address        text,
      created_at     timestamptz NOT NULL DEFAULT now()
    )
  `)
  await query(`
    CREATE INDEX IF NOT EXISTS idx_contacts_created_at
      ON contacts (created_at DESC)
  `)
  await query(`
    CREATE INDEX IF NOT EXISTS idx_contacts_email
      ON contacts (email)
  `)
  await query(`
    CREATE INDEX IF NOT EXISTS idx_contacts_source
      ON contacts (source)
  `)
  ensured = true
}

type ContactRow = {
  id: string
  name: string
  email: string
  phone: string | null
  source: string
  listing_info: string | null
  address: string | null
  created_at: Date | string
}

function rowToContact(row: ContactRow): ContactRecord {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    source: row.source,
    listingInfo: row.listing_info,
    address: row.address,
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : row.created_at,
  }
}

export async function insertContact(
  contact: ContactRecord,
): Promise<ContactRecord> {
  await ensureContactsTable()
  await query(
    `INSERT INTO contacts (
       id, name, email, phone, source, listing_info, address, created_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz)`,
    [
      contact.id,
      contact.name,
      contact.email,
      contact.phone,
      contact.source,
      contact.listingInfo,
      contact.address,
      contact.createdAt,
    ],
  )
  return contact
}

export async function listContacts(limit = 500): Promise<ContactRecord[]> {
  await ensureContactsTable()
  const cap = Math.min(Math.max(limit, 1), 2000)
  const rows = await query<ContactRow>(
    `SELECT id, name, email, phone, source, listing_info, address, created_at
       FROM contacts
      ORDER BY created_at DESC
      LIMIT $1`,
    [cap],
  )
  return rows.map(rowToContact)
}
