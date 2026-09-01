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
  isAllTownsCity,
  marketPulseAllTownsAvgDom,
  type MarketPulseCombinedTownRow,
} from '@/lib/market-pulse-combined-rows'
import { DEFAULT_MARKET_PULSE_LOOKBACK_ID, marketPulseLookbackChartLabel } from '@/lib/market-pulse-lookback'
import {
  marketPulseHeatByCity,
  marketPulseHeatBand,
  MARKET_PULSE_BUYER_SCORE_COPY,
  MARKET_PULSE_SELLER_SCORE_COPY,
} from '@/lib/market-pulse-favorability'
import {
  barAsidePlacement,
  type BarAsidePlacement,
} from '@/lib/market-pulse-bar-aside'
import {
  formatSaleToAskPct,
  isMarketPulsePriceScaleMetric,
  marketPulseDeltaBarSpan,
  marketPulsePriceBarMax,
  marketPulsePricePct,
  marketPulseStackedMetrics,
  type MarketPulseStackedMetricId,
} from '@/lib/market-pulse-stacked-metrics'
import { formatPriceDeltaPct } from '@/lib/market-pulse-price-delta'

const NAVY = '#1B2A4A'
const NAVY_DARK = '#131F38'
const GOLD = '#C8A951'
const CREAM = '#F7F5F0'
const SLATE = '#5A6578'
const WHITE = '#FFFFFF'

/*
 * The town panels on /market-pulse are a denim card carrying one gold ink
 * across every bar. Mail has no alpha to blend with, so each translucent web
 * colour is flattened over that card once, here, rather than guessed at per
 * rule. The comment on each names the Tailwind class it stands in for.
 */
const PANEL_BG = '#26374F'
/** `bg-gold/70` — the single ink every bar is filled with. */
const BAR_INK = '#978750'
/** `bg-white/10` — the unfilled remainder of a track. */
const BAR_TRACK = '#3C4B61'
/** `text-white/45` — row labels and the spectrum's end captions. */
const PANEL_MUTED = '#88919E'
/** `text-white/70` — a bar's percent, and the band name. */
const PANEL_ASIDE = '#BEC3CA'
/** `text-white/90` — the value column. */
const PANEL_VALUE = '#E9EBED'
/** Seller → buyer, the stops the web strip runs its gradient between. */
const HEAT_FROM = '#C85A3A'
const HEAT_VIA = '#C8A951'
const HEAT_TO = '#4A7C6F'

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
  // Cased as the page cases it — `cityLabel` in WeeklyBriefContent.
  if (city.toLowerCase() === 'all') return 'All Towns'
  return city
}

/** Fixed inner bar width — % widths on empty cells collapse in many mail clients. */
const BAR_INNER_PX = 220
/**
 * The web track is 6px and lets the percent overhang it, which absolute
 * positioning allows and a table cell does not. Ten leaves the 9px percent room
 * to sit *inside* the track beside its fill, which is the placement that
 * matters here; a 6px bar would have forced the percent back out to a lane.
 */
const BAR_HEIGHT_PX = 10
/** The web's `grid-cols-[7.75rem_1fr_auto]`, in the px this table needs. */
const LABEL_COL_PX = 124
const VALUE_COL_PX = 70
/** Stands in for `BAR_EXTERIOR_LANE` — where a full bar's percent goes. */
const ASIDE_LANE_PX = 34
/** `divide-white/[0.08]` over the panel. */
const PANEL_RULE = '#37475D'

const ASIDE_FONT = `font-family:ui-monospace,Consolas,monospace;font-size:9px;color:${PANEL_ASIDE};white-space:nowrap;`

/**
 * One cell of a bar track. A percent rides inside the cell on the side of the
 * fill it belongs to, so the cell takes a real font size where an empty spacer
 * would rather collapse to none.
 */
