/**
 * Single owner of the outbound From address.
 *
 * Resend refuses any sending domain that is not verified on the account, and it
 * refuses it at send time — so a wrong default does not fail at the button that
 * asked for the mail, it fails afterwards, inside whatever job is doing the
 * sending. From the operator's side the button says "queued" and the email
 * simply never arrives.
 *
 * Eight senders used to carry their own default of `notifications@tmre-website.com`,
 * which is not a domain on the account at all — only `tmrebuilder.com` is
 * verified. Any environment missing CONTACT_FROM_EMAIL therefore had every
 * digest, alert, contact reply and login email rejected 403. The default lives
 * here now so there is one place to be right.
 */
const VERIFIED_SENDING_DOMAIN = 'tmrebuilder.com'

/**
 * `CONTACT_FROM_EMAIL` when set (it may carry its own display name), otherwise
 * `label <notifications@tmrebuilder.com>`.
 */
export function resendFrom(label: string): string {
  const configured = process.env.CONTACT_FROM_EMAIL?.trim()
  if (configured) return configured
  return `${label} <notifications@${VERIFIED_SENDING_DOMAIN}>`
}
