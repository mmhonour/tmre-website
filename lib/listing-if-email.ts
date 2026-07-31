import 'server-only'

import { absoluteUrl, AGENT_MLS_ID, AGENT_NAME, SITE_URL } from '@/lib/business-info'
import { getBrokerageNameFresh } from '@/lib/brokerage-config'
import {
  brandedEmailWrap,
  emailFontStack,
  escapeEmailHtml,
} from '@/lib/branded-email-shell'
import {
  getContactNotifyEmailFresh,
  isValidEmail,
} from '@/lib/contact-notify-config'
import { fetchListingIfPayload } from '@/lib/listing-if-cache'
import {
  ensureMidpointAggregates,
  fmtIfRentMoney,
  fmtIfSaleMoney,
  IF_DEFAULT_MIDPOINT_METHOD,
  IF_MIDPOINT_METHOD_LABELS,
  IF_MIDPOINT_METHODS,
  roundIfRentHigh,
  roundIfRentLow,
  roundIfRentMidpoint,
  scenarioWithMidpointMethod,
  type IfMidpointMethod,
  type IfScenario,
  type ListingIfPayload,
} from '@/lib/listing-if-estimates'
import { listingSectionHref } from '@/lib/listing-url'
import { readListingFromDbByMlsId } from '@/lib/listings-store'
import { getMarketPulseThemeFresh } from '@/lib/page-theme-config'
import type { MarketPulseTheme } from '@/lib/page-theme-shared'

const RESEND_TIMEOUT_MS = 10_000
const MAX_COMPS_IN_EMAIL = 6

export type ListingIfEmailKind = 'sale' | 'rent'

export type SendListingIfEmailInput = {
  mlsId: string
  to: string
  kinds: ListingIfEmailKind[]
  midpointMethod?: IfMidpointMethod
}

function parseMidpointMethod(raw: unknown): IfMidpointMethod {
  if (
    typeof raw === 'string' &&
    (IF_MIDPOINT_METHODS as readonly string[]).includes(raw)
  ) {
    return raw as IfMidpointMethod
  }
  return IF_DEFAULT_MIDPOINT_METHOD
}

function fmtPpsf(amount: number, sqft: number, kind: ListingIfEmailKind): string {
  const ppsf = amount / sqft
  if (kind === 'rent') return `$${ppsf.toFixed(2)}/sqft`
  return `$${Math.round(ppsf).toLocaleString('en-US')}/sqft`
}

