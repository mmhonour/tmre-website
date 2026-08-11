import 'server-only'

import {
  getMarketDigestConfigFresh,
  markMarketDigestSent,
  marketDigestWeekKey,
  MARKET_DIGEST_SEND_LOCK_KEY,
  MARKET_DIGEST_SEND_LOCK_STALE_MS,
} from '@/lib/market-digest-config'
import {
  buildMarketDigestSnapshot,
  formatMarketDigestEmail,
} from '@/lib/market-digest'
import {
  releaseTimedLock,
  tryAcquireTimedLock,
} from '@/lib/db/sync-meta-store'

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
 *
 * Scheduled sends take a durable lock so Netlify's every-30m thin cron cannot
 * overlap workers and Resend the same brief every half hour.
 */
export async function sendMarketDigestEmail(opts?: {
  force?: boolean
  /** Defaults to `!force`. Syncs dashboard Run sets true so Next/overdue clear. */
  stampWeek?: boolean
}): Promise<MarketDigestSendResult> {
  const force = opts?.force === true
  const stampWeek = opts?.stampWeek ?? !force
  const config = await getMarketDigestConfigFresh()
  const weekKey = marketDigestWeekKey(new Date(), config.weekdayEt)

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

  // Scheduled path: one in-flight send per week. Admin force/test may steal a
  // stale lock (0ms) so Sync now is never blocked by a dead holder.
  const lockToken = new Date().toISOString()
  const locked = await tryAcquireTimedLock(
    MARKET_DIGEST_SEND_LOCK_KEY,
    lockToken,
    force ? 0 : MARKET_DIGEST_SEND_LOCK_STALE_MS,
  )
  if (!locked) {
    return {
      ok: true,
      skipped: true,
      reason: 'market digest send already in progress',
      weekKey,
    }
  }

  try {
    // Re-read after lock — a sibling worker may have stamped while we waited.
    if (!force) {
      const again = await getMarketDigestConfigFresh()
      if (again.lastWeekKey === weekKey) {
        return {
          ok: true,
          skipped: true,
          reason: `already sent for week ${weekKey}`,
          weekKey,
        }
      }
    }

    // Background worker has ~15 minutes, so the email can afford the two-year
    // closed-sales aggregate that Market Pulse fetches client-side.
    const snapshot = await buildMarketDigestSnapshot({
      includeClosedTrailing: true,
    })
    const { subject, text, html } = formatMarketDigestEmail(snapshot, {
      subjectTemplate: config.subjectTemplate,
      includeSocialProfiles: config.includeSocialProfiles,
      weekdayEt: config.weekdayEt,
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
  } finally {
    await releaseTimedLock(MARKET_DIGEST_SEND_LOCK_KEY, lockToken).catch(
      () => {},
    )
  }
}
