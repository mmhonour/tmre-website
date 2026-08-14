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
  fieldCard: VisionFieldCardJson
}

export type VisionFieldCardField = {
  section: string
  label: string
  value: string
}

/** Parsed Field Card for Neon jsonb — display, processing, and Find text search. */
export type VisionFieldCardJson = {
  version: 1
  fields: VisionFieldCardField[]
  searchText: string
}

const CONTROL_ID_META: Record<string, { section: string; label: string }> = {
  MainContent_lblLocation: { section: 'Parcel', label: 'Location' },
  MainContent_lblMblu: { section: 'Parcel', label: 'MBLU' },
  MainContent_lblAcctNum: { section: 'Parcel', label: 'Account' },
  MainContent_lblPid: { section: 'Parcel', label: 'PID' },
  MainContent_lblGenOwner: { section: 'Parcel', label: 'Owner' },
  MainContent_lblCoOwner: { section: 'Parcel', label: 'Co-owner' },
  MainContent_lblAddr1: { section: 'Parcel', label: 'Owner address' },
  MainContent_lblAddr2: { section: 'Parcel', label: 'Owner address 2' },
  MainContent_lblGenAssessment: { section: 'Valuation', label: 'Assessment' },
  MainContent_lblGenAppraisal: { section: 'Valuation', label: 'Appraisal' },
  MainContent_lblBldCount: { section: 'Building', label: 'Buildings' },
  MainContent_lblUseCode: { section: 'Parcel', label: 'Use code' },
  MainContent_lblUseCodeDescription: { section: 'Parcel', label: 'Use' },
  MainContent_lblZone: { section: 'Parcel', label: 'Zoning' },
  MainContent_lblLndSize: { section: 'Land', label: 'Acres' },
  MainContent_lblSaleDate: { section: 'Sale', label: 'Sale date' },
  MainContent_lblPrice: { section: 'Sale', label: 'Sale price' },
  MainContent_lblBp: { section: 'Sale', label: 'Book / page' },
  MainContent_lblNbhd: { section: 'Parcel', label: 'Neighborhood' },
  MainContent_lblLUC: { section: 'Parcel', label: 'LUC' },
}

const SKIP_CONTROL_RE = /(img|btn|hyp|menu|script|link|panel|tab|grid)/i

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

function humanizeControlId(id: string): string {
  const tail = id
    .replace(/^MainContent_/i, '')
    .replace(/^ctl\d+_/i, '')
    .replace(/^lbl/i, '')
  return tail
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
}

function inferSectionAt(html: string, index: number): string {
  const before = html.slice(Math.max(0, index - 1200), index)
  const matches = [
    ...before.matchAll(
      /<(?:h[1-6]|legend|caption|th)[^>]*>\s*([^<]{2,60}?)\s*<\/(?:h[1-6]|legend|caption|th)>/gi,
    ),
  ]
  const last = matches.at(-1)?.[1]
  if (!last) return 'Field card'
  const label = decodeHtml(last.replace(/<[^>]+>/g, ' '))
  if (!label || /javascript|click here|more info/i.test(label)) return 'Field card'
  return label
}

function isUsefulFieldValue(value: string): boolean {
  const v = value.trim()
  if (!v || v === '-' || v === '—' || v === '.') return false
  if (/^javascript:/i.test(v)) return false
  if (/^https?:\/\/images\.vgsi\.com/i.test(v)) return false
  return v.length <= 240
}

function pushField(
  fields: VisionFieldCardField[],
  seen: Set<string>,
  section: string,
  label: string,
  value: string,
) {
  const cleanLabel = decodeHtml(label).replace(/:\s*$/, '').trim()
  const cleanValue = decodeHtml(value)
  if (!cleanLabel || !isUsefulFieldValue(cleanValue)) return
  if (/^(more|click|view map|print)$/i.test(cleanLabel)) return
  const key = `${section.toLowerCase()}|${cleanLabel.toLowerCase()}|${cleanValue.toLowerCase()}`
  if (seen.has(key)) return
  seen.add(key)
  fields.push({ section, label: cleanLabel, value: cleanValue })
}

