import 'server-only'

import {
  getMarketDigestConfigFresh,
  markMarketDigestSent,
  marketDigestWeekKey,
  MARKET_DIGEST_LAST_ATTEMPT_KEY,
  MARKET_DIGEST_LAST_RESULT_KEY,
  MARKET_DIGEST_SEND_LOCK_KEY,
  MARKET_DIGEST_SEND_LOCK_STALE_MS,
} from '@/lib/market-digest-config'
import {
  buildMarketDigestSnapshot,
  formatMarketDigestEmail,
} from '@/lib/market-digest'
import { getSyncMeta as getSyncMetaFresh } from '@/lib/db/sync-meta'
import { resendFrom } from '@/lib/resend-from'
import {
  releaseTimedLock,
  setSyncMetaDurable,
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

export type MarketDigestSendOptions = {
  force?: boolean
  /** Defaults to `!force`. Syncs dashboard Run sets true so Next/overdue clear. */
  stampWeek?: boolean
  /** Start of the attempt for the History row; defaults to now. */
  startedAt?: string
  /** Who asked: railway-sweep, netlify-worker, admin-test… Recorded, not acted on. */
  trigger?: string
}

/**
 * Build and send the Monday months-supply / inventory digest via Resend, and
 * record what happened.
 *
 * Recording lives here rather than in each caller so Netlify's background worker
 * and the Railway lane cannot drift: every attempt stamps
 * `market_digest_last_attempt_at` / `market_digest_last_result`, and anything an
 * operator would want to find later also lands in Syncs History.
 */
export async function sendMarketDigestEmail(
  opts?: MarketDigestSendOptions,
): Promise<MarketDigestSendResult> {
  const startedAt = opts?.startedAt ?? new Date().toISOString()
  const trigger = opts?.trigger?.trim() || 'scheduled'
  const previousResult = await getSyncMetaFresh(
    MARKET_DIGEST_LAST_RESULT_KEY,
  ).catch(() => null)
  await setSyncMetaDurable(MARKET_DIGEST_LAST_ATTEMPT_KEY, startedAt).catch(
    () => {},
  )

  try {
    const result = await runMarketDigestSend(opts)
    await recordMarketDigestOutcome({
      startedAt,
      trigger,
      previousResult,
      result,
    })
    return result
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    await recordMarketDigestOutcome({
      startedAt,
      trigger,
      previousResult,
      result: { ok: false, reason: detail },
    })
    throw err
  }
}

/**
 * A worker hop that never started leaves no trace on its own: the send function
 * was never reached, so `market_digest_last_attempt_at` stayed empty and /admin
 * could only show a bare "queue failed" with nothing to explain the quiet week.
 * Recorded as a skip so repeats collapse instead of filling History.
 */
export async function recordMarketDigestHandoffFailure(args: {
  startedAt: string
  trigger: string
  reason: string
}): Promise<void> {
  const previousResult = await getSyncMetaFresh(
    MARKET_DIGEST_LAST_RESULT_KEY,
  ).catch(() => null)
  await setSyncMetaDurable(
    MARKET_DIGEST_LAST_ATTEMPT_KEY,
    args.startedAt,
  ).catch(() => {})
  await recordMarketDigestOutcome({
    startedAt: args.startedAt,
    trigger: args.trigger,
    previousResult,
    result: { ok: false, skipped: true, reason: args.reason },
  })
}

/**
 * One durable line for "what happened last time", plus a History row for
 * everything except a skip we have already reported. Repeat skips are stamped but
 * not audited: the dense alarm would otherwise write the same "disabled in admin"
 * row every thirty minutes and bury the real events.
 */
async function recordMarketDigestOutcome(args: {
  startedAt: string
  trigger: string
  previousResult: string | null
  result: MarketDigestSendResult
}): Promise<void> {
  const { startedAt, trigger, previousResult, result } = args
  const finishedAt = new Date().toISOString()
  const outcome = result.skipped
    ? `skipped: ${result.reason ?? 'no reason given'}`
    : result.ok
      ? `sent: ${result.to ?? 'recipient'} (week ${result.weekKey ?? 'unknown'})`
      : `failed: ${result.reason ?? 'unknown error'}`
  const line = `${finishedAt} · ${trigger} · ${outcome}`

  await setSyncMetaDurable(MARKET_DIGEST_LAST_RESULT_KEY, line).catch(() => {})

  const repeatSkip =
    result.skipped === true &&
    typeof previousResult === 'string' &&
    previousResult.endsWith(outcome)
  if (repeatSkip) return

  const { recordDashboardSyncAudit } = await import('@/lib/db/listings-repo')
  await recordDashboardSyncAudit({
    startedAt,
    finishedAt,
    syncSuffix: 'digest',
    listingsCount: 0,
    ok: result.ok && !result.skipped,
    detail: result.skipped
      ? `Market brief skipped (${trigger}) — ${result.reason ?? 'no reason given'}`
      : result.ok
        ? `Market brief sent to ${result.to ?? 'recipient'}${
            result.subject ? ` — ${result.subject}` : ''
          }`
        : `Market brief failed (${trigger}) — ${result.reason ?? 'unknown error'}`,
  }).catch((err) => {
    console.warn('[market-digest] could not record History row', err)
  })
}

/**
 * When `force` is false, skips if disabled, already sent this ET week, or no API key.
 * Admin "Send test now" uses `force: true` (does not stamp the week).
 * Admin Syncs Run uses `force: true, stampWeek: true` so the watermark advances.
 *
 * Scheduled sends take a durable lock so the every-30m thin cron and the Railway
 * sweep cannot overlap and Resend the same brief twice.
 */
async function runMarketDigestSend(
  opts?: MarketDigestSendOptions,
): Promise<MarketDigestSendResult> {
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
    const from = resendFrom('TMRE Market Brief')

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
