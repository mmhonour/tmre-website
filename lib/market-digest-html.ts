import 'server-only'

import { SITE_URL } from '@/lib/business-info'
import { fmtMoney } from '@/lib/listing-history'
import { splitSentences } from '@/lib/split-sentences'
import {
  MARKET_DIGEST_CLOSED_TRAILING_MONTHS,
  type MarketDigestSnapshot,
} from '@/lib/market-digest-types'
import type { MonthsSupplyPayload } from '@/lib/months-supply-types'

const NAVY = '#1B2A4A'
const NAVY_DARK = '#131F38'
const GOLD = '#C8A951'
const CREAM = '#F7F5F0'
const SLATE = '#5A6578'
const BAR_TRACK = '#E8EBF2'
const BAR_INVENTORY = '#2A3D6B'
const BAR_MOS = '#C8A951'
const WHITE = '#FFFFFF'

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function fmtMosShort(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return 'n/a'
  return `${n.toFixed(1)} mo`
}

function fmtActive(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return String(Math.round(n))
}

function fmtDomShort(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return `${Math.round(n)}d`
}

function cityLabel(row: { city: string }): string {
  const city = row.city?.trim() || '—'
  if (city.toLowerCase() === 'all') return 'All towns'
  return city
}

function chartRows(snapshot: MarketDigestSnapshot): MonthsSupplyPayload[] {
  const rows: MonthsSupplyPayload[] = []
  if (snapshot.market) rows.push(snapshot.market)
  for (const town of snapshot.towns) {
    if (
      snapshot.market &&
      town.city.trim().toLowerCase() === snapshot.market.city.trim().toLowerCase()
    ) {
      continue
    }
    rows.push(town)
  }
  return rows
}

function barRow(
  label: string,
  valueLabel: string,
  pct: number,
  barColor: string,
): string {
  const width = Math.max(0, Math.min(100, Math.round(pct)))
  const remainder = 100 - width
  const barCell =
    width <= 0
      ? `<td bgcolor="${BAR_TRACK}" style="height:14px;font-size:0;line-height:0;border-radius:2px;">&nbsp;</td>`
      : remainder <= 0
        ? `<td width="100%" bgcolor="${barColor}" style="height:14px;font-size:0;line-height:0;border-radius:2px;">&nbsp;</td>`
        : `<td width="${width}%" bgcolor="${barColor}" style="height:14px;font-size:0;line-height:0;border-radius:2px 0 0 2px;">&nbsp;</td><td width="${remainder}%" bgcolor="${BAR_TRACK}" style="height:14px;font-size:0;line-height:0;border-radius:0 2px 2px 0;">&nbsp;</td>`

  return `
    <tr>
      <td style="padding:6px 10px 6px 0;font-family:Georgia,serif;font-size:13px;color:${NAVY};white-space:nowrap;width:110px;vertical-align:middle;">${escapeHtml(label)}</td>
      <td style="padding:6px 8px;vertical-align:middle;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
          <tr>${barCell}</tr>
        </table>
      </td>
      <td style="padding:6px 0 6px 8px;font-family:ui-monospace,Consolas,monospace;font-size:12px;color:${NAVY};text-align:right;white-space:nowrap;width:56px;vertical-align:middle;">${escapeHtml(valueLabel)}</td>
    </tr>`
}

function barChartSection<Row extends { city: string }>(
  title: string,
  rows: Row[],
  valueOf: (row: Row) => number | null,
  formatValue: (row: Row) => string,
  barColor: string,
  emptyMessage: string,
): string {
  if (rows.length === 0) {
    return `
      <tr><td style="padding:0 0 20px 0;">
        <p style="margin:0 0 10px 0;font-family:ui-monospace,Consolas,monospace;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:${GOLD};">${escapeHtml(title)}</p>
        <p style="margin:0;font-family:Georgia,serif;font-size:13px;color:${SLATE};">${escapeHtml(emptyMessage)}</p>
      </td></tr>`
  }

  const max = Math.max(
    0,
    ...rows.map((r) => {
      const v = valueOf(r)
      return v != null && Number.isFinite(v) ? v : 0
    }),
  )

  const body = rows
    .map((row) => {
      const v = valueOf(row)
      const pct = max > 0 && v != null && Number.isFinite(v) ? (v / max) * 100 : 0
      return barRow(cityLabel(row), formatValue(row), pct, barColor)
    })
    .join('')

  return `
    <tr><td style="padding:0 0 24px 0;">
      <p style="margin:0 0 12px 0;font-family:ui-monospace,Consolas,monospace;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:${GOLD};">${escapeHtml(title)}</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
        ${body}
      </table>
    </td></tr>`
}

function kpiCell(label: string, value: string): string {
  return `
    <td width="33%" style="padding:12px 10px;background-color:${CREAM};border:1px solid #E2E6EE;text-align:center;vertical-align:top;">
      <p style="margin:0 0 6px 0;font-family:ui-monospace,Consolas,monospace;font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:${SLATE};">${escapeHtml(label)}</p>
      <p style="margin:0;font-family:Georgia,serif;font-size:22px;line-height:1.2;color:${NAVY};">${escapeHtml(value)}</p>
    </td>`
}

