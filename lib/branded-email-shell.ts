import 'server-only'

import {
  absoluteUrl,
  AGENT_MLS_ID,
  AGENT_NAME,
  BRAND_IMAGE_PATH,
  BRAND_NAME,
  SITE_URL,
} from '@/lib/business-info'
import {
  MARKET_PULSE_FONT_OPTIONS,
  type MarketPulseFontId,
  type MarketPulseTheme,
} from '@/lib/page-theme-shared'

/** Pre-baked B&W thumbnail — email clients ignore CSS `filter: grayscale`. */
const HEADSHOT_PATH = '/timothy-tmre-bw.png'

export function escapeEmailHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Email-safe stacks from Admin → Page Styles font ids. */
export function emailFontStack(id: MarketPulseFontId): string {
  const label = MARKET_PULSE_FONT_OPTIONS[id].label
  if (id === 'serif') {
    return `'${label}', Georgia, 'Times New Roman', Times, serif`
  }
  if (id === 'mono') {
    return `'${label}', ui-monospace, Consolas, 'Courier New', monospace`
  }
  return `'${label}', 'Segoe UI', system-ui, -apple-system, Helvetica, Arial, sans-serif`
}

export function brandedEmailGoogleFontsLink(): string {
  return `<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500&family=Playfair+Display:wght@500;600&display=swap" rel="stylesheet" />`
}

export type BrandedEmailHeaderOptions = {
  /** When false, omit the camera/brand mark (What if emails). Default true. */
  showLogo?: boolean
  /** Display size for the agent headshot (linked to full-res asset). Default 44. */
  headshotSize?: number
}

export function brandedEmailHeader(
  theme: MarketPulseTheme,
  eyebrow: string,
  opts: BrandedEmailHeaderOptions = {},
): string {
  const showLogo = opts.showLogo !== false
  const headshotSize = opts.headshotSize ?? 44
  const heading = emailFontStack(theme.headingFont)
  const mono = emailFontStack(theme.monoFont)
  const logo = absoluteUrl(BRAND_IMAGE_PATH)
  const headshot = absoluteUrl(HEADSHOT_PATH)
  const aboutHref = absoluteUrl('/about')
  const logoCell = showLogo
    ? `<td align="right" style="vertical-align:middle;width:56px;">
              <a href="${escapeEmailHtml(SITE_URL)}" style="text-decoration:none;">
                <img src="${escapeEmailHtml(logo)}" alt="${escapeEmailHtml(BRAND_NAME)} logo" width="48" height="48" style="display:block;width:48px;height:48px;border:0;" />
              </a>
            </td>`
    : ''
  return `
    <tr>
      <td style="padding:20px 22px 18px 22px;background-color:${theme.surface};">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
          <tr>
            <td style="vertical-align:middle;width:${headshotSize + 8}px;">
              <a href="${escapeEmailHtml(aboutHref)}" style="text-decoration:none;" title="Full-resolution photo">
                <img src="${escapeEmailHtml(headshot)}" alt="${escapeEmailHtml(AGENT_NAME)}" width="${headshotSize}" height="${headshotSize}" style="display:block;width:${headshotSize}px;height:${headshotSize}px;border-radius:8px;border:1px solid ${theme.accent};object-fit:cover;" />
              </a>
            </td>
            <td style="vertical-align:middle;padding-left:12px;">
              <a href="${escapeEmailHtml(SITE_URL)}" style="font-family:${heading};font-size:22px;letter-spacing:0.15em;color:#FFFFFF;text-decoration:none;">${escapeEmailHtml(BRAND_NAME)}</a>
              <p style="margin:4px 0 0 0;font-family:${mono};font-size:10px;letter-spacing:0.16em;text-transform:uppercase;color:${theme.accent};">${escapeEmailHtml(eyebrow)}</p>
            </td>
            ${logoCell}
          </tr>
        </table>
      </td>
    </tr>`
}

export function brandedEmailFooter(
  theme: MarketPulseTheme,
  brokerage: string,
  extraLinks?: { href: string; label: string }[],
): string {
  const body = emailFontStack(theme.bodyFont)
  const mono = emailFontStack(theme.monoFont)
  const links = [
    { href: absoluteUrl('/latest'), label: 'Latest' },
    { href: absoluteUrl('/privacy'), label: 'Privacy' },
    ...(extraLinks ?? []),
  ]
  const linkHtml = links
    .map(
      (l, i) =>
        `${i > 0 ? ' · ' : ''}<a href="${escapeEmailHtml(l.href)}" style="color:rgba(255,255,255,0.45);text-decoration:underline;">${escapeEmailHtml(l.label)}</a>`,
    )
    .join('')

  return `
    <tr>
      <td style="padding:20px 22px;background-color:${theme.surfaceDeep};border-top:1px solid rgba(255,255,255,0.08);">
        <p style="margin:0 0 10px 0;font-family:${mono};font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:${theme.accent};">
          <a href="${escapeEmailHtml(SITE_URL)}" style="color:${theme.accent};text-decoration:none;">${escapeEmailHtml(BRAND_NAME)}</a>
        </p>
        <p style="margin:0;font-family:${body};font-size:11px;line-height:1.5;color:rgba(255,255,255,0.45);">
          ${escapeEmailHtml(AGENT_NAME)} (MLS #${escapeEmailHtml(AGENT_MLS_ID)}) is a licensed real estate agent
          affiliated with ${escapeEmailHtml(brokerage)}. Equal Housing Opportunity.
        </p>
        <p style="margin:12px 0 0 0;font-family:${mono};font-size:10px;color:rgba(255,255,255,0.28);">
          ${linkHtml}
        </p>
      </td>
    </tr>`
}

export function brandedEmailWrap(opts: {
  theme: MarketPulseTheme
  title: string
  eyebrow: string
  brokerage: string
  bodyRowsHtml: string
  extraFooterLinks?: { href: string; label: string }[]
  header?: BrandedEmailHeaderOptions
}): string {
  const { theme } = opts
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeEmailHtml(opts.title)}</title>
  ${brandedEmailGoogleFontsLink()}
</head>
<body style="margin:0;padding:0;background-color:${theme.pageBackground};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${theme.pageBackground};">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background-color:${theme.cardBackground};border-collapse:collapse;">
          ${brandedEmailHeader(theme, opts.eyebrow, opts.header)}
          ${opts.bodyRowsHtml}
          ${brandedEmailFooter(theme, opts.brokerage, opts.extraFooterLinks)}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}
