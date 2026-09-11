import 'server-only'

import {
  absoluteUrl,
  AGENT_MLS_ID,
  AGENT_NAME,
  SITE_URL,
} from '@/lib/business-info'
import { getBrokerageNameFresh } from '@/lib/brokerage-config'
import { resendFrom } from '@/lib/resend-from'
import { getMarketPulseThemeFresh } from '@/lib/page-theme-config'
import {
  formatSavedSearchConfirmationHtml,
  formatSavedSearchMatchesHtml,
} from '@/lib/saved-search-email-html'

const RESEND_TIMEOUT_MS = 10_000

export type SavedSearchMatchListing = {
  id: string
  mlsId: string
  address: string | null
  town: string | null
  price: number | null
  beds: number | null
  baths: number | null
  /** Short share path or absolute URL — prefer `/listings/{mlsId}`. */
  href: string
  /** Absolute thumbnail URL when available. */
  photoUrl?: string | null
  matchKind?: 'listing' | 'open_house'
  openHouseWhen?: string | null
}

function formatPrice(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return 'Price TBD'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n)
}

function absHref(href: string): string {
  return href.startsWith('http') ? href : absoluteUrl(href)
}

function footerText(brokerage: string): string[] {
  return [
    '',
    `${AGENT_NAME} (MLS #${AGENT_MLS_ID}) is a licensed real estate agent affiliated with ${brokerage}. Equal Housing Opportunity.`,
    SITE_URL,
  ]
}

/**
 * Email the visitor a batch of matching listings. Returns true when Resend
 * accepted the message. SMS is not implemented yet (see search-alerts whiteboard).
 */
export async function notifySavedSearchByEmail(opts: {
  to: string
  criteriaLabel: string
  cadence: string
  searchHref: string
  listings: SavedSearchMatchListing[]
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY?.trim()
  if (!apiKey) {
    console.warn('[saved-search-notify] RESEND_API_KEY not set; email not sent')
    return false
  }
  if (opts.listings.length === 0) return false

  const from = resendFrom('TMRE Alerts')

  const ohCount = opts.listings.filter((l) => l.matchKind === 'open_house').length
  const listingCount = opts.listings.length - ohCount
  const subject =
    opts.listings.length === 1
      ? `${opts.listings[0].matchKind === 'open_house' ? 'Open house' : 'New match'} — ${opts.listings[0].address ?? opts.listings[0].mlsId}`
      : ohCount > 0 && listingCount === 0
        ? `${opts.listings.length} open houses — ${opts.criteriaLabel}`
        : ohCount > 0
          ? `${opts.listings.length} listing and open-house matches — ${opts.criteriaLabel}`
          : `${opts.listings.length} new matches — ${opts.criteriaLabel}`

  const [theme, brokerage] = await Promise.all([
    getMarketPulseThemeFresh(),
    getBrokerageNameFresh(),
  ])
  const searchUrl = absHref(opts.searchHref)

  const lines = [
    `Your TMRE saved search “${opts.criteriaLabel}” has ${
      ohCount > 0 && listingCount === 0
        ? `open house${opts.listings.length === 1 ? '' : 's'}`
        : ohCount > 0
          ? 'new matches'
          : `new listing${opts.listings.length === 1 ? '' : 's'}`
    }.`,
    `Cadence: ${opts.cadence}`,
    `Search: ${searchUrl}`,
    '',
    ...opts.listings.flatMap((l, i) => [
      `${i + 1}. ${l.matchKind === 'open_house' ? 'Open house · ' : ''}${l.address ?? 'Address TBD'}${l.town ? ` · ${l.town}` : ''}`,
      `   ${formatPrice(l.price)}${l.beds != null ? ` · ${l.beds} bd` : ''}${l.baths != null ? ` · ${l.baths} ba` : ''}${l.openHouseWhen ? ` · ${l.openHouseWhen}` : ''}`,
      `   MLS #${l.mlsId}`,
      `   ${absHref(l.href)}`,
      '',
    ]),
    'Manage preferences: ' + `${SITE_URL}/latest`,
    ...footerText(brokerage),
  ]

  const html = formatSavedSearchMatchesHtml({
    theme,
    brokerage,
    criteriaLabel: opts.criteriaLabel,
    cadence: opts.cadence,
    searchHref: searchUrl,
    listings: opts.listings,
  })

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
        html,
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
  searchHref: string
  notifySummary?: string
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY?.trim()
  if (!apiKey) return false
  const from = resendFrom('TMRE Alerts')

  const [theme, brokerage] = await Promise.all([
    getMarketPulseThemeFresh(),
    getBrokerageNameFresh(),
  ])
  const searchUrl = absHref(opts.searchHref)

  const text = [
    `You're set. We'll email you when ${opts.notifySummary ?? 'new listings'} match:`,
    '',
    `Search: ${opts.criteriaLabel}`,
    searchUrl,
    `When: ${opts.cadenceLabel}`,
    '',
    `Latest feed: ${SITE_URL}/latest`,
    `Optional sign-in (passwordless): ${SITE_URL}/login`,
    ...footerText(brokerage),
  ].join('\n')

  const html = formatSavedSearchConfirmationHtml({
    theme,
    brokerage,
    criteriaLabel: opts.criteriaLabel,
    cadenceLabel: opts.cadenceLabel,
    searchHref: searchUrl,
    notifySummary: opts.notifySummary,
  })

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
        text,
        html,
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
  const from = resendFrom('TMRE Alerts')
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
        subject: `New search alert — ${opts.criteriaLabel}`,
        text: [
          'A visitor created a listing / open-house alert.',
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
