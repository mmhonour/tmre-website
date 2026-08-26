import 'server-only'

import { SITE_URL } from '@/lib/business-info'
import { fmtMoney } from '@/lib/listing-history'
import { splitSentences } from '@/lib/split-sentences'
import {
  type MarketDigestSnapshot,
} from '@/lib/market-digest-types'
import {
  DEFAULT_MARKET_PULSE_CHART_LAYOUT,
  DEFAULT_MARKET_PULSE_FAVOR_SORT,
  summarizeMarketPulseFilters,
} from '@/lib/market-pulse-defaults'
import {
  defaultMarketPulseCombinedRows,
  marketPulseAllTownsAvgDom,
  type MarketPulseCombinedTownRow,
} from '@/lib/market-pulse-combined-rows'
import { DEFAULT_MARKET_PULSE_LOOKBACK_ID, marketPulseLookbackChartLabel } from '@/lib/market-pulse-lookback'
import {
  isMarketPulsePriceScaleMetric,
  marketPulseDeltaBarSpan,
  marketPulsePriceBarMax,
  marketPulsePricePct,
  marketPulseStackedMetrics,
  type MarketPulseStackedMetricId,
} from '@/lib/market-pulse-stacked-metrics'

const NAVY = '#1B2A4A'
const NAVY_DARK = '#131F38'
const GOLD = '#C8A951'
const CREAM = '#F7F5F0'
const SLATE = '#5A6578'
const BAR_TRACK = '#E8EBF2'
const BAR_INVENTORY = '#2A3D6B'
const BAR_MOS = '#C8A951'
const BAR_DOM = '#5B8A72'
const BAR_CLOSED = '#C45C4A'
const BAR_MEDIAN = '#6B7C9B'
const BAR_AVERAGE = '#8B6F4E'
const BAR_DELTA = '#7A6A8A'
const BAR_SALE_TO_ASK = '#4A7C8A'
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

/** Fixed inner bar width — % widths on empty cells collapse in many mail clients. */
const BAR_INNER_PX = 220
const BAR_HEIGHT_PX = 12

function barCellTd(widthPx: number, color: string): string {
  if (widthPx <= 0) return ''
  return `<td width="${widthPx}" bgcolor="${color}" height="${BAR_HEIGHT_PX}" style="width:${widthPx}px;max-width:${widthPx}px;height:${BAR_HEIGHT_PX}px;background-color:${color};font-size:0;line-height:${BAR_HEIGHT_PX}px;mso-line-height-rule:exactly;">&nbsp;</td>`
}

function metricBarRow(
  metricLabel: string,
  valueLabel: string,
  pct: number,
  barColor: string,
  opts?: { tight?: boolean; leftPct?: number },
): string {
  const leftPct = Math.max(0, Math.min(100, opts?.leftPct ?? 0))
  const widthPct = Math.max(0, Math.min(100 - leftPct, pct))
  let leftPx = Math.round((leftPct / 100) * BAR_INNER_PX)
  let filled = Math.round((widthPct / 100) * BAR_INNER_PX)
  if (leftPx + filled > BAR_INNER_PX) filled = BAR_INNER_PX - leftPx
  const empty = BAR_INNER_PX - leftPx - filled
  const spacer = barCellTd(leftPx, BAR_TRACK)
  const fill = barCellTd(filled, barColor)
  const track = barCellTd(empty, BAR_TRACK)
  const barCell =
    !spacer && !fill && !track
      ? barCellTd(BAR_INNER_PX, BAR_TRACK)
      : `${spacer}${fill}${track}`

  const padY = opts?.tight ? '0' : '3px'
  return `
    <tr>
      <td width="120" style="padding:${padY} 8px ${padY} 0;font-family:ui-monospace,Consolas,monospace;font-size:10px;letter-spacing:0.04em;text-transform:uppercase;color:${SLATE};white-space:nowrap;width:120px;vertical-align:middle;">${escapeHtml(metricLabel)}</td>
      <td style="padding:${padY} 6px;vertical-align:middle;">
        <table role="presentation" width="${BAR_INNER_PX}" cellpadding="0" cellspacing="0" border="0" style="width:${BAR_INNER_PX}px;border-collapse:collapse;table-layout:fixed;">
          <tr>${barCell}</tr>
        </table>
      </td>
      <td width="128" style="padding:${padY} 0 ${padY} 6px;font-family:ui-monospace,Consolas,monospace;font-size:11px;color:${NAVY};text-align:right;white-space:nowrap;width:128px;vertical-align:middle;">${escapeHtml(valueLabel)}</td>
    </tr>`
}

