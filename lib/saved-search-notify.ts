import 'server-only'

import { SITE_URL } from '@/lib/business-info'

const RESEND_TIMEOUT_MS = 10_000

export type SavedSearchMatchListing = {
  id: string
  mlsId: string
  address: string | null
  town: string | null
  price: number | null
  beds: number | null
  baths: number | null
  href: string
}

function formatPrice(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return 'Price TBD'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n)
}

/**
 * Email the visitor a batch of matching listings. Returns true when Resend
 * accepted the message. SMS is not implemented yet (see search-alerts whiteboard).
 */
export async function notifySavedSearchByEmail(opts: {
  to: string
  criteriaLabel: string
  cadence: string
  listings: SavedSearchMatchListing[]
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY?.trim()
  if (!apiKey) {
    console.warn('[saved-search-notify] RESEND_API_KEY not set; email not sent')
    return false
  }
  if (opts.listings.length === 0) return false

  const from =
    process.env.CONTACT_FROM_EMAIL?.trim() ||
    'TMRE Alerts <notifications@tmre-website.com>'

  const subject =
    opts.listings.length === 1
      ? `New match — ${opts.listings[0].address ?? opts.listings[0].mlsId}`
      : `${opts.listings.length} new matches — ${opts.criteriaLabel}`

  const lines = [
    `Your TMRE saved search “${opts.criteriaLabel}” has new listing${opts.listings.length === 1 ? '' : 's'}.`,
    `Cadence: ${opts.cadence}`,
    '',
    ...opts.listings.flatMap((l, i) => [
      `${i + 1}. ${l.address ?? 'Address TBD'}${l.town ? ` · ${l.town}` : ''}`,
      `   ${formatPrice(l.price)}${l.beds != null ? ` · ${l.beds} bd` : ''}${l.baths != null ? ` · ${l.baths} ba` : ''}`,
      `   MLS #${l.mlsId}`,
      `   ${l.href.startsWith('http') ? l.href : `${SITE_URL}${l.href}`}`,
      '',
    ]),
    'Manage preferences on the Latest page: ' + `${SITE_URL}/latest`,
    '',
    '— TMRE listing alerts',
  ]

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), RESEND_TIMEOUT_MS)
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [opts.to],
        subject,
        text: lines.join('\n'),
      }),
      signal: controller.signal,
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      throw new Error(`Resend API ${res.status}${detail ? `: ${detail}` : ''}`)
    }
    return true
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') {
      throw new Error(`Resend request timed out after ${RESEND_TIMEOUT_MS}ms`)
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

export async function notifySavedSearchConfirmation(opts: {
  to: string
  criteriaLabel: string
  cadenceLabel: string
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY?.trim()
  if (!apiKey) return false
  const from =
    process.env.CONTACT_FROM_EMAIL?.trim() ||
    'TMRE Alerts <notifications@tmre-website.com>'
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), RESEND_TIMEOUT_MS)
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [opts.to],
        subject: `Alert saved — ${opts.criteriaLabel}`,
        text: [
          `You're set. We'll email you when new listings match:`,
          '',
          `Search: ${opts.criteriaLabel}`,
          `When: ${opts.cadenceLabel}`,
          '',
          `Latest feed: ${SITE_URL}/latest`,
          `Optional sign-in (passwordless): ${SITE_URL}/login`,
          '',
          '— TMRE listing alerts',
        ].join('\n'),
      }),
      signal: controller.signal,
    })
    return res.ok
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

/** Notify the agent that a visitor just created a listing alert. */
export async function notifySavedSearchCreatedAdmin(opts: {
  visitorEmail: string
  criteriaLabel: string
  cadenceLabel: string
  visitorId?: string | null
}): Promise<boolean> {
  const { getContactNotifyEmailFresh } = await import(
    '@/lib/contact-notify-config'
  )
  const to = await getContactNotifyEmailFresh()
  const apiKey = process.env.RESEND_API_KEY?.trim()
  if (!apiKey) return false
  const from =
    process.env.CONTACT_FROM_EMAIL?.trim() ||
    'TMRE Alerts <notifications@tmre-website.com>'
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), RESEND_TIMEOUT_MS)
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [to],
        reply_to: opts.visitorEmail,
        subject: `New listing alert — ${opts.criteriaLabel}`,
        text: [
          'A visitor created a listing alert on Latest.',
          '',
          `Email: ${opts.visitorEmail}`,
          `Search: ${opts.criteriaLabel}`,
          `When: ${opts.cadenceLabel}`,
          opts.visitorId ? `Visitor id: ${opts.visitorId}` : null,
          '',
          `Admin alerts: ${SITE_URL}/admin?tab=communications`,
          '',
          '— tmre-website saved search',
        ]
          .filter(Boolean)
          .join('\n'),
      }),
      signal: controller.signal,
    })
    return res.ok
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}