function barCellTd(
  widthPx: number,
  color: string,
  text?: { value: string; align: 'left' | 'right' },
): string {
  if (widthPx <= 0) return ''
  const inner = text
    ? `${ASIDE_FONT}line-height:${BAR_HEIGHT_PX}px;text-align:${text.align};padding-${
        text.align === 'left' ? 'left' : 'right'
      }:4px;`
    : `font-size:0;line-height:${BAR_HEIGHT_PX}px;`
  return `<td width="${widthPx}" bgcolor="${color}" height="${BAR_HEIGHT_PX}" style="width:${widthPx}px;max-width:${widthPx}px;height:${BAR_HEIGHT_PX}px;background-color:${color};${inner}mso-line-height-rule:exactly;">${
    text ? escapeHtml(text.value) : '&nbsp;'
  }</td>`
}

/**
 * One labelled bar, drawn to match `PanelBarRow`: label right-aligned against
 * the track, one gold ink in the fill, the value in its own column, and the
 * percent placed off the fill by the shared rule rather than folded into the
 * label the way this email used to.
 */
function metricBarRow(
  metricLabel: string,
  valueLabel: string,
  pct: number,
  opts?: {
    leftPct?: number
    aside?: string | null
    asideNegative?: boolean
  },
): string {
  const leftPct = Math.max(0, Math.min(100, opts?.leftPct ?? 0))
  const widthPct = Math.max(0, Math.min(100 - leftPct, pct))
  const leftPx = Math.round((leftPct / 100) * BAR_INNER_PX)
  let filled = Math.round((widthPct / 100) * BAR_INNER_PX)
  if (leftPx + filled > BAR_INNER_PX) filled = BAR_INNER_PX - leftPx
  const empty = BAR_INNER_PX - leftPx - filled

  const asideText = opts?.aside?.trim() ? opts.aside.trim() : null
  const placement: BarAsidePlacement | null = asideText
    ? barAsidePlacement(leftPct, widthPct, opts?.asideNegative ?? false)
    : null

  const spacer = barCellTd(
    leftPx,
    BAR_TRACK,
    placement === 'left' && asideText
      ? { value: asideText, align: 'right' }
      : undefined,
  )
  const fill = barCellTd(filled, BAR_INK)
  const track = barCellTd(
    empty,
    BAR_TRACK,
    placement === 'right' && asideText
      ? { value: asideText, align: 'left' }
      : undefined,
  )
  const barCell =
    !spacer && !fill && !track
      ? barCellTd(BAR_INNER_PX, BAR_TRACK)
      : `${spacer}${fill}${track}`

  const labelAside =
    placement === 'label' && asideText
      ? `<span style="${ASIDE_FONT}padding-left:4px;">${escapeHtml(asideText)}</span>`
      : ''

  return `
    <tr>
      <td width="${LABEL_COL_PX}" style="width:${LABEL_COL_PX}px;padding:5px 8px 5px 0;border-top:1px solid ${PANEL_RULE};font-family:ui-monospace,Consolas,monospace;font-size:9px;letter-spacing:0.14em;text-transform:uppercase;color:${PANEL_MUTED};text-align:right;white-space:nowrap;vertical-align:middle;">${escapeHtml(metricLabel)}${labelAside}</td>
      <td style="padding:5px 0;border-top:1px solid ${PANEL_RULE};vertical-align:middle;">
        <table role="presentation" width="${BAR_INNER_PX}" cellpadding="0" cellspacing="0" border="0" style="width:${BAR_INNER_PX}px;border-collapse:collapse;table-layout:fixed;">
          <tr>${barCell}</tr>
        </table>
      </td>
      <td width="${VALUE_COL_PX}" style="width:${VALUE_COL_PX}px;padding:5px 0 5px 8px;border-top:1px solid ${PANEL_RULE};font-family:ui-monospace,Consolas,monospace;font-size:11px;color:${PANEL_VALUE};text-align:right;white-space:nowrap;vertical-align:middle;">${escapeHtml(valueLabel)}</td>
      <td width="${ASIDE_LANE_PX}" style="width:${ASIDE_LANE_PX}px;padding:5px 0 5px 6px;border-top:1px solid ${PANEL_RULE};${ASIDE_FONT}text-align:left;vertical-align:middle;">${
        placement === 'outside-right' && asideText ? escapeHtml(asideText) : '&nbsp;'
      }</td>
    </tr>`
}