/** All labeled Field Card pairs — stored as jsonb for display and Find search. */
export function parseVisionFieldCardJson(html: string): VisionFieldCardJson {
  const fields: VisionFieldCardField[] = []
  const seen = new Set<string>()

  const idRe =
    /id=["'](MainContent_[^"']+)["'][^>]*>([\s\S]*?)<\/(?:span|a|div|td|label)>/gi
  let m: RegExpExecArray | null
  while ((m = idRe.exec(html)) !== null) {
    const id = m[1] ?? ''
    if (SKIP_CONTROL_RE.test(id)) continue
    const raw = decodeHtml((m[2] ?? '').replace(/<[^>]+>/g, ' '))
    const meta = CONTROL_ID_META[id]
    const section = meta?.section ?? inferSectionAt(html, m.index)
    const label = meta?.label ?? humanizeControlId(id)
    pushField(fields, seen, section, label, raw)
  }

  const tdRe =
    /<td[^>]*>\s*([^<]{1,80}?)\s*:?\s*<\/td>\s*<td[^>]*>\s*([^<]+)\s*<\/td>/gi
  while ((m = tdRe.exec(html)) !== null) {
    const label = m[1] ?? ''
    const value = m[2] ?? ''
    pushField(fields, seen, inferSectionAt(html, m.index), label, value)
  }

  const searchText = fields
    .map((f) => `${f.label} ${f.value}`)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 8000)

  return { version: 1, fields, searchText }
}

export function fieldCardFromTypedVision(row: {
  visionPid?: string | null
  accountNumber?: string | null
  mblu?: string | null
  useCode?: string | null
  useCodeDescription?: string | null
  ownerName?: string | null
  assessedValue?: number | null
  appraisalValue?: number | null
  yearBuilt?: number | null
  livingAreaSqft?: number | null
  beds?: number | null
  fullBaths?: number | null
  halfBaths?: number | null
  totalRooms?: number | null
  style?: string | null
  model?: string | null
  acres?: number | null
  zoning?: string | null
  lastSalePrice?: number | null
  lastSaleDate?: string | null
  lastSaleBookPage?: string | null
  buildingCount?: number | null
  addressFull?: string | null
}): VisionFieldCardJson {
  const pairs: [string, string, string | number | null | undefined][] = [
    ['Parcel', 'Location', row.addressFull],
    ['Parcel', 'Owner', row.ownerName],
    ['Parcel', 'MBLU', row.mblu],
    ['Parcel', 'Account', row.accountNumber],
    ['Parcel', 'PID', row.visionPid],
    ['Parcel', 'Use code', row.useCode],
    ['Parcel', 'Use', row.useCodeDescription],
    ['Parcel', 'Zoning', row.zoning],
    ['Valuation', 'Assessment', row.assessedValue],
    ['Valuation', 'Appraisal', row.appraisalValue],
    ['Land', 'Acres', row.acres],
    ['Building', 'Buildings', row.buildingCount],
    ['Building', 'Year built', row.yearBuilt],
    ['Building', 'Living area', row.livingAreaSqft],
    ['Building', 'Beds', row.beds],
    ['Building', 'Full baths', row.fullBaths],
    ['Building', 'Half baths', row.halfBaths],
    ['Building', 'Rooms', row.totalRooms],
    ['Building', 'Style', row.style],
    ['Building', 'Model', row.model],
    ['Sale', 'Sale price', row.lastSalePrice],
    ['Sale', 'Sale date', row.lastSaleDate],
    ['Sale', 'Book / page', row.lastSaleBookPage],
  ]
  const fields: VisionFieldCardField[] = []
  const seen = new Set<string>()
  for (const [section, label, value] of pairs) {
    if (value == null || value === '') continue
    pushField(fields, seen, section, label, String(value))
  }
  const searchText = fields.map((f) => `${f.label} ${f.value}`).join(' ')
  return { version: 1, fields, searchText }
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
    fieldCard: parseVisionFieldCardJson(html),
  }
}
