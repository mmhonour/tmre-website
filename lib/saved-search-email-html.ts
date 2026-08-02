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

export type SavedSearchEmailListing = {
  mlsId: string
  address: string | null
  town: string | null
  price: number | null
  beds: number | null
  baths: number | null
  href: string
  photoUrl?: string | null
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Email-safe stacks (CSS vars / Next fonts do not apply in clients). */
function emailFontStack(id: MarketPulseFontId): string {
  const label = MARKET_PULSE_FONT_OPTIONS[id].label
  if (id === 'serif') {
    return `'${label}', Georgia, 'Times New Roman', Times, serif`
  }
  if (id === 'mono') {
    return `'${label}', ui-monospace, Consolas, 'Courier New', monospace`
  }
  return `'${label}', 'Segoe UI', system-ui, -apple-system, Helvetica, Arial, sans-serif`
}

function formatPrice(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return 'Price TBD'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n)
}

function absHref(href: string): string {
  if (href.startsWith('http')) return href
  return absoluteUrl(href)
}

function brandHeader(theme: MarketPulseTheme): string {
  const heading = emailFontStack(theme.headingFont)
  const mono = emailFontStack(theme.monoFont)
  const logo = absoluteUrl(BRAND_IMAGE_PATH)
  const headshot = absoluteUrl(HEADSHOT_PATH)
  return `
    <tr>
      <td style="padding:20px 22px 18px 22px;background-color:${theme.surface};">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
          <tr>
            <td style="vertical-align:middle;width:52px;">
              <a href="${escapeHtml(SITE_URL)}" style="text-decoration:none;">
                <img src="${escapeHtml(headshot)}" alt="${escapeHtml(AGENT_NAME)}" width="44" height="44" style="display:block;width:44px;height:44px;border-radius:8px;border:1px solid ${theme.accent};object-fit:cover;" />
              </a>
            </td>
            <td style="vertical-align:middle;padding-left:12px;">
              <a href="${escapeHtml(SITE_URL)}" style="font-family:${heading};font-size:22px;letter-spacing:0.15em;color:#FFFFFF;text-decoration:none;">${escapeHtml(BRAND_NAME)}</a>
              <p style="margin:4px 0 0 0;font-family:${mono};font-size:10px;letter-spacing:0.16em;text-transform:uppercase;color:${theme.accent};">Listing alerts</p>
            </td>
            <td align="right" style="vertical-align:middle;width:56px;">
              <a href="${escapeHtml(SITE_URL)}" style="text-decoration:none;">
                <img src="${escapeHtml(logo)}" alt="${escapeHtml(BRAND_NAME)} logo" width="48" height="48" style="display:block;width:48px;height:48px;border:0;" />
              </a>
            </td>
          </tr>
        </table>
      </td>
    </tr>`
}

function brandFooter(theme: MarketPulseTheme, brokerage: string): string {
  const body = emailFontStack(theme.bodyFont)
  const mono = emailFontStack(theme.monoFont)
  return `
    <tr>
      <td style="padding:20px 22px;background-color:${theme.surfaceDeep};border-top:1px solid rgba(255,255,255,0.08);">
        <p style="margin:0 0 10px 0;font-family:${mono};font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:${theme.accent};">
          <a href="${escapeHtml(SITE_URL)}" style="color:${theme.accent};text-decoration:none;">${escapeHtml(BRAND_NAME)}</a>
        </p>
        <p style="margin:0;font-family:${body};font-size:11px;line-height:1.5;color:rgba(255,255,255,0.45);">
          ${escapeHtml(AGENT_NAME)} (MLS #${escapeHtml(AGENT_MLS_ID)}) is a licensed real estate agent
          affiliated with ${escapeHtml(brokerage)}. Equal Housing Opportunity.
        </p>
        <p style="margin:12px 0 0 0;font-family:${mono};font-size:10px;color:rgba(255,255,255,0.28);">
          <a href="${escapeHtml(absoluteUrl('/latest'))}" style="color:rgba(255,255,255,0.45);text-decoration:underline;">Manage alerts</a>
          ·
          <a href="${escapeHtml(absoluteUrl('/privacy'))}" style="color:rgba(255,255,255,0.45);text-decoration:underline;">Privacy</a>
        </p>
      </td>
    </tr>`
}

