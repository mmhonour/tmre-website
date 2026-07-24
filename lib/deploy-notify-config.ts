import 'server-only'

import { formatPhoneDisplay, normalizePhoneDigits } from '@/lib/business-info'
import {
  DEFAULT_CONTACT_NOTIFY_EMAIL,
  getContactNotifyEmail,
  getContactNotifyEmailFresh,
  isValidEmail,
} from '@/lib/contact-notify-config'
import { getSyncMeta as getSyncMetaFresh } from '@/lib/db/sync-meta'
import { getSyncMeta, setSyncMetaDurable } from '@/lib/db/sync-meta-store'
import {
  DEFAULT_CONTACT_PHONE_DIGITS,
  getContactPhoneDigits,
  getContactPhoneFresh,
} from '@/lib/phone-config'
import { isTwilioConfigured } from '@/lib/sms-notify'
import {
  DEPLOY_NOTIFY_WEBHOOK_PATH,
  type DeployNotifyConfig,
} from '@/lib/deploy-notify-shared'

export type { DeployNotifyConfig } from '@/lib/deploy-notify-shared'
export { DEPLOY_NOTIFY_WEBHOOK_PATH } from '@/lib/deploy-notify-shared'

export const DEPLOY_NOTIFY_ENABLED_KEY = 'deploy_notify_enabled'
export const DEPLOY_NOTIFY_EMAIL_ENABLED_KEY = 'deploy_notify_email_enabled'
export const DEPLOY_NOTIFY_SMS_ENABLED_KEY = 'deploy_notify_sms_enabled'
export const DEPLOY_NOTIFY_EMAIL_KEY = 'deploy_notify_email'
export const DEPLOY_NOTIFY_PHONE_KEY = 'deploy_notify_phone'
export const DEPLOY_NOTIFY_LAST_SENT_KEY = 'deploy_notify_last_sent_at'

function parseEnabled(raw: string | null | undefined, defaultValue: boolean): boolean {
  if (raw == null || raw === '') return defaultValue
  return raw !== '0' && raw.toLowerCase() !== 'false'
}

function resolveEmail(raw: string | null | undefined, fallback: string): string {
  if (raw && isValidEmail(raw)) return raw.trim()
  return fallback
}

function resolvePhone(raw: string | null | undefined, fallback: string): string {
  if (raw) {
    const digits = normalizePhoneDigits(raw)
    if (digits.length === 10) return digits
  }
  const fb = normalizePhoneDigits(fallback)
  return fb.length === 10 ? fb : ''
}

function resendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim())
}

function buildConfig(input: {
  emailRaw: string | null | undefined
  phoneRaw: string | null | undefined
  enabledRaw: string | null | undefined
  emailEnabledRaw: string | null | undefined
  smsEnabledRaw: string | null | undefined
  lastSent: string | null | undefined
  emailFallback: string
  phoneFallback: string
}): DeployNotifyConfig {
  const phone = resolvePhone(input.phoneRaw, input.phoneFallback)
  const defaultPhone = normalizePhoneDigits(input.phoneFallback)
  return {
    enabled: parseEnabled(input.enabledRaw, true),
    // Prefer SMS when both are on; email still available as backup.
    emailEnabled: parseEnabled(input.emailEnabledRaw, false),
    smsEnabled: parseEnabled(input.smsEnabledRaw, true),
    email: resolveEmail(input.emailRaw, input.emailFallback),
    phone,
    phoneDisplay: phone ? formatPhoneDisplay(phone) : '',
    lastNotifiedAt: input.lastSent?.trim() || null,
    defaultEmail: DEFAULT_CONTACT_NOTIFY_EMAIL,
    defaultPhone: defaultPhone.length === 10 ? defaultPhone : DEFAULT_CONTACT_PHONE_DIGITS,
    defaultPhoneDisplay: formatPhoneDisplay(
      defaultPhone.length === 10 ? defaultPhone : DEFAULT_CONTACT_PHONE_DIGITS,
    ),
    resendConfigured: resendConfigured(),
    twilioConfigured: isTwilioConfigured(),
    webhookPath: DEPLOY_NOTIFY_WEBHOOK_PATH,
  }
}

