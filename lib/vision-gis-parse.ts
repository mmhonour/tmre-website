import { createHash } from 'node:crypto'
import { normalizePropertyAddress } from '@/lib/property-address'

export type VisionParcelParse = {
  town: string
  visionPid: string
  accountNumber: string | null
  mblu: string | null
  useCode: string | null
  useCodeDescription: string | null
  addressFull: string | null
  addressNorm: string | null
  streetNo: string | null
  streetName: string | null
  city: string
  state: string
  zip: string | null
  ownerName: string | null
  assessedValue: number | null
  appraisalValue: number | null
  buildingCount: number | null
  yearBuilt: number | null
  livingAreaSqft: number | null
  beds: number | null
  fullBaths: number | null
  halfBaths: number | null
  totalRooms: number | null
  style: string | null
  model: string | null
  acres: number | null
  zoning: string | null
  lastSalePrice: number | null
  lastSaleDate: string | null
  lastSaleBookPage: string | null
  photoUrl: string | null
  parcelUrl: string
  sourceHost: string
  contentFingerprint: string
}

function decodeHtml(s: string): string {
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

function spanById(html: string, id: string): string | null {
  const re = new RegExp(
    `id=["']${id}["'][^>]*>([\\s\\S]*?)</(?:span|a|div|td)>`,
    'i',
  )
  const m = html.match(re)
  if (!m) return null
  return decodeHtml(m[1].replace(/<[^>]+>/g, ' '))
}

function tableCellAfterLabel(html: string, label: string): string | null {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(
    `<td[^>]*>\\s*${escaped}\\s*:?\\s*</td>\\s*<td[^>]*>\\s*([^<]+)\\s*</td>`,
    'i',
  )
  const m = html.match(re)
  return m ? decodeHtml(m[1]) : null
}

function moneyToNumber(raw: string | null): number | null {
  if (!raw) return null
  const n = Number(String(raw).replace(/[$,]/g, ''))
  return Number.isFinite(n) ? Math.round(n) : null
}

function firstInt(raw: string | null | undefined): number | null {
  if (!raw) return null
  const m = String(raw).match(/(\d+)/)
  return m ? Number(m[1]) : null
}

export function parcelLinksFromStreetHtml(html: string): {
  visionPid: string
  addressLabel: string
}[] {
  const out: { visionPid: string; addressLabel: string }[] = []
  const re = /Parcel\.aspx\?pid=(\d+)['"][^>]*>([^<]+)</gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    out.push({
      visionPid: m[1],
      addressLabel: decodeHtml(m[2]),
    })
  }
  return out
}

export function streetNamesFromLetterHtml(html: string): string[] {
  const names = new Set<string>()
  const re = /Streets\.aspx\?Name=([^"'&]+)/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    try {
      names.add(decodeURIComponent(m[1].replace(/\+/g, ' ')).trim())
    } catch {
      names.add(m[1].replace(/\+/g, ' ').trim())
    }
  }
  return [...names].filter(Boolean).sort((a, b) => a.localeCompare(b))
}

function fingerprintFromFields(fields: Record<string, unknown>): string {
  const stable = JSON.stringify(fields)
  return createHash('sha256').update(stable).digest('hex').slice(0, 32)
}

export function parseVisionParcelHtml(
  html: string,
  opts: { town: string; visionPid: string; baseUrl: string; sourceHost: string },
): VisionParcelParse {
  const location = spanById(html, 'MainContent_lblLocation')
  const mblu = spanById(html, 'MainContent_lblMblu')
  const acct = spanById(html, 'MainContent_lblAcctNum')
  const owner = spanById(html, 'MainContent_lblGenOwner')
  const assessed = moneyToNumber(spanById(html, 'MainContent_lblGenAssessment'))
  const appraisal = moneyToNumber(spanById(html, 'MainContent_lblGenAppraisal'))
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

  const photoSrc =
    html.match(
      /id=["']MainContent_ctl02_imgPhoto["'][^>]*src=["']([^"']+)["']/i,
    )?.[1] ??
    html.match(
      /src=["'](https:\/\/images\.vgsi\.com\/photos2\/[^"']+)["']/i,
    )?.[1] ??
    null
  const photoUrl = photoSrc
    ? photoSrc.replace(/\\/g, '/').replace(/([^:])\/{2,}/g, '$1/')
    : null

  const streetLine = location?.replace(/\s+/g, ' ').trim() ?? null
  const streetNo = streetLine?.match(/^(\d+[A-Za-z]?)\s+(.+)$/)?.[1] ?? null
  const streetName = streetLine?.match(/^(\d+[A-Za-z]?)\s+(.+)$/)?.[2] ?? null
  const addressFull = streetLine ? `${streetLine}, ${opts.town}, CT` : null
  const addressNorm = streetLine
    ? normalizePropertyAddress(opts.town, streetLine, null)
    : null

  const acres = acresRaw ? Number(acresRaw) : null

  const contentFingerprint = fingerprintFromFields({
    accountNumber: acct,
    mblu,
    useCode,
    ownerName: owner,
    assessedValue: assessed,
    appraisalValue: appraisal,
    yearBuilt,
    livingAreaSqft,
    beds,
    fullBaths,
    halfBaths,
    acres: Number.isFinite(acres) ? acres : null,
    zoning: zone,
    lastSalePrice: salePrice,
    lastSaleDate: saleDate,
    lastSaleBookPage: bookPage,
    addressFull,
  })

  return {
    town: opts.town,
    visionPid: String(opts.visionPid),
    accountNumber: acct,
    mblu,
    useCode,
    useCodeDescription,
    addressFull,
    addressNorm,
    streetNo,
    streetName: streetName ?? (streetNo ? null : streetLine),
    city: opts.town,
    state: 'CT',
    zip: null,
    ownerName: owner,
    assessedValue: assessed,
    appraisalValue: appraisal,
    buildingCount,
    yearBuilt,
    livingAreaSqft,
    beds,
    fullBaths,
    halfBaths,
    totalRooms,
    style,
    model: model || null,
    acres: Number.isFinite(acres as number) ? (acres as number) : null,
    zoning: zone,
    lastSalePrice: salePrice,
    lastSaleDate: saleDate,
    lastSaleBookPage: bookPage,
    photoUrl,
    parcelUrl: `${opts.baseUrl}/Parcel.aspx?pid=${opts.visionPid}`,
    sourceHost: opts.sourceHost,
    contentFingerprint,
  }
}
