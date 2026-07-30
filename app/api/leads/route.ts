import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { isAdminAuthorizedRequest } from '@/lib/admin-auth'
import { notifyContactByEmail } from '@/lib/contact-notify'
import {
  insertLead,
  isLeadAudienceType,
  LEAD_AUDIENCE_TYPES,
  listLeads,
  type Lead,
} from '@/lib/leads-store'
import { attachLeadFieldsToVisitor } from '@/lib/visitors'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const VID_COOKIE = 'tmre_vid'

function townFromZip(zip: string): string | null {
  const z = zip.trim()
  if (/^0685[0-5]$/.test(z)) return 'Norwalk'
  if (z === '06880' || z === '06838') return 'Westport'
  return null
}

async function attachLeadToVisitor(vid: string, lead: Lead): Promise<void> {
  try {
    await attachLeadFieldsToVisitor(vid, {
      email: lead.email,
      zip: lead.zip,
      name: lead.name,
      audienceType: lead.audience_type,
      leadId: lead.id,
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
  if (!isLeadAudienceType(audience_type)) {
    return NextResponse.json(
      { error: `audience_type must be one of ${LEAD_AUDIENCE_TYPES.join(', ')}` },
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
    await insertLead(lead)
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

export async function GET(req: NextRequest) {
  if (!isAdminAuthorizedRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const leads = await listLeads()
    return NextResponse.json({ count: leads.length, leads })
  } catch (err) {
    console.error('[/api/leads] read failed', err)
    return NextResponse.json({ error: 'Failed to read leads' }, { status: 500 })
  }
}
