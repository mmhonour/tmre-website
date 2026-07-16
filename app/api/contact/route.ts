import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { notifyContactByEmail } from '@/lib/contact-notify'
import { validateContactFields } from '@/lib/contact-form-validation'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DATA_DIR = path.join(process.cwd(), 'data')
const CONTACTS_FILE = path.join(DATA_DIR, 'contacts.json')

type Contact = {
  id: string
  name: string
  phone: string | null
  email: string
  source: string
  listingInfo: string | null
  address: string | null
  createdAt: string
}

async function readContacts(): Promise<Contact[]> {
  try {
    const raw = await fs.readFile(CONTACTS_FILE, 'utf8')
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as Contact[]) : []
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw err
  }
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const phone = typeof body.phone === 'string' ? body.phone.trim() : ''
  const email = typeof body.email === 'string' ? body.email.trim() : ''
  const source = typeof body.source === 'string' ? body.source.trim() : 'nav-contact'
  const listingInfo =
    typeof body.listingInfo === 'string' ? body.listingInfo.trim() || null : null
  const address =
    typeof body.address === 'string' ? body.address.trim().slice(0, 2000) || null : null

  const requireAddress = source === 'list-with-me'
  const fieldErrors = validateContactFields({
    name,
    phone,
    email,
    requireAddress,
    address: address ?? '',
  })
  if (Object.keys(fieldErrors).length > 0) {
    const message =
      fieldErrors.name ??
      fieldErrors.phone ??
      fieldErrors.email ??
      fieldErrors.address ??
      'Invalid input'
    return NextResponse.json({ error: message, fieldErrors }, { status: 400 })
  }

  const contact: Contact = {
    id: randomUUID(),
    name,
    phone: phone || null,
    email,
    source,
    listingInfo,
    address,
    createdAt: new Date().toISOString(),
  }

  await fs.mkdir(DATA_DIR, { recursive: true })
  const contacts = await readContacts()
  contacts.push(contact)
  await fs.writeFile(CONTACTS_FILE, JSON.stringify(contacts, null, 2), 'utf8')

  // Email is best-effort: the contact is already persisted, so a mail failure
  // must never block or error the user's submission (that produced the hang /
  // false error). Log it server-side and surface a soft `emailed` flag.
  let emailed = false
  try {
    emailed = await notifyContactByEmail({
      name: contact.name,
      phone: contact.phone,
      email: contact.email,
      source: contact.source,
      listingInfo: contact.listingInfo,
      address: contact.address,
    })
  } catch (err) {
    console.error('[/api/contact] email notify failed', err)
  }

  return NextResponse.json({ ok: true, emailed }, { status: 201 })
}
