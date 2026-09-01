import 'server-only'

import {
  getDeployNotifyConfigFresh,
  markDeployNotifySent,
} from '@/lib/deploy-notify-config'
import { sendSms } from '@/lib/sms-notify'
import { BRAND_NAME, SITE_URL } from '@/lib/business-info'
import { resendFrom } from '@/lib/resend-from'

const RESEND_TIMEOUT_MS = 15_000

export type DeployNotifyEvent = {
  state: 'ready' | 'error' | 'building' | string
  branch: string | null
  context: string | null
  title: string | null
  commitRef: string | null
  deployUrl: string | null
  adminUrl: string | null
  errorMessage: string | null
  name: string | null
}

export type DeployNotifySendResult = {
  ok: boolean
  skipped?: boolean
  reason?: string
  emailSent?: boolean
  smsSent?: boolean
  subject?: string
  smsBody?: string
}

function shortSha(ref: string | null): string {
  if (!ref?.trim()) return ''
  return ref.trim().slice(0, 7)
}

export function formatDeployNotifyMessage(event: DeployNotifyEvent): {
  subject: string
  text: string
  sms: string
} {
  const ok = event.state === 'ready'
  const branch = event.branch?.trim() || 'unknown'
  const sha = shortSha(event.commitRef)
  const site = event.name?.trim() || BRAND_NAME
  const verb = ok ? 'live' : event.state === 'error' ? 'FAILED' : event.state
  const subject = ok
    ? `${BRAND_NAME} deploy ${verb} (${branch}${sha ? ` · ${sha}` : ''})`
    : `${BRAND_NAME} deploy ${verb} (${branch}${sha ? ` · ${sha}` : ''})`

  const lines = [
    `${site}: production deploy ${verb}`,
    `Branch: ${branch}`,
    sha ? `Commit: ${sha}` : null,
    event.title?.trim() ? `Title: ${event.title.trim()}` : null,
    event.context?.trim() ? `Context: ${event.context.trim()}` : null,
    event.deployUrl?.trim() ? `URL: ${event.deployUrl.trim()}` : `Site: ${SITE_URL}`,
    event.adminUrl?.trim() ? `Netlify: ${event.adminUrl.trim()}` : null,
    !ok && event.errorMessage?.trim()
      ? `Error: ${event.errorMessage.trim().slice(0, 400)}`
      : null,
  ].filter(Boolean) as string[]

  const sms = [
    `${BRAND_NAME} deploy ${verb}`,
    branch + (sha ? ` ${sha}` : ''),
    event.deployUrl?.trim() || SITE_URL,
    !ok && event.errorMessage?.trim()
      ? event.errorMessage.trim().slice(0, 80)
      : null,
  ]
    .filter(Boolean)
    .join(' · ')
    .slice(0, 320)

  return { subject, text: lines.join('\n'), sms }
}

async function sendDeployEmail(to: string, subject: string, text: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY?.trim()
  if (!apiKey) throw new Error('RESEND_API_KEY not set')

  const from = resendFrom('TMRE Deploys')

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
      body: JSON.stringify({ from, to: [to], subject, text }),
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
    throw new Error(`Resend API ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`)
  }
}

/**
 * Notify on a Netlify production deploy (or admin test).
 * Skips non-production / non-main unless `force`.
 */
export async function sendDeployNotify(opts: {
  event: DeployNotifyEvent
  force?: boolean
}): Promise<DeployNotifySendResult> {
  const force = opts.force === true
  const config = await getDeployNotifyConfigFresh()

  if (!force && !config.enabled) {
    return { ok: true, skipped: true, reason: 'deploy notify disabled in admin' }
  }

  const branch = (opts.event.branch ?? '').toLowerCase()
  const context = (opts.event.context ?? '').toLowerCase()
  const isMain = branch === 'main' || branch === 'master'
  const isProduction = context === 'production' || context === '' || force
  if (!force && (!isMain || !isProduction)) {
    return {
      ok: true,
      skipped: true,
      reason: `ignored branch/context (${opts.event.branch ?? '—'} / ${opts.event.context ?? '—'})`,
    }
  }

  const state = (opts.event.state ?? '').toLowerCase()
  if (!force && state !== 'ready' && state !== 'error') {
    return {
      ok: true,
      skipped: true,
      reason: `ignored deploy state ${opts.event.state ?? '—'}`,
    }
  }

  if (!config.emailEnabled && !config.smsEnabled) {
    return { ok: true, skipped: true, reason: 'no channel enabled (email/SMS)' }
  }

  const { subject, text, sms } = formatDeployNotifyMessage(opts.event)
  let emailSent = false
  let smsSent = false
  const errors: string[] = []

  if (config.emailEnabled) {
    try {
      await sendDeployEmail(config.email, force ? `[Test] ${subject}` : subject, text)
      emailSent = true
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err))
    }
  }

  if (config.smsEnabled) {
    if (!config.phone) {
      errors.push('SMS enabled but no phone number saved')
    } else {
      try {
        const result = await sendSms({
          toDigits10: config.phone,
          body: force ? `TEST: ${sms}` : sms,
        })
        if (result.ok) smsSent = true
        else if (result.skipped) errors.push(result.reason ?? 'SMS skipped')
        else errors.push('SMS failed')
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err))
      }
    }
  }

  if (emailSent || smsSent) {
    await markDeployNotifySent()
  }

  if (!emailSent && !smsSent) {
    return {
      ok: false,
      skipped: errors.some((e) => /not set/i.test(e)),
      reason: errors.join('; ') || 'nothing sent',
      emailSent,
      smsSent,
      subject,
      smsBody: sms,
    }
  }

  return {
    ok: errors.length === 0,
    reason: errors.length ? errors.join('; ') : undefined,
    emailSent,
    smsSent,
    subject,
    smsBody: sms,
  }
}

/** Parse Netlify outbound webhook JSON into a DeployNotifyEvent. */
export function parseNetlifyDeployPayload(body: unknown): DeployNotifyEvent {
  const o =
    body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  const str = (k: string) =>
    typeof o[k] === 'string' ? (o[k] as string) : null
  return {
    state: str('state') ?? 'unknown',
    branch: str('branch'),
    context: str('context'),
    title: str('title'),
    commitRef: str('commit_ref') ?? str('commit_hash'),
    deployUrl: str('ssl_url') ?? str('deploy_ssl_url') ?? str('url'),
    adminUrl: str('admin_url'),
    errorMessage: str('error_message'),
    name: str('name'),
  }
}