function dealTypeLine(d: NonNullable<MarketDigestSnapshot['dealOfTheWeek']>): string {
  return [
    d.propertyType?.trim() || null,
    d.beds != null && d.baths != null ? `${d.beds}BR/${d.baths}BA` : null,
    d.sqft != null ? `${d.sqft.toLocaleString()} sqft` : null,
    d.lotAcres != null && Number.isFinite(d.lotAcres)
      ? `${d.lotAcres.toFixed(d.lotAcres < 1 ? 2 : 1)} ac`
      : null,
    d.yearBuilt != null ? `Built ${d.yearBuilt}` : null,
  ]
    .filter(Boolean)
    .join(' · ')
}

function dealOfTheWeekSection(
  d: NonNullable<MarketDigestSnapshot['dealOfTheWeek']>,
): string {
  const score =
    d.composite != null && Number.isFinite(d.composite)
      ? d.composite.toFixed(1)
      : '—'
  const meta = dealTypeLine(d)
  const insightParas = splitSentences(d.insight)
    .map(
      (s) =>
        `<p style="margin:0 0 10px 0;font-family:Georgia,serif;font-size:14px;line-height:1.45;color:rgba(255,255,255,0.78);">${escapeHtml(s)}</p>`,
    )
    .join('')
  const pills = (d.superlatives ?? [])
    .slice(0, 5)
    .map(
      (word) =>
        `<span style="display:inline-block;margin:0 6px 6px 0;padding:4px 10px;border:1px solid rgba(200,169,81,0.45);border-radius:999px;font-family:ui-monospace,Consolas,monospace;font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:${GOLD};">${escapeHtml(word)}</span>`,
    )
    .join('')

  const img = d.photoUrl
    ? `<img src="${escapeHtml(d.photoUrl)}" alt="${escapeHtml(d.address)}" width="560" style="display:block;width:100%;max-width:560px;height:auto;border:0;" />`
    : `<div style="padding:48px 20px;text-align:center;font-family:Georgia,serif;font-size:14px;color:rgba(255,255,255,0.55);">No photo available</div>`

  const discount =
    d.valueDiscountPct != null && Number.isFinite(d.valueDiscountPct) && d.valueDiscountPct > 0
      ? `<p style="margin:0 0 10px 0;font-family:ui-monospace,Consolas,monospace;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:${GOLD};">${escapeHtml(`${Math.round(d.valueDiscountPct)}% below town median`)}</p>`
      : ''

  return `
    <tr><td style="padding:0 0 24px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;background-color:${NAVY_DARK};">
        <tr>
          <td style="padding:18px 18px 8px 18px;">
            <p style="margin:0 0 4px 0;font-family:ui-monospace,Consolas,monospace;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:${GOLD};">Deal of the Week</p>
            <p style="margin:0;font-family:Georgia,serif;font-size:36px;line-height:1.05;color:${WHITE};">
              <span style="font-style:italic;color:${GOLD};">${escapeHtml(score)}</span>
              <span style="font-style:italic;color:rgba(255,255,255,0.85);"> · One listing.</span>
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:8px 18px 0 18px;">${img}</td>
        </tr>
        <tr>
          <td style="padding:16px 18px 20px 18px;">
            <p style="margin:0 0 4px 0;font-family:Georgia,serif;font-size:20px;line-height:1.25;color:${WHITE};">${escapeHtml(d.address)}${d.city ? `, ${escapeHtml(d.city)}` : ''}</p>
            <p style="margin:0 0 8px 0;font-family:ui-monospace,Consolas,monospace;font-size:13px;color:rgba(255,255,255,0.85);">
              ${d.price != null ? escapeHtml(fmtMoney(d.price)) : '—'}
              <span style="color:rgba(255,255,255,0.45);"> · </span>
              MLS #${escapeHtml(d.mlsId)}
            </p>
            ${meta ? `<p style="margin:0 0 12px 0;font-family:ui-monospace,Consolas,monospace;font-size:11px;color:rgba(255,255,255,0.6);">${escapeHtml(meta)}</p>` : ''}
            ${discount}
            ${pills ? `<div style="margin:0 0 14px 0;">${pills}</div>` : ''}
            ${insightParas || `<p style="margin:0 0 10px 0;font-family:Georgia,serif;font-size:14px;color:rgba(255,255,255,0.65);">No insight available.</p>`}
            <p style="margin:16px 0 0 0;">
              <a href="${escapeHtml(d.href)}" style="display:inline-block;padding:10px 16px;background-color:${GOLD};color:${NAVY_DARK};font-family:ui-monospace,Consolas,monospace;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;text-decoration:none;border-radius:999px;">View listing</a>
            </p>
          </td>
        </tr>
      </table>
    </td></tr>`
}

/**
 * Email-safe HTML grid for the Monday market brief (table layout, inline styles).
 */
