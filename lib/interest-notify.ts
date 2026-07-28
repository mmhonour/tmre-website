import 'server-only'

import { SITE_URL } from '@/lib/business-info'

const RESEND_TIMEOUT_MS = 10_000

/** Confirm to the visitor that their I'm interested note was received. */
export async function notifyInterestConfirmation(opts: {
  to: string
  name: string
  listingInfo?: string | null
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY?.trim()
  if (!apiKey) return false
  const from =
    process.env.CONTACT_FROM_EMAIL?.trim() ||
    'TMRE <notifications@tmre-website.com>'
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
        subject: opts.listingInfo
          ? `We got your interest — ${opts.listingInfo}`
          : 'We got your message',
        text: [
          `Hi ${opts.name.split(/\s+/)[0] || 'there'},`,
          '',
          opts.listingInfo
            ? `Thanks for your interest in ${opts.listingInfo}. Timothy will follow up shortly.`
            : 'Thanks for reaching out. Timothy will follow up shortly.',
          '',
          `Optional passwordless sign-in (manage alerts next time): ${SITE_URL}/login`,
          '',
          '— TMRE',
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