function scenarioBlockHtml(
  title: string,
  scenario: IfScenario,
  kind: ListingIfEmailKind,
  theme: MarketPulseTheme,
): string {
  const heading = emailFontStack(theme.headingFont)
  const body = emailFontStack(theme.bodyFont)
  const mono = emailFontStack(theme.monoFont)
  const method = scenario.math.midpointMethod
  const methodLabel = IF_MIDPOINT_METHOD_LABELS[method]
  const sqft = scenario.math.subjectSqft ?? scenario.params.sqft

  if (scenario.amount == null) {
    return `
      <tr><td style="padding:0 0 18px 0;">
        <p style="margin:0 0 6px 0;font-family:${mono};font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:${theme.accent};">${escapeEmailHtml(title)}</p>
        <p style="margin:0;font-family:${body};font-size:14px;color:${theme.mutedText};">Not enough comps to estimate this scenario yet.</p>
      </td></tr>`
  }

  const mid =
    kind === 'rent'
      ? `${fmtIfRentMoney(roundIfRentMidpoint(scenario.amount))}/mo`
      : fmtIfSaleMoney(scenario.amount)
  const low =
    kind === 'rent' && scenario.amountLow != null
      ? fmtIfRentMoney(roundIfRentLow(scenario.amountLow))
      : scenario.amountLow != null
        ? fmtIfSaleMoney(scenario.amountLow)
        : '—'
  const high =
    kind === 'rent' && scenario.amountHigh != null
      ? fmtIfRentMoney(roundIfRentHigh(scenario.amountHigh))
      : scenario.amountHigh != null
        ? fmtIfSaleMoney(scenario.amountHigh)
        : '—'
  const ppsf =
    sqft != null && sqft > 0 ? fmtPpsf(scenario.amount, sqft, kind) : null

  const comps = scenario.comps.slice(0, MAX_COMPS_IN_EMAIL)
  const compRows =
    comps.length === 0
      ? `<p style="margin:8px 0 0 0;font-family:${body};font-size:13px;color:${theme.mutedText};">No comps listed.</p>`
      : `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-top:10px;">
          ${comps
            .map((c) => {
              const price =
                c.price != null
                  ? kind === 'rent'
                    ? fmtIfRentMoney(c.price)
                    : fmtIfSaleMoney(c.price)
                  : '—'
              const role = c.role === 'sold' ? (kind === 'rent' ? 'Rented' : 'Sold') : 'Active'
              const href = absoluteUrl(
                listingSectionHref(c.listingKey || c.mlsId, 'overview'),
              )
              return `<tr>
                <td style="padding:6px 0;border-top:1px solid #E2E6EE;font-family:${body};font-size:13px;color:${theme.text};">
                  <a href="${escapeEmailHtml(href)}" style="color:${theme.text};text-decoration:underline;">${escapeEmailHtml(c.address)}</a>
                  <span style="color:${theme.mutedText};"> · ${escapeEmailHtml(role)} · ${escapeEmailHtml(price)}</span>
                </td>
              </tr>`
            })
            .join('')}
        </table>`

  return `
    <tr><td style="padding:0 0 20px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;border:1px solid #E2E6EE;background-color:${theme.cardBackground};">
        <tr>
          <td style="padding:16px 18px;">
            <p style="margin:0 0 4px 0;font-family:${mono};font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:${theme.accent};">${escapeEmailHtml(title)}</p>
            <p style="margin:0 0 6px 0;font-family:${heading};font-size:26px;line-height:1.2;color:${theme.text};">${escapeEmailHtml(mid)}</p>
            <p style="margin:0 0 4px 0;font-family:${mono};font-size:12px;color:${theme.mutedText};">
              Range ${escapeEmailHtml(low)} – ${escapeEmailHtml(high)}
              · Midpoint via ${escapeEmailHtml(methodLabel)}
              ${ppsf ? ` · ${escapeEmailHtml(ppsf)}` : ''}
            </p>
            <p style="margin:0;font-family:${body};font-size:12px;color:${theme.mutedText};">
              Based on ${scenario.soldCount} ${kind === 'rent' ? 'rented' : 'sold'}
              + ${scenario.activeCount} active comps
              ${sqft != null && sqft > 0 ? ` · ${sqft.toLocaleString('en-US')} sqft` : ''}
            </p>
            ${compRows}
          </td>
        </tr>
      </table>
    </td></tr>`
}

function formatListingIfEmailHtml(opts: {
  theme: MarketPulseTheme
  brokerage: string
  addressLabel: string
  mlsId: string
  pageHref: string
  midpointMethod: IfMidpointMethod
  scenarios: { kind: ListingIfEmailKind; scenario: IfScenario }[]
}): string {
  const heading = emailFontStack(opts.theme.headingFont)
  const body = emailFontStack(opts.theme.bodyFont)
  const mono = emailFontStack(opts.theme.monoFont)
  const methodLabel = IF_MIDPOINT_METHOD_LABELS[opts.midpointMethod]

  const scenarioHtml = opts.scenarios
    .map(({ kind, scenario }) =>
      scenarioBlockHtml(
        kind === 'sale' ? 'If you sell' : 'If you rent',
        scenario,
        kind,
        opts.theme,
      ),
    )
    .join('')

  const bodyRows = `
    <tr>
      <td style="padding:22px 22px 8px 22px;">
        <p style="margin:0 0 6px 0;font-family:${mono};font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:${opts.theme.accent};">What if scenario</p>
        <p style="margin:0 0 8px 0;font-family:${heading};font-size:22px;line-height:1.25;color:${opts.theme.text};">${escapeEmailHtml(opts.addressLabel)}</p>
        <p style="margin:0 0 16px 0;font-family:${body};font-size:14px;color:${opts.theme.mutedText};">
          MLS #${escapeEmailHtml(opts.mlsId)} · Midpoint method: ${escapeEmailHtml(methodLabel)}
        </p>
        <p style="margin:0 0 18px 0;">
          <a href="${escapeEmailHtml(opts.pageHref)}" style="display:inline-block;padding:10px 16px;background-color:${opts.theme.accent};color:${opts.theme.surfaceDeep};font-family:${mono};font-size:11px;letter-spacing:0.14em;text-transform:uppercase;text-decoration:none;border-radius:999px;">Open on TMRE</a>
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding:0 22px 8px 22px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
          ${scenarioHtml}
        </table>
      </td>
    </tr>`

  return brandedEmailWrap({
    theme: opts.theme,
    title: `What if — ${opts.addressLabel}`,
    eyebrow: 'What if',
    brokerage: opts.brokerage,
    bodyRowsHtml: bodyRows,
    extraFooterLinks: [{ href: opts.pageHref, label: 'View scenario' }],
  })
}

