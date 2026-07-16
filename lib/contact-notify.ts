import { getContactNotifyEmailFresh } from '@/lib/contact-notify-config'

// Hard cap so a slow/unreachable Resend endpoint can never hang the request
// (and therefore the submitting form) indefinitely.
const RESEND_TIMEOUT_MS = 10_000

export type ContactNotifyPayload = {
  name: string
  phone: string | null
  email: string
  source: string
  listingInfo?: string | null
  address?: string | null
}

/**
 * Best-effort agent notification via Resend. Returns `true` when an email was
 * actually accepted by Resend, `false` when skipped (no API key). Throws only
 * on a real delivery failure so callers can log it — callers should NOT block
 * the user's success response on this.
 */
export async function notifyContactByEmail(
  payload: ContactNotifyPayload,
): Promise<boolean> {
  const to = await getContactNotifyEmailFresh()
  const apiKey = process.env.RESEND_API_KEY?.trim()
  if (!apiKey) {
    console.warn('[contact-notify] RESEND_API_KEY not set; email not sent')
    return false
  }

  const from =
    process.env.CONTACT_FROM_EMAIL?.trim() || 'TMRE Website <notifications@tmre-website.com>'
  const subject = payload.listingInfo
    ? `Listing inquiry — ${payload.listingInfo}`
    : payload.source === 'list-with-me'
      ? `List With Me — ${payload.name}`
      : `Contact from ${payload.name}`

  const lines = [
    `Name: ${payload.name}`,
    `Email: ${payload.email}`,
    payload.phone ? `Phone: ${payload.phone}` : null,
    `Source: ${payload.source}`,
    payload.listingInfo ? `Listing: ${payload.listingInfo}` : null,
    payload.address ? `Property / notes:\n${payload.address}` : null,
    '',
    '— Sent from tmre-website contact form',
  ].filter(Boolean)

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
        to: [to],
        reply_to: payload.email,
        subject,
        text: lines.join('\n'),
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
  return true
}
