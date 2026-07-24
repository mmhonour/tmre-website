import 'server-only'

/**
 * Twilio SMS helper. Requires:
 *   TWILIO_ACCOUNT_SID
 *   TWILIO_AUTH_TOKEN
 *   TWILIO_FROM_NUMBER  (E.164, e.g. +12035551234)
 *
 * A2P / messaging-service registration is the operator's responsibility.
 */

const TWILIO_TIMEOUT_MS = 15_000

export function isTwilioConfigured(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID?.trim() &&
      process.env.TWILIO_AUTH_TOKEN?.trim() &&
      process.env.TWILIO_FROM_NUMBER?.trim(),
  )
}

/** Normalize 10-digit US to E.164 (+1…). */
export function toE164Us(digits10: string): string {
  const d = digits10.replace(/\D/g, '')
  const ten =
    d.length === 11 && d.startsWith('1') ? d.slice(1) : d.length === 10 ? d : ''
  if (ten.length !== 10) {
    throw new Error('SMS requires a valid 10-digit US phone number')
  }
  return `+1${ten}`
}

export type SendSmsResult = {
  ok: boolean
  skipped?: boolean
  reason?: string
  sid?: string
}

/** Best-effort SMS via Twilio REST. Skips (ok:false, skipped) when not configured. */
export async function sendSms(opts: {
  toDigits10: string
  body: string
}): Promise<SendSmsResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID?.trim()
  const token = process.env.TWILIO_AUTH_TOKEN?.trim()
  const from = process.env.TWILIO_FROM_NUMBER?.trim()
  if (!sid || !token || !from) {
    console.warn('[sms-notify] Twilio env not set; SMS not sent')
    return { ok: false, skipped: true, reason: 'TWILIO_* env not set' }
  }

  const to = toE164Us(opts.toDigits10)
  const body = opts.body.trim().slice(0, 1500)
  if (!body) throw new Error('SMS body is empty')

  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`
  const auth = Buffer.from(`${sid}:${token}`).toString('base64')
  const form = new URLSearchParams({ To: to, From: from, Body: body })

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TWILIO_TIMEOUT_MS)
  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
      signal: controller.signal,
    })
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') {
      throw new Error(`Twilio request timed out after ${TWILIO_TIMEOUT_MS}ms`)
    }
    throw err
  } finally {
    clearTimeout(timer)
  }

  const json = (await res.json().catch(() => null)) as {
    sid?: string
    message?: string
    error_message?: string
  } | null

  if (!res.ok) {
    const detail = json?.error_message || json?.message || ''
    throw new Error(`Twilio API ${res.status}${detail ? `: ${detail}` : ''}`)
  }

  return { ok: true, sid: json?.sid }
}