function formatListingIfEmailText(opts: {
  addressLabel: string
  mlsId: string
  pageHref: string
  midpointMethod: IfMidpointMethod
  brokerage: string
  scenarios: { kind: ListingIfEmailKind; scenario: IfScenario }[]
}): string {
  const methodLabel = IF_MIDPOINT_METHOD_LABELS[opts.midpointMethod]
  const lines: string[] = [
    `What if — ${opts.addressLabel}`,
    `MLS #${opts.mlsId}`,
    `Midpoint method: ${methodLabel}`,
    `Open: ${opts.pageHref}`,
    '',
  ]

  for (const { kind, scenario } of opts.scenarios) {
    const title = kind === 'sale' ? 'IF YOU SELL' : 'IF YOU RENT'
    lines.push(title)
    if (scenario.amount == null) {
      lines.push('Not enough comps yet.', '')
      continue
    }
    const mid =
      kind === 'rent'
        ? `${fmtIfRentMoney(roundIfRentMidpoint(scenario.amount))}/mo`
        : fmtIfSaleMoney(scenario.amount)
    const low =
      kind === 'rent' && scenario.amountLow != null
        ? fmtIfRentMoney(roundIfRentLow(scenario.amountLow))
        : scenario.amountLow != null
          ? fmtIfSaleMoney(scenario.amountLow)
          : '—'
    const high =
      kind === 'rent' && scenario.amountHigh != null
        ? fmtIfRentMoney(roundIfRentHigh(scenario.amountHigh))
        : scenario.amountHigh != null
          ? fmtIfSaleMoney(scenario.amountHigh)
          : '—'
    lines.push(`Midpoint: ${mid}`, `Range: ${low} – ${high}`)
    for (const c of scenario.comps.slice(0, MAX_COMPS_IN_EMAIL)) {
      lines.push(
        `  • ${c.address} (${c.role}) ${c.price != null ? (kind === 'rent' ? fmtIfRentMoney(c.price) : fmtIfSaleMoney(c.price)) : ''}`,
      )
    }
    lines.push('')
  }

  lines.push(
    `${AGENT_NAME} (MLS #${AGENT_MLS_ID}) is a licensed real estate agent affiliated with ${opts.brokerage}.`,
    SITE_URL,
  )
  return lines.join('\n')
}

function applyMethod(
  payload: ListingIfPayload,
  kind: ListingIfEmailKind,
  method: IfMidpointMethod,
): IfScenario {
  const base = kind === 'sale' ? payload.sale : payload.rent
  return scenarioWithMidpointMethod(ensureMidpointAggregates(base), method)
}

function dbUnavailableMessage(err: unknown): string | null {
  const msg = err instanceof Error ? err.message : String(err ?? '')
  const code =
    err && typeof err === 'object' && 'code' in err
      ? String((err as { code?: unknown }).code ?? '')
      : ''
  if (
    code === 'ECONNREFUSED' ||
    /ECONNREFUSED|connect.*5432|Postgres is unavailable/i.test(msg) ||
    (err instanceof AggregateError &&
      err.errors.some((e) => dbUnavailableMessage(e)))
  ) {
    return 'Database unavailable — start local Postgres or point DATABASE_URL at Neon, then retry.'
  }
  return null
}

function resendErrorMessage(status: number, detail: string): string {
  try {
    const parsed = JSON.parse(detail) as {
      message?: string
      name?: string
    }
    if (parsed.message?.trim()) {
      return `Email provider rejected the send: ${parsed.message.trim()}`
    }
  } catch {
    // plain text body
  }
  const trimmed = detail.trim().slice(0, 240)
  if (trimmed) return `Email provider rejected the send (${status}): ${trimmed}`
  return `Email provider rejected the send (${status})`
}

async function postResendEmail(
  apiKey: string,
  body: Record<string, unknown>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), RESEND_TIMEOUT_MS)
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      console.error('[listing-if-email] Resend failed', res.status, detail)
      return { ok: false, error: resendErrorMessage(res.status, detail) }
    }
    return { ok: true }
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') {
      return { ok: false, error: 'Email request timed out' }
    }
    console.error('[listing-if-email] Resend request failed', err)
    return { ok: false, error: 'Failed to reach email provider' }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Email a What if scenario (sale / rent / both). BCC goes to Admin contact
 * notify email. HTML uses Admin → Page Styles theme colors/fonts.
 */