export function formatMarketDigestHtml(
  snapshot: MarketDigestSnapshot,
  etDate: string,
): string {
  const rows = chartRows(snapshot)
  const marketActive = snapshot.market ? fmtActive(snapshot.market.activeCount) : '—'
  const marketMos = snapshot.market
    ? fmtMosShort(snapshot.market.monthsSupply)
    : '—'
  const westportMos = snapshot.westport
    ? fmtMosShort(snapshot.westport.monthsSupply)
    : '—'

  const filledSocial = snapshot.socialProfiles.filter((p) => p.handleOrUrl)
  const socialHtml =
    filledSocial.length === 0
      ? `<p style="margin:0;font-family:Georgia,serif;font-size:13px;color:${SLATE};">No social handles saved yet (Admin → Site).</p>`
      : `<table role="presentation" cellpadding="0" cellspacing="0" border="0">${filledSocial
          .map(
            (p) =>
              `<tr><td style="padding:3px 0;font-family:ui-monospace,Consolas,monospace;font-size:12px;color:${NAVY};">${escapeHtml(p.label)}: ${escapeHtml(p.handleOrUrl)}</td></tr>`,
          )
          .join('')}</table>`

  const dealSection = snapshot.dealOfTheWeek
    ? dealOfTheWeekSection(snapshot.dealOfTheWeek)
    : `
      <tr><td style="padding:0 0 24px 0;">
        <p style="margin:0 0 8px 0;font-family:ui-monospace,Consolas,monospace;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:${GOLD};">Deal of the Week</p>
        <p style="margin:0;font-family:Georgia,serif;font-size:13px;color:${SLATE};">No Deal of the Week in cache yet — check homepage / stats rebuild.</p>
      </td></tr>`

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>TMRE Monday market brief</title>
</head>
<body style="margin:0;padding:0;background-color:#EEF1F6;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#EEF1F6;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background-color:${WHITE};border-collapse:collapse;">
          <tr>
            <td style="padding:22px 22px 18px 22px;background-color:${NAVY};">
              <p style="margin:0 0 6px 0;font-family:ui-monospace,Consolas,monospace;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:${GOLD};">TMRE Monday market brief</p>
              <p style="margin:0 0 8px 0;font-family:Georgia,serif;font-size:22px;line-height:1.25;color:${WHITE};">${escapeHtml(etDate)}</p>
              <p style="margin:0;font-family:ui-monospace,Consolas,monospace;font-size:11px;">
                <a href="${escapeHtml(`${SITE_URL}/market-pulse`)}" style="color:${GOLD};text-decoration:underline;">Read on the web</a>
                <span style="color:rgba(255,255,255,0.35);"> · </span>
                <a href="${escapeHtml(`${SITE_URL}/stats`)}" style="color:${GOLD};text-decoration:underline;">View live stats</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 22px 8px 22px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;border-spacing:8px 0;">
                <tr>
                  ${kpiCell('Market active', marketActive)}
                  ${kpiCell('Market MOS', marketMos)}
                  ${kpiCell('Westport MOS', westportMos)}
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:12px 22px 0 22px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                ${barChartSection(
                  'Active inventory (sales)',
                  rows,
                  (r) => r.activeCount,
                  (r) => fmtActive(r.activeCount),
                  BAR_INVENTORY,
                  'No inventory rows in cache yet.',
                )}
                ${barChartSection(
                  'Months supply (sales)',
                  rows,
                  (r) => r.monthsSupply,
                  (r) => fmtMosShort(r.monthsSupply),
                  BAR_MOS,
                  'No months-supply rows in cache yet.',
                )}
                ${barChartSection(
                  'Avg days on market (sales)',
                  snapshot.avgDomByTown ?? [],
                  (r) => r.avgDaysOnMarket,
                  (r) => fmtDomShort(r.avgDaysOnMarket),
                  BAR_INVENTORY,
                  'No days-on-market rows in cache yet.',
                )}
                ${barChartSection(
                  `Closed sales — trailing ${MARKET_DIGEST_CLOSED_TRAILING_MONTHS} months (sales)`,
                  snapshot.closedTrailing ?? [],
                  (r) => r.count,
                  (r) => r.count.toLocaleString(),
                  BAR_INVENTORY,
                  'No closed sales in the trailing window yet.',
                )}
                ${dealSection}
                <tr><td style="padding:0 0 18px 0;">
                  <p style="margin:0;font-family:ui-monospace,Consolas,monospace;font-size:11px;line-height:1.5;color:${SLATE};">
                    MOS = active ÷ avg monthly closings (3 prior full months). Sale listings, all property classes.
                  </p>
                </td></tr>
                <tr><td style="padding:0 0 8px 0;">
                  <p style="margin:0 0 8px 0;font-family:ui-monospace,Consolas,monospace;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:${GOLD};">Social profiles</p>
                  ${socialHtml}
                </td></tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 22px 22px 22px;">
              <p style="margin:0;font-family:ui-monospace,Consolas,monospace;font-size:10px;color:${SLATE};">— Sent by tmre-website market digest</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}
