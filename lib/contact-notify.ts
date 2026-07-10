const DEFAULT_NOTIFY_EMAIL = 'tmarks@bhhsne.com'

export type ContactNotifyPayload = {
  name: string
  phone: string | null
  email: string
  source: string
  listingInfo?: string | null
  address?: string | null
}

export async function notifyContactByEmail(payload: ContactNotifyPayload): Promise<void> {
  const to = process.env.CONTACT_NOTIFY_EMAIL?.trim() || DEFAULT_NOTIFY_EMAIL
  const apiKey = process.env.RESEND_API_KEY?.trim()
  if (!apiKey) {
    console.warn('[contact-notify] RESEND_API_KEY not set; email not sent')
    return
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

  const res = await fetch('https://api.resend.com/emails', {
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
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Resend API ${res.status}${detail ? `: ${detail}` : ''}`)
  }
}
