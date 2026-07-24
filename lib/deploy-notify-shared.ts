/** Client-safe deploy notification config (Admin → Site). */

export type DeployNotifyConfig = {
  enabled: boolean
  /** Send Resend email when a production deploy finishes. */
  emailEnabled: boolean
  /** Send Twilio SMS when a production deploy finishes. */
  smsEnabled: boolean
  email: string
  /** Raw 10-digit US phone for SMS, or empty. */
  phone: string
  /** Pretty display for the phone field. */
  phoneDisplay: string
  lastNotifiedAt: string | null
  defaultEmail: string
  defaultPhone: string
  defaultPhoneDisplay: string
  /** True when RESEND_API_KEY is present in this process. */
  resendConfigured: boolean
  /** True when Twilio account + from number env vars are present. */
  twilioConfigured: boolean
  /** Public webhook path Netlify should POST to. */
  webhookPath: string
}

export const DEPLOY_NOTIFY_WEBHOOK_PATH = '/api/webhooks/netlify-deploy'
