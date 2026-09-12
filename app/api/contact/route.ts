import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { isAdminAuthorizedRequest } from '@/lib/admin-auth'
import { SITE_VISITOR_COOKIE } from '@/lib/browser-cookies-catalog'
import {
  insertContact,
  listContacts,
  type ContactRecord,
} from '@/lib/contacts-store'
import { notifyContactByEmail } from '@/lib/contact-notify'
import { validateContactFields } from '@/lib/contact-form-validation'
import { notifyInterestConfirmation } from '@/lib/interest-notify'
import {
  getSessionUserFromCookies,
  requestMagicLink,
  upsertSiteUserByEmail,
} from '@/lib/site-user-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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

  const contact: ContactRecord = {
    id: randomUUID(),
    name,
    phone: phone || null,
    email,
    source,
    listingInfo,
    address,
    createdAt: new Date().toISOString(),
  }

  try {
    await insertContact(contact)
  } catch (err) {
    console.error('[/api/contact] write failed', err)
    return NextResponse.json({ error: 'Failed to store inquiry' }, { status: 500 })
  }

  const visitorId = req.cookies.get(SITE_VISITOR_COOKIE)?.value?.trim() || null
  const sessionUser = await getSessionUserFromCookies()
  let profileLinked = false
  let magicLinkOffered = false

  try {
    await upsertSiteUserByEmail({
      email: contact.email,
      name: contact.name,
      visitorId: visitorId || sessionUser?.visitorId || null,
    })
    profileLinked = true
    if (visitorId) {
      const { attachProfileFieldsToVisitor } = await import(
        '@/lib/db/visitors-repo'
      )
      await attachProfileFieldsToVisitor(visitorId, {
        email: contact.email,
        name: contact.name,
      })
    }
  } catch (err) {
    console.warn('[/api/contact] profile link failed', err)
  }

  // Email is best-effort: the contact is already persisted, so a mail failure
  // must never block or error the user's submission (that produced the hang /
  // false error). Log it server-side and surface a soft `emailed` flag.
  let emailed = false
  let visitorEmailed = false
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

  if (contact.source === 'listing-interest') {
    try {
      visitorEmailed = await notifyInterestConfirmation({
        to: contact.email,
        name: contact.name,
        listingInfo: contact.listingInfo,
      })
    } catch (err) {
      console.warn('[/api/contact] interest confirmation failed', err)
    }

    // No session yet → offer passwordless login so next I'm interested prefills.
    if (!sessionUser) {
      try {
        const link = await requestMagicLink({
          email: contact.email,
          name: contact.name,
          visitorId,
          nextPath: '/latest',
        })
        magicLinkOffered = link.emailed
      } catch (err) {
        console.warn('[/api/contact] magic link offer failed', err)
      }
    }
  }

  return NextResponse.json(
    {
      ok: true,
      emailed,
      visitorEmailed,
      profileLinked,
      authenticated: Boolean(sessionUser),
      magicLinkOffered,
    },
    { status: 201 },
  )
}

export async function GET(req: NextRequest) {
  if (!isAdminAuthorizedRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const contacts = await listContacts()
    return NextResponse.json({ count: contacts.length, contacts })
  } catch (err) {
    console.error('[/api/contact] read failed', err)
    return NextResponse.json({ error: 'Failed to read inquiries' }, { status: 500 })
  }
}