function hexTriplet(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ]
}

function mixHex(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexTriplet(a)
  const [br, bg, bb] = hexTriplet(b)
  const ch = (from: number, to: number) =>
    Math.round(from + (to - from) * t)
      .toString(16)
      .padStart(2, '0')
  return `#${ch(ar, br)}${ch(ag, bg)}${ch(ab, bb)}`.toUpperCase()
}

/** A point on the coral → gold → sage run the web strip draws as a gradient. */
function heatColorAt(t: number): string {
  if (t <= 0.5) return mixHex(HEAT_FROM, HEAT_VIA, t / 0.5)
  return mixHex(HEAT_VIA, HEAT_TO, (t - 0.5) / 0.5)
}

const HEAT_CELL_COUNT = 24
const HEAT_CELL_PX = 9
const HEAT_BAR_PX = 8
const HEAT_STRIP_PX = HEAT_CELL_COUNT * HEAT_CELL_PX

/**
 * Seller ↔ buyer beside a town name, as the web draws it: end captions, the
 * band named between them, and a marker on a continuous run of colour.
 *
 * Mail clients drop CSS gradients, so the run is stepped into cells and the
 * marker takes the cell it lands on rather than floating over one — near enough
 * at this width, and it survives everywhere a background colour does.
 */
function favorabilityStrip(score: number, peerCount: number | null): string {
  const clamped = Math.min(1, Math.max(0, score))
  const band = marketPulseHeatBand(clamped)
  const markerIndex = Math.round(clamped * (HEAT_CELL_COUNT - 1))
  const cells = Array.from({ length: HEAT_CELL_COUNT }, (_, i) => {
    const color =
      i === markerIndex ? WHITE : heatColorAt(i / (HEAT_CELL_COUNT - 1))
    return `<td width="${HEAT_CELL_PX}" bgcolor="${color}" height="${HEAT_BAR_PX}" style="width:${HEAT_CELL_PX}px;height:${HEAT_BAR_PX}px;background-color:${color};font-size:0;line-height:${HEAT_BAR_PX}px;mso-line-height-rule:exactly;">&nbsp;</td>`
  }).join('')
  const caption = `${band.label}${
    peerCount != null ? ` · vs ${peerCount} towns` : ''
  }`
  const capFont =
    'font-family:ui-monospace,Consolas,monospace;font-size:9px;letter-spacing:0.16em;text-transform:uppercase;white-space:nowrap;'
  return `
    <table role="presentation" width="${HEAT_STRIP_PX}" cellpadding="0" cellspacing="0" border="0" style="width:${HEAT_STRIP_PX}px;border-collapse:collapse;">
      <tr>
        <td style="${capFont}color:${PANEL_MUTED};text-align:left;padding:0 0 3px 0;">Seller</td>
        <td width="100%" style="${capFont}color:${PANEL_ASIDE};text-align:center;padding:0 4px 3px 4px;">${escapeHtml(caption)}</td>
        <td style="${capFont}color:${PANEL_MUTED};text-align:right;padding:0 0 3px 0;">Buyer</td>
      </tr>
      <tr>
        <td colspan="3" style="padding:0;">
          <table role="presentation" width="${HEAT_STRIP_PX}" cellpadding="0" cellspacing="0" border="0" style="width:${HEAT_STRIP_PX}px;border-collapse:collapse;table-layout:fixed;">
            <tr>${cells}</tr>
          </table>
        </td>
      </tr>
    </table>`
}

/** Percent against the bar, for the two metrics that carry one — as the panel does. */
function metricAside(
  id: MarketPulseStackedMetricId,
  row: MarketPulseCombinedTownRow,
): string | null {
  if (id === 'priceDelta') return formatPriceDeltaPct(row.priceDeltaPct)
  if (id === 'saleToAsk') return formatSaleToAskPct(row.saleToAskPct)
  return null
}

