import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { notifyContactByEmail } from '@/lib/contact-notify'
import { updateVisitors } from '@/lib/visitors'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DATA_DIR = path.join(process.cwd(), 'data')
const LEADS_FILE = path.join(DATA_DIR, 'leads.json')
const VID_COOKIE = 'tmre_vid'

const AUDIENCE_TYPES = ['seller', 'buyer', 'investor', 'contractor'] as const
type AudienceType = (typeof AUDIENCE_TYPES)[number]

type Lead = {
  id: string
  name: string
  email: string
  phone: string | null
  zip: string
  town: string | null
  audience_type: AudienceType
  source: string
  createdAt: string
}

function townFromZip(zip: string): string | null {
  const z = zip.trim()
  if (/^0685[0-5]$/.test(z)) return 'Norwalk'
  if (z === '06880' || z === '06838') return 'Westport'
  return null
}

function isAudienceType(v: unknown): v is AudienceType {
  return typeof v === 'string' && (AUDIENCE_TYPES as readonly string[]).includes(v)
}

async function readLeads(): Promise<Lead[]> {
  try {
    const raw = await fs.readFile(LEADS_FILE, 'utf8')
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as Lead[]) : []
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw err
  }
}

async function writeLeads(leads: Lead[]): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true })
  await fs.writeFile(LEADS_FILE, JSON.stringify(leads, null, 2), 'utf8')
}

async function attachLeadToVisitor(vid: string, lead: Lead): Promise<void> {
  try {
    await updateVisitors((visitors) => {
      const v = visitors[vid]
      if (!v) return
      v.email = lead.email
      v.zip = lead.zip
      v.name = lead.name
      v.audienceType = lead.audience_type
      v.leadId = lead.id
    })
  } catch (err) {
    console.warn('[leads] attachLeadToVisitor failed', err)
  }
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const email = typeof body.email === 'string' ? body.email.trim() : ''
  const phone = typeof body.phone === 'string' ? body.phone.trim() : ''
  const zip = typeof body.zip === 'string' ? body.zip.trim() : ''
  const audience_type = body.audience_type
  const source = typeof body.source === 'string' ? body.source.trim() : 'website'

  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'valid email is required' }, { status: 400 })
  }
  if (!zip || !/^\d{5}$/.test(zip)) {
    return NextResponse.json({ error: 'valid 5-digit zip is required' }, { status: 400 })
  }
  if (!isAudienceType(audience_type)) {
    return NextResponse.json(
      { error: `audience_type must be one of ${AUDIENCE_TYPES.join(', ')}` },
      { status: 400 },
    )
  }

  const lead: Lead = {
    id: randomUUID(),
    name,
    email,
    phone: phone || null,
    zip,
    town: townFromZip(zip),
    audience_type,
    source: source || 'website',
    createdAt: new Date().toISOString(),
  }

  try {
    const leads = await readLeads()
    leads.push(lead)
    await writeLeads(leads)
  } catch (err) {
    console.error('[/api/leads] write failed', err)
    return NextResponse.json({ error: 'Failed to store lead' }, { status: 500 })
  }

  const vid = req.cookies.get(VID_COOKIE)?.value
  if (vid && /^[a-f0-9-]{36}$/i.test(vid)) {
    await attachLeadToVisitor(vid, lead)
  }

  // Best-effort agent notification (never blocks the lead capture).
  let emailed = false
  try {
    emailed = await notifyContactByEmail({
      name: lead.name,
      phone: lead.phone,
      email: lead.email,
      source: `${lead.source} · ${lead.audience_type}`,
      listingInfo: null,
      address: lead.town ? `ZIP ${lead.zip} (${lead.town})` : `ZIP ${lead.zip}`,
    })
  } catch (err) {
    console.error('[/api/leads] email notify failed', err)
  }

  return NextResponse.json({ ok: true, lead, emailed }, { status: 201 })
}

export async function GET() {
  try {
    const leads = await readLeads()
    return NextResponse.json({ count: leads.length, leads })
  } catch (err) {
    console.error('[/api/leads] read failed', err)
    return NextResponse.json({ error: 'Failed to read leads' }, { status: 500 })
  }
}
