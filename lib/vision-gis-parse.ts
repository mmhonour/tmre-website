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
  ownerMailingAddress: string | null
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

/** One row from VGSI Ownership History (`#MainContent_grdSales`) or the Field Card PDF. */
export type VisionOwnershipRow = {
  owner: string
  date: string
  price: string | null
  bookPage: string | null
  qualified: string | null
  instrument: string | null
}

/** Parsed Field Card for Neon jsonb — display, processing, and Find text search. */
export type VisionFieldCardJson = {
  version: 1
  fields: VisionFieldCardField[]
  searchText: string
  ownership?: VisionOwnershipRow[]
}

export function parseVisionMoney(
  value: string | number | null | undefined,
): number | null {
  if (value == null || value === '') return null
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }
  const cleaned = String(value).replace(/[$,\s]/g, '')
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

/** Assessor-style $1,234,567 (not compact $1.23M). */
export function formatVisionMoney(
  value: string | number | null | undefined,
): string | null {
  const n = parseVisionMoney(value)
  if (n == null) return null
  const sign = n < 0 ? '-' : ''
  return `${sign}$${Math.round(Math.abs(n)).toLocaleString('en-US')}`
}

export function isVisionMoneyLabel(section: string, label: string): boolean {
  const hay = `${section} ${label}`.toLowerCase()
  if (/assessment|appraisal|sale price|appraised|assessed value|sale amount/.test(hay)) {
    return true
  }
  return (
    /(^|\s)value$/.test(label.toLowerCase()) &&
    /valuation|land|extra|feature|sale/.test(section.toLowerCase())
  )
}

export function formatVisionFieldValue(
  section: string,
  label: string,
  value: string,
): string {
  if (!isVisionMoneyLabel(section, label)) return value
  return formatVisionMoney(value) ?? value
}