function stackedTownMetricsSection(
  rows: MarketPulseCombinedTownRow[],
): string {
  const lookbackLabel = marketPulseLookbackChartLabel(
    DEFAULT_MARKET_PULSE_LOOKBACK_ID,
  )
  const metrics = marketPulseStackedMetrics(lookbackLabel)

  if (rows.length === 0) {
    return `
      <tr><td style="padding:0 0 24px 0;">
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
  const heatByCity = marketPulseHeatByCity(
    rows,
    (r) => ({
      monthsSupply: r.monthsSupply,
      avgDaysOnMarket: r.avgDaysOnMarket,
      closedCount: r.closedCount,
      medianPrice: r.medianPrice,
      priceDelta: r.priceDelta,
      averagePrice: r.averagePrice,
      saleToAskPct: r.saleToAskPct,
    }),
    (r) => isAllTownsCity(r.city),
  )
  const peerCount = rows.filter((r) => !isAllTownsCity(r.city)).length

  const towns = rows
    .map((row) => {
      const metricRows = metrics
        .map((m, i) => {
          const v = m.barValueOf(row)
          const max = isMarketPulsePriceScaleMetric(m.id)
            ? priceMax
            : (maxByMetric[i] ?? 0)
          const pct =
            max > 0 && v != null && Number.isFinite(v)
              ? (Math.abs(v) / max) * 100
              : 0
          const span =
            m.id === 'priceDelta'
              ? marketPulseDeltaBarSpan(
                  marketPulsePricePct(row.medianPrice, priceMax),
                  marketPulsePricePct(row.averagePrice, priceMax),
                )
              : { leftPct: 0, widthPct: pct }
          return metricBarRow(m.label, m.format(row), span.widthPct, {
            leftPct: span.leftPct,
            aside: metricAside(m.id, row),
            asideNegative:
              m.id === 'priceDelta' && (row.priceDeltaPct ?? 0) < 0,
          })
        })
        .join('')
      const heat = heatByCity.get(row.city)
      // The composite is the towns averaged, so ranking it against a count of
      // them reads as nonsense — the spectrum still places it.
      const aggregate = isAllTownsCity(row.city)
      return `
        <tr>
          <td style="padding:0 0 10px 0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${PANEL_BG}" style="width:100%;border-collapse:separate;background-color:${PANEL_BG};border-radius:12px;">
              <tr>
                <td style="padding:12px 14px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
                    <tr>
                      <td style="font-family:ui-monospace,Consolas,monospace;font-size:11px;letter-spacing:0.1em;color:${GOLD};white-space:nowrap;vertical-align:middle;">${escapeHtml(cityLabel(row))}</td>
                      <td align="right" style="text-align:right;vertical-align:middle;">${
                        heat == null
                          ? ''
                          : favorabilityStrip(heat, aggregate ? null : peerCount)
                      }</td>
                    </tr>
                  </table>
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-top:8px;">
                    ${metricRows}
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>`
    })
    .join('')

  return `
    <tr><td style="padding:0 0 14px 0;">
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
              <p style="margin:0 0 6px 0;font-family:ui-monospace,Consolas,monospace;font-size:11px;letter-spacing:0.2em;color:${WHITE};">TMRE Market Pulse, <span style="font-style:italic;color:${GOLD};">Town Metrics</span></p>
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
                  ${kpiCell('Months Inventory', marketMos)}
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
                <tr><td style="padding:0 0 10px 0;">
                  <p style="margin:0 0 6px 0;font-family:ui-monospace,Consolas,monospace;font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:${NAVY};">How Seller / Buyer Friendly is scored</p>
                  <p style="margin:0 0 6px 0;font-family:ui-monospace,Consolas,monospace;font-size:10px;line-height:1.5;color:${SLATE};">${escapeHtml(MARKET_PULSE_BUYER_SCORE_COPY)}</p>
                  <p style="margin:0;font-family:ui-monospace,Consolas,monospace;font-size:10px;line-height:1.5;color:${SLATE};">${escapeHtml(MARKET_PULSE_SELLER_SCORE_COPY)}</p>
                </td></tr>
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