function listingRow(
  listing: SavedSearchEmailListing,
  theme: MarketPulseTheme,
): string {
  const heading = emailFontStack(theme.headingFont)
  const mono = emailFontStack(theme.monoFont)
  const href = absHref(listing.href)
  const title = listing.address ?? 'Address TBD'
  const place = listing.town ? ` · ${listing.town}` : ''
  const meta = [
    formatPrice(listing.price),
    listing.beds != null ? `${listing.beds} bd` : null,
    listing.baths != null ? `${listing.baths} ba` : null,
    `MLS #${listing.mlsId}`,
  ]
    .filter(Boolean)
    .join(' · ')

  const thumb = listing.photoUrl
    ? `<td width="96" style="vertical-align:top;padding:0 14px 0 0;">
        <a href="${escapeHtml(href)}" style="text-decoration:none;">
          <img src="${escapeHtml(listing.photoUrl)}" alt="${escapeHtml(title)}" width="96" height="72" style="display:block;width:96px;height:72px;object-fit:cover;border-radius:4px;border:1px solid #E2E6EE;" />
        </a>
      </td>`
    : ''

  return `
    <tr>
      <td style="padding:0 0 16px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;background-color:${theme.cardBackground};border:1px solid #E2E6EE;">
          <tr>
            <td style="padding:12px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
                <tr>
                  ${thumb}
                  <td style="vertical-align:top;">
                    <p style="margin:0 0 4px 0;font-family:${heading};font-size:16px;line-height:1.3;color:${theme.text};">
                      <a href="${escapeHtml(href)}" style="color:${theme.text};text-decoration:none;">${escapeHtml(title)}${escapeHtml(place)}</a>
                    </p>
                    <p style="margin:0 0 10px 0;font-family:${mono};font-size:12px;color:${theme.mutedText};">${escapeHtml(meta)}</p>
                    <a href="${escapeHtml(href)}" style="display:inline-block;padding:8px 14px;background-color:${theme.accent};color:${theme.surfaceDeep};font-family:${mono};font-size:10px;letter-spacing:0.14em;text-transform:uppercase;text-decoration:none;border-radius:999px;">View listing</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>`
}

export function formatSavedSearchMatchesHtml(opts: {
  theme: MarketPulseTheme
  brokerage: string
  criteriaLabel: string
  cadence: string
  searchHref: string
  listings: SavedSearchEmailListing[]
}): string {
  const theme = opts.theme
  const heading = emailFontStack(theme.headingFont)
  const body = emailFontStack(theme.bodyFont)
  const mono = emailFontStack(theme.monoFont)
  const searchUrl = absHref(opts.searchHref)
  const listingBlocks = opts.listings.map((l) => listingRow(l, theme)).join('')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(BRAND_NAME)} listing alert</title>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500&family=Playfair+Display:wght@500;600&display=swap" rel="stylesheet" />
</head>
<body style="margin:0;padding:0;background-color:${theme.pageBackground};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${theme.pageBackground};">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background-color:${theme.cardBackground};border-collapse:collapse;">
          ${brandHeader(theme)}
          <tr>
            <td style="padding:22px 22px 8px 22px;">
              <p style="margin:0 0 8px 0;font-family:${heading};font-size:22px;line-height:1.25;color:${theme.text};">
                ${opts.listings.length === 1 ? 'New match for your search' : `${opts.listings.length} new matches for your search`}
              </p>
              <p style="margin:0 0 6px 0;font-family:${body};font-size:14px;line-height:1.45;color:${theme.mutedText};">
                <a href="${escapeHtml(searchUrl)}" style="color:${theme.text};font-weight:600;text-decoration:underline;">${escapeHtml(opts.criteriaLabel)}</a>
              </p>
              <p style="margin:0 0 18px 0;font-family:${mono};font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:${theme.mutedText};">
                Cadence: ${escapeHtml(opts.cadence)}
                ·
                <a href="${escapeHtml(searchUrl)}" style="color:${theme.accent};text-decoration:none;">Open search</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 22px 8px 22px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
                ${listingBlocks}
              </table>
            </td>
          </tr>
          ${brandFooter(theme, opts.brokerage)}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

export function formatSavedSearchConfirmationHtml(opts: {
  theme: MarketPulseTheme
  brokerage: string
  criteriaLabel: string
  cadenceLabel: string
  searchHref: string
}): string {
  const theme = opts.theme
  const heading = emailFontStack(theme.headingFont)
  const body = emailFontStack(theme.bodyFont)
  const mono = emailFontStack(theme.monoFont)
  const searchUrl = absHref(opts.searchHref)

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(BRAND_NAME)} alert saved</title>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500&family=Playfair+Display:wght@500;600&display=swap" rel="stylesheet" />
</head>
<body style="margin:0;padding:0;background-color:${theme.pageBackground};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${theme.pageBackground};">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background-color:${theme.cardBackground};border-collapse:collapse;">
          ${brandHeader(theme)}
          <tr>
            <td style="padding:22px;">
              <p style="margin:0 0 10px 0;font-family:${heading};font-size:22px;line-height:1.25;color:${theme.text};">You&rsquo;re set</p>
              <p style="margin:0 0 14px 0;font-family:${body};font-size:14px;line-height:1.5;color:${theme.mutedText};">
                We&rsquo;ll email you when new listings match your search.
              </p>
              <p style="margin:0 0 6px 0;font-family:${mono};font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:${theme.accent};">Search</p>
              <p style="margin:0 0 14px 0;font-family:${body};font-size:15px;color:${theme.text};">
                <a href="${escapeHtml(searchUrl)}" style="color:${theme.text};font-weight:600;text-decoration:underline;">${escapeHtml(opts.criteriaLabel)}</a>
              </p>
              <p style="margin:0 0 18px 0;font-family:${body};font-size:14px;color:${theme.mutedText};">
                When: ${escapeHtml(opts.cadenceLabel)}
              </p>
              <p style="margin:0;">
                <a href="${escapeHtml(searchUrl)}" style="display:inline-block;padding:10px 16px;background-color:${theme.accent};color:${theme.surfaceDeep};font-family:${mono};font-size:11px;letter-spacing:0.14em;text-transform:uppercase;text-decoration:none;border-radius:999px;">Open search</a>
              </p>
            </td>
          </tr>
          ${brandFooter(theme, opts.brokerage)}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}