export function ownershipFromVisionHtml(html: string): VisionOwnershipRow[] {
  const table = html.match(
    /id=["']MainContent_grdSales["'][\s\S]*?<\/table>/i,
  )?.[0]
  if (!table) return []
  const rows: VisionOwnershipRow[] = []
  const trRe =
    /<tr[^>]*class=["'](?:RowStyle|AltRowStyle)["'][^>]*>([\s\S]*?)<\/tr>/gi
  let m: RegExpExecArray | null
  while ((m = trRe.exec(table)) !== null) {
    const cells = [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) =>
      decodeHtml((c[1] ?? '').replace(/<[^>]+>/g, ' ')).replace(/\u00a0/g, ' '),
    )
    if (cells.length < 5) continue
    const [owner, price, bookPage, instrument, date] = cells
    if (!owner && !date) continue
    rows.push({
      owner: owner ?? '',
      date: date ?? '',
      price: price && price !== '-' && price !== '—' ? price : null,
      bookPage: bookPage && bookPage !== '-' ? bookPage : null,
      qualified: null,
      instrument: instrument && instrument !== '-' ? instrument : null,
    })
  }
  return rows
}

export function ownershipFromFieldCardFields(
  fields: VisionFieldCardField[],
): VisionOwnershipRow[] {
  const rows: VisionOwnershipRow[] = []
  for (const field of fields) {
    if (field.section !== 'Ownership') continue
    if (/^not listed/i.test(field.value) || /^history$/i.test(field.label)) {
      continue
    }
    const parts = field.value.split(/\s·\s/).map((s) => s.trim())
    const dateLike = /\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/.test(field.label)
    rows.push({
      owner: parts[0] ?? '',
      date: dateLike ? field.label : '',
      price: parts[1] && parts[1] !== '—' ? parts[1] : null,
      bookPage: parts[2] && parts[2] !== '—' ? parts[2] : null,
      qualified: parts[3] && parts[3] !== '—' ? parts[3] : null,
      instrument: parts[4] && parts[4] !== '—' ? parts[4] : null,
    })
  }
  return rows
}

function isOwnerMailingLabel(label: string, section: string): boolean {
  const l = label.trim().toLowerCase()
  if (/^owner address/.test(l) || /mailing/.test(l)) return true
  const sec = section.trim().toLowerCase()
  return l === 'address' && /parcel|owner/.test(sec)
}

/** VGSI mailing lines (`MainContent_lblAddr1` / `lblAddr2`, or Parcel “Address”). */
export function ownerMailingAddressFromFields(
  fields: readonly VisionFieldCardField[],
): string | null {
  const lines = fields
    .filter((f) => isOwnerMailingLabel(f.label, f.section))
    .map((f) => f.value.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
  const unique = [...new Set(lines)]
  return unique.length > 0 ? unique.join(', ') : null
}

export function ownerDisplayNameFromFields(
  fields: readonly VisionFieldCardField[],
  ownerName?: string | null,
): string | null {
  const owner =
    ownerName?.trim() ||
    fields.find((f) => /^owner$/i.test(f.label))?.value?.trim() ||
    null
  const coOwner = fields.find((f) => /^co-owner$/i.test(f.label))?.value?.trim()
  if (owner && coOwner && !owner.toLowerCase().includes(coOwner.toLowerCase())) {
    return `${owner} & ${coOwner}`
  }
  return owner || coOwner || null
}

/** Calendar year from VGSI dates (`03/21/2025`, `3-21-25`, `2025`). */
export function yearFromVisionDate(
  date: string | null | undefined,
): number | null {
  if (!date) return null
  const full = date.match(/(18|19|20)\d{2}/)
  if (full) {
    const y = Number(full[0])
    return y >= 1800 && y <= 2100 ? y : null
  }
  const short = date.match(/\d{1,2}[/-]\d{1,2}[/-](\d{2})\b/)
  if (!short?.[1]) return null
  const yy = Number(short[1])
  const y = yy >= 70 ? 1900 + yy : 2000 + yy
  return y >= 1800 && y <= 2100 ? y : null
}

export const VISION_SALES_HISTORY_ID = 'sales-history'

export type VisionPaidSale = {
  date: string
  year: number
  price: number
}

/**
 * Last deed with consideration. $0 / instrument 29 quitclaims do not count.
 */
export function visionLastPaidSale(opts: {
  lastSaleDate?: string | null
  lastSalePrice?: number | null
  ownership?: readonly VisionOwnershipRow[]
}): VisionPaidSale | null {
  const paid = (opts.ownership ?? [])
    .map((row) => ({
      date: row.date?.trim() || null,
      year: yearFromVisionDate(row.date),
      price: parseVisionMoney(row.price),
    }))
    .filter(
      (row): row is VisionPaidSale =>
        Boolean(row.date) &&
        row.year != null &&
        row.price != null &&
        row.price > 0,
    )
    .sort((a, b) => b.year - a.year)
  if (paid[0]) return paid[0]
  if ((opts.lastSalePrice ?? 0) > 0 && opts.lastSaleDate?.trim()) {
    const year = yearFromVisionDate(opts.lastSaleDate)
    if (year != null) {
      return {
        date: opts.lastSaleDate.trim(),
        year,
        price: opts.lastSalePrice as number,
      }
    }
  }
  return null
}

/**
 * Date of the last paid purchase (price > 0). A $0 / instrument 29 quitclaim
 * is not a purchase — it puts name(s) on record without warranty.
 */
export function visionPurchaseDate(opts: {
  lastSaleDate?: string | null
  lastSalePrice?: number | null
  ownership?: readonly VisionOwnershipRow[]
}): string | null {
  return visionLastPaidSale(opts)?.date ?? null
}

/** Year from {@link visionPurchaseDate}, when a paid purchase exists. */
export function visionPurchaseYear(opts: {
  lastSaleDate?: string | null
  lastSalePrice?: number | null
  ownership?: readonly VisionOwnershipRow[]
}): number | null {
  return yearFromVisionDate(visionPurchaseDate(opts))
}

function visionInstrumentCode(instrument: string | null | undefined): string | null {
  const raw = instrument?.trim()
  if (!raw) return null
  if (!/^\d+$/.test(raw)) return raw
  return String(Number(raw)).padStart(2, '0')
}

/**
 * Westport VGSI: 29 + $0 is a quitclaim (record title, no warranty).
 * 00 with consideration is the warranty / purchase deed.
 */
export function isVisionQuitclaim(opts: {
  price?: string | number | null
  instrument?: string | null
}): boolean {
  const code = visionInstrumentCode(opts.instrument)
  if (code === '29') return true
  const price = parseVisionMoney(opts.price)
  return price === 0
}

export function countVisionQuitclaims(
  ownership: readonly VisionOwnershipRow[] | null | undefined,
): number {
  return (ownership ?? []).filter((row) => isVisionQuitclaim(row)).length
}

export function visionInstrumentLabel(
  instrument: string | null | undefined,
): string | null {
  const raw = instrument?.trim()
  if (!raw) return null
  const code = visionInstrumentCode(raw)
  const names: Record<string, string> = {
    '00': 'Warranty',
    '29': 'Quitclaim',
  }
  const name = code ? names[code] : null
  return name ? `${name} (${raw})` : raw
}

export function lastSaleAsOwnership(row: {
  ownerName?: string | null
  lastSalePrice?: number | null
  lastSaleDate?: string | null
  lastSaleBookPage?: string | null
}): VisionOwnershipRow[] {
  if (row.lastSaleDate == null && row.lastSalePrice == null) return []
  return [
    {
      owner: row.ownerName ?? '',
      date: row.lastSaleDate ?? '',
      price:
        row.lastSalePrice != null
          ? formatVisionMoney(row.lastSalePrice)
          : null,
      bookPage: row.lastSaleBookPage ?? null,
      qualified: null,
      instrument: null,
    },
  ]
}

function cardSearchText(
  fields: VisionFieldCardField[],
  ownership: VisionOwnershipRow[] = [],
): string {
  return [
    ...fields.map((f) => `${f.label} ${f.value}`),
    ...ownership.map((r) =>
      [r.owner, r.date, r.price, r.bookPage, r.instrument]
        .filter(Boolean)
        .join(' '),
    ),
  ]
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 8000)
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

/** VGSI puts street + city in one span separated by `<br>`. */
function htmlInnerText(raw: string): string {
  return decodeHtml(raw.replace(/<br\s*\/?>/gi, ', ').replace(/<[^>]+>/g, ' '))
}

function spanById(html: string, id: string): string | null {
  const re = new RegExp(
    `id=["']${id}["'][^>]*>([\\s\\S]*?)</(?:span|a|div|td)>`,
    'i',
  )
  const m = html.match(re)
  if (!m) return null
  return htmlInnerText(m[1])
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

const TABLE_LABEL_ALLOW = new Set(
  [
    'Style',
    'Model',
    'Grade',
    'Stories',
    'Occupancy',
    'Exterior Wall 1',
    'Exterior Wall 2',
    'Roof Structure',
    'Roof Cover',
    'Interior Wall 1',
    'Interior Flr 1',
    'Heat Fuel',
    'Heat Type',
    'AC Type',
    'Total Bedrooms',
    'Total Bthrms',
    'Total Half Baths',
    'Total Xtra Fixtrs',
    'Total Rooms',
    'Bath Style',
    'Kitchen Style',
    'Year Built',
    'Living Area',
    'Kitchens',
    'Fireplaces',
    'Interior Cond',
  ].map((s) => s.toLowerCase()),
)

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
    const meta = CONTROL_ID_META[id]
    if (!meta) continue
    const raw = htmlInnerText(m[2] ?? '')
    pushField(fields, seen, meta.section, meta.label, raw)
  }

  const tdRe =
    /<td[^>]*>\s*([^<]{1,80}?)\s*:?\s*<\/td>\s*<td[^>]*>\s*([^<]+)\s*<\/td>/gi
  while ((m = tdRe.exec(html)) !== null) {
    const label = decodeHtml(m[1] ?? '').replace(/:\s*$/, '')
    if (!TABLE_LABEL_ALLOW.has(label.toLowerCase())) continue
    const value = m[2] ?? ''
    pushField(fields, seen, inferSectionAt(html, m.index), label, value)
  }

  const ownership = ownershipFromVisionHtml(html)
  return {
    version: 1,
    fields,
    searchText: cardSearchText(fields, ownership),
    ownership: ownership.length > 0 ? ownership : undefined,
  }
}

export function fieldCardFromTypedVision(row: {
  visionPid?: string | null
  accountNumber?: string | null
  mblu?: string | null
  useCode?: string | null
  useCodeDescription?: string | null
  ownerName?: string | null
  ownerMailingAddress?: string | null
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
    ['Parcel', 'Owner address', row.ownerMailingAddress],
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
    const raw =
      typeof value === 'number' && isVisionMoneyLabel(section, label)
        ? formatVisionMoney(value) ?? String(value)
        : String(value)
    pushField(fields, seen, section, label, raw)
  }
  const ownership = lastSaleAsOwnership(row)
  return {
    version: 1,
    fields,
    searchText: cardSearchText(fields, ownership),
    ownership: ownership.length > 0 ? ownership : undefined,
  }
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
  const ownerAddr1 = spanById(html, 'MainContent_lblAddr1')
  const ownerAddr2 = spanById(html, 'MainContent_lblAddr2')
  const ownerMailingAddress = ownerMailingAddressFromFields([
    ...(ownerAddr1
      ? [{ section: 'Parcel', label: 'Owner address', value: ownerAddr1 }]
      : []),
    ...(ownerAddr2
      ? [{ section: 'Parcel', label: 'Owner address 2', value: ownerAddr2 }]
      : []),
  ])
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
    ownerMailingAddress,
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
    ownerMailingAddress,
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
