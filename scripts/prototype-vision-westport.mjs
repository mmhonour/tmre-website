#!/usr/bin/env node
/**
 * Prototype: scrape Westport VGSI street → parcel pages (public, no login).
 * Field Card data lives on Parcel.aspx (MainContent_* spans), not a separate URL.
 *
 * Usage: node scripts/prototype-vision-westport.mjs
 * Writes scripts/out/vision-addresses-westport-sample.json
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const BASE = 'https://gis.vgsi.com/westportct'
const TOWN = 'Westport'
const UA = 'TMRE-vision-prototype/0.1 (+local research; contact site owner)'

const STREET_NAMES = ['ACORN LN', 'ABBOTTS LN', 'ADAMS FARM RD']
const TARGET = 10

function decodeHtml(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { accept: 'text/html', 'user-agent': UA },
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  return res.text()
}

function spanById(html, id) {
  const re = new RegExp(
    `id=["']${id}["'][^>]*>([\\s\\S]*?)</(?:span|a|div|td)>`,
    'i',
  )
  const m = html.match(re)
  if (!m) return null
  return decodeHtml(m[1].replace(/<[^>]+>/g, ' '))
}

function tableCellAfterLabel(html, label) {
  const re = new RegExp(
    `<td[^>]*>\\s*${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:?\\s*</td>\\s*<td[^>]*>\\s*([^<]+)\\s*</td>`,
    'i',
  )
  const m = html.match(re)
  return m ? decodeHtml(m[1]) : null
}

function parcelLinksFromStreetHtml(html) {
  const out = []
  const re = /Parcel\.aspx\?pid=(\d+)['"][^>]*>([^<]+)</gi
  let m
  while ((m = re.exec(html)) !== null) {
    out.push({
      visionPid: m[1],
      addressLabel: decodeHtml(m[2]),
    })
  }
  return out
}

function moneyToNumber(raw) {
  if (!raw) return null
  const n = Number(String(raw).replace(/[$,]/g, ''))
  return Number.isFinite(n) ? n : null
}

function firstInt(raw) {
  if (!raw) return null
  const m = String(raw).match(/(\d+)/)
  return m ? Number(m[1]) : null
}

function parseParcelHtml(html, visionPid) {
  const location = spanById(html, 'MainContent_lblLocation')
  const mblu = spanById(html, 'MainContent_lblMblu')
  const acct = spanById(html, 'MainContent_lblAcctNum')
  const owner = spanById(html, 'MainContent_lblGenOwner')
  const assessed = moneyToNumber(spanById(html, 'MainContent_lblGenAssessment'))
  const appraisal = moneyToNumber(spanById(html, 'MainContent_lblGenAppraisal'))
  const pidConfirm = spanById(html, 'MainContent_lblPid')
  const zone = spanById(html, 'MainContent_lblZone')
  const acresRaw = spanById(html, 'MainContent_lblLndSize')
  const saleDate = spanById(html, 'MainContent_lblSaleDate')
  const salePrice = moneyToNumber(spanById(html, 'MainContent_lblPrice'))
  const bookPage = spanById(html, 'MainContent_lblBp')
  const yearBuilt = firstInt(spanById(html, 'MainContent_ctl02_lblYearBuilt'))
  const livingAreaSqft = firstInt(
    spanById(html, 'MainContent_ctl02_lblBldArea')?.replace(/,/g, ''),
  )
  const buildingCount = firstInt(spanById(html, 'MainContent_lblBldCount'))
  const useCode = spanById(html, 'MainContent_lblUseCode')
  const useCodeDescription = spanById(html, 'MainContent_lblUseCodeDescription')

  const beds = firstInt(tableCellAfterLabel(html, 'Total Bedrooms'))
  const fullBaths = firstInt(tableCellAfterLabel(html, 'Total Bthrms'))
  const halfBaths = firstInt(tableCellAfterLabel(html, 'Total Half Baths'))
  const totalRooms = firstInt(tableCellAfterLabel(html, 'Total Rooms'))
  const style = tableCellAfterLabel(html, 'Style')
  const model = tableCellAfterLabel(html, 'Model')

  // Photo src uses Windows backslashes inside the URL string.
  const photoSrc =
    html.match(
      /id=["']MainContent_ctl02_imgPhoto["'][^>]*src=["']([^"']+)["']/i,
    )?.[1] ??
    html.match(
      /src=["'](https:\/\/images\.vgsi\.com\/photos2\/[^"']+)["']/i,
    )?.[1] ??
    null
  const photo_url = photoSrc
    ? photoSrc.replace(/\\/g, '/').replace(/([^:])\/{2,}/g, '$1/')
    : null

  const streetLine = location?.replace(/\s+/g, ' ').trim() ?? null
  const streetNo = streetLine?.match(/^(\d+[A-Za-z]?)\s+(.+)$/)?.[1] ?? null
  const streetName = streetLine?.match(/^(\d+[A-Za-z]?)\s+(.+)$/)?.[2] ?? null
  // Westport parcel header has no reliable ZIP span (owner mail block varies).
  const zip = null

  const addressNorm = streetLine
    ? `${streetLine}, ${TOWN}, CT`
        .toUpperCase()
        .replace(/[.,#]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    : null

  return {
    town: TOWN,
    vision_pid: String(visionPid),
    vision_pid_page: pidConfirm,
    account_number: acct,
    mblu,
    address_full: streetLine ? `${streetLine}, ${TOWN}, CT` : null,
    address_norm: addressNorm,
    street_no: streetNo,
    street_name: streetName,
    city: TOWN,
    state: 'CT',
    zip,
    owner_name: owner,
    use_code: useCode,
    use_code_description: useCodeDescription,
    assessed_value: assessed,
    appraisal_value: appraisal,
    building_count: buildingCount,
    year_built: yearBuilt,
    living_area_sqft: livingAreaSqft,
    beds,
    full_baths: fullBaths,
    half_baths: halfBaths,
    total_rooms: totalRooms,
    style,
    model,
    acres: acresRaw ? Number(acresRaw) : null,
    zoning: zone,
    last_sale_price: salePrice,
    last_sale_date: saleDate,
    last_sale_book_page: bookPage,
    photo_url,
    parcel_url: `${BASE}/Parcel.aspx?pid=${visionPid}`,
    source_host: 'gis.vgsi.com/westportct',
    scraped_at: new Date().toISOString(),
  }
}

async function main() {
  const rows = []
  const seen = new Set()

  for (const street of STREET_NAMES) {
    if (rows.length >= TARGET) break
    const streetUrl = `${BASE}/Streets.aspx?Name=${encodeURIComponent(street)}`
    console.info(`[street] ${streetUrl}`)
    const streetHtml = await fetchText(streetUrl)
    const links = parcelLinksFromStreetHtml(streetHtml)
    console.info(`[street] ${street}: ${links.length} parcels`)

    for (const link of links) {
      if (rows.length >= TARGET) break
      if (seen.has(link.visionPid)) continue
      seen.add(link.visionPid)
      const parcelUrl = `${BASE}/Parcel.aspx?pid=${link.visionPid}`
      console.info(`[parcel] ${link.addressLabel} → ${parcelUrl}`)
      const html = await fetchText(parcelUrl)
      const row = parseParcelHtml(html, link.visionPid)
      rows.push(row)
      await new Promise((r) => setTimeout(r, 400))
    }
  }

  const dir = join(dirname(fileURLToPath(import.meta.url)), 'out')
  mkdirSync(dir, { recursive: true })
  const outPath = join(dir, 'vision-addresses-westport-sample.json')
  writeFileSync(outPath, JSON.stringify({ town: TOWN, count: rows.length, rows }, null, 2))
  console.info(`[done] wrote ${rows.length} rows → ${outPath}`)
  console.info(JSON.stringify(rows, null, 2))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