type StackedMetric = {
  id: MarketPulseStackedMetricId
  label: string
  labelOf?: (row: MarketPulseCombinedTownRow) => string
  color: string
  barValueOf: (row: MarketPulseCombinedTownRow) => number | null
  format: (row: MarketPulseCombinedTownRow) => string
}

const EMAIL_STACKED_BAR_COLOR: Record<MarketPulseStackedMetricId, string> = {
  inventory: BAR_INVENTORY,
  monthsSupply: BAR_MOS,
  avgDom: BAR_DOM,
  closed: BAR_CLOSED,
  medianPrice: BAR_MEDIAN,
  averagePrice: BAR_AVERAGE,
  priceDelta: BAR_DELTA,
  saleToAsk: BAR_SALE_TO_ASK,
}

function stackedTownMetricsSection(
  rows: MarketPulseCombinedTownRow[],
): string {
  const lookbackLabel = marketPulseLookbackChartLabel(
    DEFAULT_MARKET_PULSE_LOOKBACK_ID,
  )
  const metrics: StackedMetric[] = marketPulseStackedMetrics(lookbackLabel).map(
    (m) => ({
      id: m.id,
      label: m.label,
      labelOf: m.labelOf,
      color: EMAIL_STACKED_BAR_COLOR[m.id],
      barValueOf: m.barValueOf,
      format: m.format,
    }),
  )

  if (rows.length === 0) {
    return `
      <tr><td style="padding:0 0 24px 0;">
        <p style="margin:0 0 10px 0;font-family:ui-monospace,Consolas,monospace;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:${GOLD};">Town metrics stacked (sales)</p>
        <p style="margin:0;font-family:Georgia,serif;font-size:13px;color:${SLATE};">No town rows in cache yet.</p>
      </td></tr>`
  }

  const maxByMetric = metrics.map((m) =>
    Math.max(
      0,
      ...rows.map((r) => {
        const v = m.barValueOf(r)
        return v != null && Number.isFinite(v) ? v : 0
      }),
    ),
  )
  const priceMax = marketPulsePriceBarMax(rows)

  const towns = rows
    .map((row) => {
      const metricRows = metrics
        .map((m, i) => {
          const v = m.barValueOf(row)
          const max = isMarketPulsePriceScaleMetric(m.id)
            ? priceMax
            : (maxByMetric[i] ?? 0)
          const pct =
            max > 0 && v != null && Number.isFinite(v) ? (v / max) * 100 : 0
          const span =
            m.id === 'priceDelta'
              ? marketPulseDeltaBarSpan(
                  marketPulsePricePct(row.medianPrice, priceMax),
                  marketPulsePricePct(row.averagePrice, priceMax),
                )
              : { leftPct: 0, widthPct: pct }
          const tight =
            m.id === 'medianPrice' ||
            m.id === 'averagePrice' ||
            m.id === 'priceDelta'
          const metricLabel =
            m.labelOf?.(row) ?? m.label
          return metricBarRow(metricLabel, m.format(row), span.widthPct, m.color, {
            tight,
            leftPct: span.leftPct,
          })
        })
        .join('')
      return `
        <tr>
          <td style="padding:14px 0 4px 0;font-family:Georgia,serif;font-size:15px;color:${NAVY};">${escapeHtml(cityLabel(row))}</td>
        </tr>
        <tr>
          <td style="padding:0 0 8px 0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
              ${metricRows}
            </table>
          </td>
        </tr>`
    })
    .join('')

  return `
    <tr><td style="padding:0 0 24px 0;">
      <p style="margin:0 0 12px 0;font-family:ui-monospace,Consolas,monospace;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:${GOLD};">Town metrics stacked (sales)</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
        ${towns}
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
    d.valueDiscountPct != null &&
    Number.isFinite(d.valueDiscountPct) &&
    d.valueDiscountPct > 0
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

export type FormatMarketDigestHtmlOptions = {
  /** Opt-in footer from Admin → Communications → Social profiles. Default off. */
  includeSocialProfiles?: boolean
}

/**
 * Email-safe HTML for the Monday market brief — same as /market-pulse on load:
 * stacked town metrics (`marketPulseStackedMetrics`), Seller Friendly order,
 * ALL sales, default closed lookback, KPIs, filter summary sentence.
 */
export function formatMarketDigestHtml(
  snapshot: MarketDigestSnapshot,
  etDate: string,
  options?: FormatMarketDigestHtmlOptions,
): string {
  const includeSocial = options?.includeSocialProfiles === true
  const combinedRows = defaultMarketPulseCombinedRows(snapshot)
  const marketActive = snapshot.market
    ? fmtActive(snapshot.market.activeCount)
    : '—'
  const marketMos = snapshot.market
    ? fmtMosShort(snapshot.market.monthsSupply)
    : '—'
  const allTownsDom = fmtDomShort(marketPulseAllTownsAvgDom(snapshot))
  const filterSummary = summarizeMarketPulseFilters({
    selectionLabel: 'ALL',
    chartLayout: DEFAULT_MARKET_PULSE_CHART_LAYOUT,
    favorSort: DEFAULT_MARKET_PULSE_FAVOR_SORT,
    lookbackId: DEFAULT_MARKET_PULSE_LOOKBACK_ID,
  })

  const filledSocial = includeSocial
    ? snapshot.socialProfiles.filter((p) => p.handleOrUrl)
    : []
  const socialSection =
    !includeSocial
      ? ''
      : `
                <tr><td style="padding:0 0 8px 0;">
                  <p style="margin:0 0 8px 0;font-family:ui-monospace,Consolas,monospace;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:${GOLD};">Social profiles</p>
                  ${
                    filledSocial.length === 0
                      ? `<p style="margin:0;font-family:Georgia,serif;font-size:13px;color:${SLATE};">No social handles saved yet (Admin → Communications).</p>`
                      : `<table role="presentation" cellpadding="0" cellspacing="0" border="0">${filledSocial
                          .map(
                            (p) =>
                              `<tr><td style="padding:3px 0;font-family:ui-monospace,Consolas,monospace;font-size:12px;color:${NAVY};">${escapeHtml(p.label)}: ${escapeHtml(p.handleOrUrl)}</td></tr>`,
                          )
                          .join('')}</table>`
                  }
                </td></tr>`

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
              <p style="margin:0 0 6px 0;font-family:ui-monospace,Consolas,monospace;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:${GOLD};">TMRE Market Pulse</p>
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
                  ${kpiCell('All Town Months Inventory', marketMos)}
                  ${kpiCell('Avg days on market', allTownsDom)}
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:4px 22px 8px 22px;">
              <p style="margin:0;font-family:ui-monospace,Consolas,monospace;font-size:10px;line-height:1.45;color:${SLATE};">${escapeHtml(filterSummary)}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 22px 0 22px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                ${stackedTownMetricsSection(combinedRows)}
                ${dealSection}
                <tr><td style="padding:0 0 18px 0;">
                  <p style="margin:0;font-family:ui-monospace,Consolas,monospace;font-size:11px;line-height:1.5;color:${SLATE};">
                    Same defaults as /market-pulse: ${escapeHtml(filterSummary)}. MOS = active ÷ avg monthly closings (3 prior full months).
                  </p>
                </td></tr>
                ${socialSection}
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
