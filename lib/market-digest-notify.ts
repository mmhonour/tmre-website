import 'server-only'

import {
  getMarketDigestConfigFresh,
  markMarketDigestSent,
  marketDigestWeekKey,
} from '@/lib/market-digest-config'
import {
  buildMarketDigestSnapshot,
  formatMarketDigestEmail,
} from '@/lib/market-digest'

const RESEND_TIMEOUT_MS = 15_000

export type MarketDigestSendResult = {
  ok: boolean
  skipped?: boolean
  reason?: string
  to?: string
  weekKey?: string
  subject?: string
}

/**
 * Build and send the Monday months-supply / inventory digest via Resend.
 * When `force` is false, skips if disabled, already sent this ET week, or no API key.
 * Admin "Send test now" uses `force: true` (does not stamp the week).
 * Admin Syncs Run uses `force: true, stampWeek: true` so the watermark advances.
 */
export async function sendMarketDigestEmail(opts?: {
  force?: boolean
  /** Defaults to `!force`. Syncs dashboard Run sets true so Next/overdue clear. */
  stampWeek?: boolean
}): Promise<MarketDigestSendResult> {
  const force = opts?.force === true
  const stampWeek = opts?.stampWeek ?? !force
  const config = await getMarketDigestConfigFresh()
  const weekKey = marketDigestWeekKey()

  if (!force && !config.enabled) {
    return { ok: true, skipped: true, reason: 'market digest disabled in admin' }
  }
  if (!force && config.lastWeekKey === weekKey) {
    return {
      ok: true,
      skipped: true,
      reason: `already sent for week ${weekKey}`,
      weekKey,
    }
  }

  const apiKey = process.env.RESEND_API_KEY?.trim()
  if (!apiKey) {
    console.warn('[market-digest] RESEND_API_KEY not set; email not sent')
    return { ok: false, skipped: true, reason: 'RESEND_API_KEY not set' }
  }

  // Background worker has ~15 minutes, so the email can afford the two-year
  // closed-sales aggregate that Market Pulse fetches client-side.
  const snapshot = await buildMarketDigestSnapshot({ includeClosedTrailing: true })
  const { subject, text, html } = formatMarketDigestEmail(snapshot, {
    subjectTemplate: config.subjectTemplate,
    includeSocialProfiles: config.includeSocialProfiles,
  })
  const from =
    process.env.CONTACT_FROM_EMAIL?.trim() ||
    'TMRE Market Brief <notifications@tmre-website.com>'

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), RESEND_TIMEOUT_MS)
  let res: Response
  try {
    res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [config.email],
        subject,
        text,
        html,
      }),
      signal: controller.signal,
    })
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') {
      throw new Error(`Resend request timed out after ${RESEND_TIMEOUT_MS}ms`)
    }
    throw err
  } finally {
    clearTimeout(timer)
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Resend API ${res.status}${detail ? `: ${detail}` : ''}`)
  }

  if (stampWeek) {
    await markMarketDigestSent(weekKey)
  }

  console.info(
    `[market-digest] sent to ${config.email} week=${weekKey}${
      force && !stampWeek ? ' (test)' : force ? ' (admin)' : ''
    }`,
  )
  return {
    ok: true,
    to: config.email,
    weekKey,
    subject,
  }
}