export async function sendListingIfEmail(
  input: SendListingIfEmailInput,
): Promise<{ ok: true; bcc: string | null } | { ok: false; error: string }> {
  try {
    const mlsId = input.mlsId.trim()
    const to = input.to.trim()
    if (!mlsId) return { ok: false, error: 'Listing id required' }
    if (!isValidEmail(to)) {
      return { ok: false, error: 'Valid recipient email required' }
    }

    const kinds = Array.from(
      new Set(
        (input.kinds ?? []).filter(
          (k): k is ListingIfEmailKind => k === 'sale' || k === 'rent',
        ),
      ),
    )
    if (kinds.length === 0) {
      return { ok: false, error: 'Select at least one scenario (sale or rent)' }
    }

    const midpointMethod = parseMidpointMethod(input.midpointMethod)
    const apiKey = process.env.RESEND_API_KEY?.trim()
    if (!apiKey) {
      return { ok: false, error: 'Email delivery is not configured (RESEND_API_KEY)' }
    }

    let listing: Awaited<ReturnType<typeof readListingFromDbByMlsId>>['listing']
    let payload: Awaited<ReturnType<typeof fetchListingIfPayload>>
    let theme: Awaited<ReturnType<typeof getMarketPulseThemeFresh>>
    let brokerage: string
    let agentEmail: string
    try {
      ;[{ listing }, payload, theme, brokerage, agentEmail] = await Promise.all([
        readListingFromDbByMlsId(mlsId),
        fetchListingIfPayload(mlsId),
        getMarketPulseThemeFresh(),
        getBrokerageNameFresh(),
        getContactNotifyEmailFresh(),
      ])
    } catch (err) {
      const dbMsg = dbUnavailableMessage(err)
      if (dbMsg) {
        console.error('[listing-if-email] database unavailable', err)
        return { ok: false, error: dbMsg }
      }
      throw err
    }

    if (!listing || !payload) {
      return { ok: false, error: 'Listing or What if estimate not found' }
    }

    const address =
      listing.address?.street?.trim() ||
      listing.address?.full?.trim() ||
      `MLS #${listing.mlsId}`
    const town = listing.address?.city?.trim() || null
    const addressLabel = town ? `${address}, ${town}` : address
    const pageHref = absoluteUrl(
      listingSectionHref(listing.mlsId, 'if', address, town),
    )

    const scenarios = kinds.map((kind) => ({
      kind,
      scenario: applyMethod(payload, kind, midpointMethod),
    }))

    const html = formatListingIfEmailHtml({
      theme,
      brokerage,
      addressLabel,
      mlsId: listing.mlsId,
      pageHref,
      midpointMethod,
      scenarios,
    })
    const text = formatListingIfEmailText({
      addressLabel,
      mlsId: listing.mlsId,
      pageHref,
      midpointMethod,
      brokerage,
      scenarios,
    })

    const from =
      process.env.CONTACT_FROM_EMAIL?.trim() ||
      'TMRE Website <notifications@tmrebuilder.com>'
    const subject = `What if — ${addressLabel}`

    const bcc =
      isValidEmail(agentEmail) &&
      agentEmail.trim().toLowerCase() !== to.toLowerCase()
        ? agentEmail.trim()
        : null

    const baseBody: Record<string, unknown> = {
      from,
      to: [to],
      subject,
      text,
      html,
    }

    if (bcc) {
      const withBcc = await postResendEmail(apiKey, { ...baseBody, bcc: [bcc] })
      if (withBcc.ok) return { ok: true, bcc }
      console.warn(
        '[listing-if-email] send with BCC failed; retrying without BCC',
        withBcc.error,
      )
      const withoutBcc = await postResendEmail(apiKey, baseBody)
      if (withoutBcc.ok) {
        return { ok: true, bcc: null }
      }
      return withoutBcc
    }

    const sent = await postResendEmail(apiKey, baseBody)
    if (!sent.ok) return sent
    return { ok: true, bcc: null }
  } catch (err) {
    const dbMsg = dbUnavailableMessage(err)
    if (dbMsg) {
      console.error('[listing-if-email] database unavailable', err)
      return { ok: false, error: dbMsg }
    }
    console.error('[listing-if-email] unexpected failure', err)
    return {
      ok: false,
      error:
        err instanceof Error && err.message
          ? `Failed to send email: ${err.message}`
          : 'Failed to send email',
    }
  }
}