export function getDeployNotifyConfig(): DeployNotifyConfig {
  return buildConfig({
    emailRaw: getSyncMeta(DEPLOY_NOTIFY_EMAIL_KEY),
    phoneRaw: getSyncMeta(DEPLOY_NOTIFY_PHONE_KEY),
    enabledRaw: getSyncMeta(DEPLOY_NOTIFY_ENABLED_KEY),
    emailEnabledRaw: getSyncMeta(DEPLOY_NOTIFY_EMAIL_ENABLED_KEY),
    smsEnabledRaw: getSyncMeta(DEPLOY_NOTIFY_SMS_ENABLED_KEY),
    lastSent: getSyncMeta(DEPLOY_NOTIFY_LAST_SENT_KEY),
    emailFallback: getContactNotifyEmail(),
    phoneFallback: getContactPhoneDigits(),
  })
}

export async function getDeployNotifyConfigFresh(): Promise<DeployNotifyConfig> {
  const [emailFallback, phoneFresh] = await Promise.all([
    getContactNotifyEmailFresh(),
    getContactPhoneFresh(),
  ])
  try {
    const [emailRaw, phoneRaw, enabledRaw, emailEnabledRaw, smsEnabledRaw, lastSent] =
      await Promise.all([
        getSyncMetaFresh(DEPLOY_NOTIFY_EMAIL_KEY),
        getSyncMetaFresh(DEPLOY_NOTIFY_PHONE_KEY),
        getSyncMetaFresh(DEPLOY_NOTIFY_ENABLED_KEY),
        getSyncMetaFresh(DEPLOY_NOTIFY_EMAIL_ENABLED_KEY),
        getSyncMetaFresh(DEPLOY_NOTIFY_SMS_ENABLED_KEY),
        getSyncMetaFresh(DEPLOY_NOTIFY_LAST_SENT_KEY),
      ])
    return buildConfig({
      emailRaw,
      phoneRaw,
      enabledRaw,
      emailEnabledRaw,
      smsEnabledRaw,
      lastSent,
      emailFallback,
      phoneFallback: phoneFresh.tel,
    })
  } catch {
    return buildConfig({
      emailRaw: null,
      phoneRaw: null,
      enabledRaw: null,
      emailEnabledRaw: null,
      smsEnabledRaw: null,
      lastSent: null,
      emailFallback,
      phoneFallback: phoneFresh.tel,
    })
  }
}

export async function setDeployNotifyConfig(input: {
  enabled?: boolean
  emailEnabled?: boolean
  smsEnabled?: boolean
  email?: string
  phone?: string
}): Promise<DeployNotifyConfig> {
  if (input.enabled != null) {
    await setSyncMetaDurable(DEPLOY_NOTIFY_ENABLED_KEY, input.enabled ? '1' : '0')
  }
  if (input.emailEnabled != null) {
    await setSyncMetaDurable(
      DEPLOY_NOTIFY_EMAIL_ENABLED_KEY,
      input.emailEnabled ? '1' : '0',
    )
  }
  if (input.smsEnabled != null) {
    await setSyncMetaDurable(DEPLOY_NOTIFY_SMS_ENABLED_KEY, input.smsEnabled ? '1' : '0')
  }
  if (input.email != null) {
    const trimmed = input.email.trim()
    if (!isValidEmail(trimmed)) throw new Error('Invalid email address')
    await setSyncMetaDurable(DEPLOY_NOTIFY_EMAIL_KEY, trimmed)
  }
  if (input.phone != null) {
    const digits = normalizePhoneDigits(input.phone)
    if (digits.length !== 10) {
      throw new Error('A valid 10-digit US phone number is required for SMS')
    }
    await setSyncMetaDurable(DEPLOY_NOTIFY_PHONE_KEY, digits)
  }
  return getDeployNotifyConfigFresh()
}

export async function markDeployNotifySent(): Promise<void> {
  await setSyncMetaDurable(DEPLOY_NOTIFY_LAST_SENT_KEY, new Date().toISOString())
}
