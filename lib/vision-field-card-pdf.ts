import { inflateSync } from 'node:zlib'
import type { VisionFieldCardField, VisionFieldCardJson } from '@/lib/vision-gis-parse'
import { visionGisFieldCardPdfUrl } from '@/lib/vision-gis-towns'

const MULTI_LABELS = new Set(['comment', 'note', 'extra feature', 'transfer'])

function mergeKey(section: string, label: string, value: string, uniqueByValue: boolean) {
  return uniqueByValue
    ? `${section}|${label}|${value}`.toLowerCase()
    : `${section}|${label}`.toLowerCase()
}

function push(
  fields: VisionFieldCardField[],
  seen: Set<string>,
  section: string,
  label: string,
  value: string | null | undefined,
  uniqueByValue = false,
) {
  const v = (value ?? '')
    .replace(/&(?=\S)/g, '& ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!v || v === '-' || v === '—' || v === '0') return
  const key = mergeKey(section, label, v, uniqueByValue || MULTI_LABELS.has(label.toLowerCase()))
  if (seen.has(key)) return
  seen.add(key)
  fields.push({ section, label, value: v })
}

/** VGSI PDFs paint each glyph separately (`M A R K S`). Collapse to words. */
export function collapseVisionPdfGlyphs(raw: string): string {
  return raw
    .split(/\s{2,}/)
    .map((word) => word.replace(/ /g, ''))
    .filter(Boolean)
    .join(' ')
}

function looksLikeFieldCardStream(text: string): boolean {
  if (text.length < 80) return false
  if (/QE\u0014QE|EQE/.test(text) && !/Account #/.test(text)) return false
  return /Account #/.test(text) && /Property Location|Year Built|CURRENT OWNER/.test(text)
}

export function extractVisionPdfText(buffer: Buffer): string {
  const latin = buffer.toString('latin1')
  const streams = [...latin.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)]
  const chunks: string[] = []
  for (const match of streams) {
    const raw = Buffer.from(match[1] ?? '', 'latin1')
    const candidates = [raw, raw.subarray(2)]
    for (const slice of candidates) {
      try {
        const out = inflateSync(slice).toString('latin1')
        const bits = [...out.matchAll(/\((?:\\.|[^\\)])*\)/g)].map((m) =>
          m[0]
            .slice(1, -1)
            .replace(/\\n/g, '\n')
            .replace(/\\(.)/g, '$1'),
        )
        const collapsed = collapseVisionPdfGlyphs(bits.join(' '))
        if (looksLikeFieldCardStream(collapsed)) {
          chunks.push(collapsed)
        }
        break
      } catch {
        /* try next slice */
      }
    }
  }
  return chunks.join('\n')
}

function first(text: string, pattern: RegExp): string | null {
  return text.match(pattern)?.[1] ?? null
}

function livingAndGross(text: string): { living: string | null; gross: string | null } {
  const i = text.indexOf('Ttl Gross Liv')
  if (i < 0) return { living: null, gross: null }
  const nums = [...text.slice(i, i + 90).matchAll(/(\d{1,3},\d{3})/g)]
    .map((m) => m[1].replace(/^0+(?=\d)/, ''))
    .filter((n) => {
      const v = Number(n.replace(/,/g, ''))
      return v >= 200 && v <= 80_000
    })
  if (nums.length >= 2) {
    return { living: nums[nums.length - 2], gross: nums[nums.length - 1] }
  }
  return { living: nums[0] ?? null, gross: null }
}

function salePriceFromPdf(text: string): string | null {
  return (
    first(text, /((?:[1-9]|[12]\d),\d{3},\d{3})(?:\d{1,3}(?:,\d{3})+)?000I{3}/) ??
    first(text, /(\d{2,3},\d{3})000I{3}/)
  )
}

function chunkDigits(raw: string, size: number): string[] {
  const out: string[] = []
  for (let i = 0; i + size <= raw.length; i += size) {
    out.push(raw.slice(i, i + size))
  }
  return out
}

function compactLetters(s: string): string {
  return s.replace(/[^A-Z0-9]/gi, '')
}

function splitAtCompact(hist: string, compactIndex: number): { left: string; right: string } {
  let compact = 0
  let i = 0
  while (i < hist.length && compact < compactIndex) {
    if (/[A-Z0-9]/i.test(hist[i] ?? '')) compact += 1
    i += 1
  }
  return { left: hist.slice(0, i), right: hist.slice(i) }
}

function completeCurrentOwner(
  stub: string,
  hist: string,
): { owner: string; rest: string } {
  const stubLast = stub.split(/\s+/).at(-1) ?? ''
  const stubLastRe = stubLast.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const glued = stubLastRe
    ? hist.match(
        new RegExp(
          `${stubLastRe}([A-Z]{1,2})([A-Z]{6,12})\\s+([A-Z]{3,})\\s+TRUSTEE`,
        ),
      )
    : null
  if (glued) {
    const at = hist.indexOf(glued[0])
    return {
      owner: `${stub}${glued[1]}`.replace(/&(?=\S)/g, '& ').replace(/\s+/g, ' ').trim(),
      rest: `${glued[2]} ${glued[3]} TRUSTEE${hist.slice(at + glued[0].length)}`,
    }
  }
  const stubC = compactLetters(stub)
  const histC = compactLetters(hist)
  if (!stubC || !histC.startsWith(stubC)) {
    return { owner: stub, rest: hist }
  }
  let best = { owner: stub, rest: hist, score: -1 }
  for (let n = 0; n <= 3; n += 1) {
    const { left, right } = splitAtCompact(hist, stubC.length + n)
    const rest = right.replace(/^[\s&]+/, '')
    const owner = left.replace(/&(?=\S)/g, '& ').replace(/\s+/g, ' ').trim()
    const ownerLast = owner.split(/\s+/).at(-1) ?? ''
    const restFirst = rest.split(/[\s&]+/)[0] ?? ''
    let score = 0
    if (ownerLast.length > stubLast.length && ownerLast.length <= stubLast.length + 3) {
      score += 4
    }
    if (/^[A-Z]{6,8}$/.test(ownerLast)) score += 2
    if (/^[A-Z]{6,12}$/.test(restFirst)) score += 2
    if (/^[A-Z]{4,} [A-Z]/.test(rest)) score += 2
    if (score > best.score) best = { owner, rest, score }
  }
  return { owner: best.owner, rest: best.rest }
}

function respaceGluedName(row: string, surnames: string[]): string {
  const spaced = row.replace(/&(?=\S)/g, '& ').replace(/\s+/g, ' ').trim()
  const beforeTrustee = spaced.replace(/\s+TRUSTEE.*$/i, '')
  if (/\s/.test(beforeTrustee)) return spaced
  for (const surname of [...surnames].sort((a, b) => b.length - a.length)) {
    if (
      spaced.toUpperCase().startsWith(surname.toUpperCase()) &&
      spaced.length > surname.length &&
      spaced[surname.length] !== ' '
    ) {
      return `${surname} ${spaced.slice(surname.length)}`.replace(/\s+/g, ' ')
    }
  }
  return spaced
}

export type VisionOwnershipRow = {
  owner: string
  date: string
  price: string | null
  bookPage: string | null
  qualified: string | null
  instrument: string | null
}

/** Record of Ownership block from a VGSI Field Card PDF (prototype: 3959). */
export function ownershipFromPdf(text: string): VisionOwnershipRow[] {
  const rec = text.indexOf('RECORD OF OWNERSHIP')
  if (rec < 0) return []
  const before = text.slice(Math.max(0, rec - 220), rec)
  const head = before.match(
    /([IQUV]{4,})((?:\d{2}-\d{2}-\d{4}){2,})(\d{8,})$/,
  )
  const codes = head?.[1] ?? ''
  const dateBlob = head?.[2] ?? ''
  const pageBlob = head?.[3] ?? ''
  const dates = dateBlob.match(/\d{2}-\d{2}-\d{4}/g) ?? []
  if (dates.length === 0) return []

  const pages = chunkDigits(pageBlob, 4).slice(0, dates.length)
  const bookBlob = first(text, /SALE DATE(\d{8,80}?)(?=[A-Z])/) ?? ''
  const books = chunkDigits(bookBlob, 4).slice(0, dates.length)

  const vi = codes.slice(0, dates.length).split('')
  const qu = codes.slice(dates.length, dates.length * 2).split('')

  const prices: Array<string | null> = Array.from({ length: dates.length }, () => null)
  const priceHit = text.match(
    /((?:[1-9]|[12]\d),\d{3},\d{3})(\d{1,3}(?:,\d{3})+)?000[IQUV]{2,}/,
  )
  if (priceHit?.[1]) prices[0] = priceHit[1]
  if (priceHit?.[2]) prices[1] = priceHit[2]

  const nameBlob =
    first(text, /SALE DATE\d+([A-Z][A-Z0-9 &'.]*?)VOL\/PAGE/) ?? ''
  const stub = first(text, /WESTPORT([A-Z][A-Z0-9 &'.-]{8,80}?)(?:YearCode|YearAssessed)/)
  const { owner: current, rest } = stub
    ? completeCurrentOwner(stub, nameBlob)
    : { owner: '', rest: nameBlob }
  const trusteeRows = rest
    .split(/(?<=TRUSTEE(?: EST OF)?)(?=[A-Z])/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
  const names = [current, ...trusteeRows].filter(Boolean)
  const surnames = names
    .map((n) => n.split(/\s+/)[0] ?? '')
    .filter((n) => n.length >= 5)
  const owners = names.map((n) => respaceGluedName(n, surnames))

  return dates.map((date, i) => ({
    owner: owners[i] ?? '',
    date: date.replace(/-/g, '/'),
    price: prices[i] ? `$${prices[i]}` : null,
    bookPage: books[i] && pages[i] ? `${books[i]}/${pages[i]}` : null,
    qualified: qu[i] ?? null,
    instrument: vi[i] ?? null,
  }))
}

function formatOwnershipValue(row: VisionOwnershipRow): string {
  return [row.owner, row.price, row.bookPage, [row.qualified, row.instrument].filter(Boolean).join('/') || null]
    .filter(Boolean)
    .join(' · ')
}

function constructionBlock(text: string): string | null {
  return (
    text.match(
      /Ceiling Height([\s\S]{15,240}?)(?:Living Area Q|Cns Sect|\d{1,2}\/\d{1,2}\/\d{4})/,
    )?.[1] ?? null
  )
}

/**
 * Parse a VGSI printable Field Card PDF (prototype: Westport PID 3959).
 * Layout is a fixed assessor form — labels then values, often concatenated.
 */
export function parseVisionFieldCardPdf(text: string): VisionFieldCardJson {
  const fields: VisionFieldCardField[] = []
  const seen = new Set<string>()

  push(fields, seen, 'Parcel', 'Location', first(text, /CURRENT OWNER(.+?)Property Location/))
  push(fields, seen, 'Parcel', 'Account', first(text, /Account #(\d+)/))
  push(
    fields,
    seen,
    'Parcel',
    'PID',
    first(text, /(\d{3,7})Property LocationVision ID/) ??
      first(text, /^(\d{3,6})(?=201Account #)/),
  )
  push(
    fields,
    seen,
    'Parcel',
    'MBLU',
    first(text, /([A-Z]\d{2}\/\s*\/\s*\d{3}\/\d{3}\s*\/)/),
  )
  const ownership = ownershipFromPdf(text)
  push(
    fields,
    seen,
    'Parcel',
    'Owner',
    ownership[0]?.owner ??
      first(text, /WESTPORT([A-Z][A-Z0-9 &'.-]{8,80}?)(?:YearCode|YearAssessed)/),
  )
  push(
    fields,
    seen,
    'Land',
    'Acres',
    first(text, /(?:Total Card Land Units|Parcel Total Land AreaAC)(\d+\.\d+)/),
  )
  push(
    fields,
    seen,
    'Valuation',
    'Appraisal',
    first(text, /Total Appraised Parcel Value(\d{1,3}(?:,\d{3})+)/),
  )
  const visit = text.match(
    /VISIT \/ CHANGE HISTORY(\d{1,3}(?:,\d{3})+)(\d{1,3}(?:,\d{3})+)/,
  )
  push(fields, seen, 'Valuation', 'Assessment', visit?.[2])

  push(
    fields,
    seen,
    'Building',
    'Year built',
    first(text, /(\d{4})Year Built/) ?? first(text, /Year Built(\d{4})/),
  )
  const areas = livingAndGross(text)
  push(fields, seen, 'Building', 'Living area', areas.living)
  push(fields, seen, 'Building', 'Gross area', areas.gross)

  const cons = constructionBlock(text)
  if (cons) {
    const style = cons.match(/^([A-Za-z][A-Za-z /+-]+?)(Residential|Commercial|Condo|Industrial)/)
    if (style) {
      push(fields, seen, 'Building', 'Style', style[1])
      push(fields, seen, 'Building', 'Model', style[2])
    }
    push(fields, seen, 'Building', 'Grade', cons.match(/(Type [IVX]+)/)?.[1])
    push(fields, seen, 'Building', 'Stories', cons.match(/(\d+(?: \d\/\d)? Stories)/)?.[1])
    push(
      fields,
      seen,
      'Building',
      'Exterior wall',
      cons.match(/(Wood Shingle|Cedar or Redwd|Board & Batten|Stone\/Masonry|Vinyl|Brick|Clapboard)/)?.[1],
    )
    push(fields, seen, 'Building', 'Roof', cons.match(/(Gable\/Hip|Gable|Hip|Flat)/)?.[1])
    push(
      fields,
      seen,
      'Building',
      'Roof cover',
      cons.match(/(Asphalt Shingl[e]?|Slate|Metal)/)?.[1]?.replace(/Shingl$/, 'Shingle'),
    )
    push(fields, seen, 'Building', 'Interior wall', cons.match(/(Drywall|Plaster|Wood Panel)/)?.[1])
    push(fields, seen, 'Building', 'Floor', cons.match(/(Hardwood|Carpet|Vinyl|Ceramic|Tile)/)?.[1])
    push(fields, seen, 'Building', 'Heat fuel', cons.match(/(Gas|Oil|Electric)/)?.[1])
    push(fields, seen, 'Building', 'Heat type', cons.match(/(Forced Air|Hot Water|Steam|Heat Pump)/)?.[1])
    push(fields, seen, 'Building', 'AC', cons.match(/(Central|None|Window)/)?.[1])
    push(fields, seen, 'Building', 'Beds', cons.match(/(\d+) Bedrooms/)?.[1])
    push(fields, seen, 'Building', 'Full baths', cons.match(/(\d+) Full Baths/)?.[1])
    push(fields, seen, 'Building', 'Half baths', cons.match(/(\d+) Half Bath/)?.[1])
    push(fields, seen, 'Building', 'Rooms', cons.match(/(\d+) Rooms/)?.[1])
    const styles = [...cons.matchAll(/(Average|Modern|Basic|Luxury)/g)].map((m) => m[1])
    if (styles[0]) push(fields, seen, 'Building', 'Bath style', styles[0])
    if (styles[1]) push(fields, seen, 'Building', 'Kitchen style', styles[1])
  }

  push(fields, seen, 'Building', 'Extra feature', first(text, /Description(Generator|InGround Pool|Shed|Solar Panels)/))

  const permit = first(
    text,
    /CommentsPermit Id(NEW [\s\S]{10,200}?)(?:AssessedAppraised|Account #)/,
  )
  if (permit) {
    for (const line of permit.split(/(?=demolish|NEW )/i)) {
      const t = line.replace(/Permit Id/g, ' ').trim()
      if (t.length > 8) push(fields, seen, 'Permit', 'Comment', t, true)
    }
  }

  const salePrice = salePriceFromPdf(text)
  const saleDate = first(text, /I{3,}[A-Z]*(\d{2}-\d{2}-\d{4})/)
  const book = first(text, /SALE DATE(\d{4})/)
  const page = text.match(/((?:\d{2}-\d{2}-\d{4}){2,})(\d{4})/)?.[2]
  if (saleDate) push(fields, seen, 'Sale', 'Sale date', saleDate.replace(/-/g, '/'))
  if (salePrice) push(fields, seen, 'Sale', 'Sale price', `$${salePrice}`)
  if (book && page) push(fields, seen, 'Sale', 'Book / page', `${book}/${page}`)

  if (ownership.length === 0) {
    push(fields, seen, 'Ownership', 'History', 'Not listed on Field Card')
  } else {
    for (const row of ownership) {
      push(fields, seen, 'Ownership', row.date, formatOwnershipValue(row), true)
    }
  }

  const searchText = fields
    .map((f) => `${f.label} ${f.value}`)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 8000)

  return { version: 1, fields, searchText }
}

export function fieldCardLooksNoisy(json: VisionFieldCardJson | null | undefined): boolean {
  const fields = json?.fields ?? []
  if (fields.length === 0) return true
  const junk = fields.filter((f) =>
    /^(pan |row |grd |tbl |ctl|current Val|pan)/i.test(f.label),
  ).length
  return junk >= Math.max(3, Math.floor(fields.length * 0.25))
}

/** Stored JSON is missing the construction / permit block the VGSI PDF has. */
export function fieldCardNeedsRefresh(json: VisionFieldCardJson | null | undefined): boolean {
  if (fieldCardLooksNoisy(json)) return true
  const fields = json?.fields ?? []
  const labels = new Set(fields.map((f) => f.label.toLowerCase()))
  const hasBuilding = ['style', 'year built', 'living area', 'beds'].some((l) => labels.has(l))
  const hasOwnership = fields.some((f) => f.section === 'Ownership')
  return !hasBuilding || !hasOwnership
}

export function mergeFieldCardJson(
  ...cards: Array<VisionFieldCardJson | null | undefined>
): VisionFieldCardJson {
  const fields: VisionFieldCardField[] = []
  const seen = new Set<string>()
  for (const card of cards) {
    for (const field of card?.fields ?? []) {
      const multi = MULTI_LABELS.has(field.label.toLowerCase())
      push(fields, seen, field.section, field.label, field.value, multi)
    }
  }
  const searchText = fields
    .map((f) => `${f.label} ${f.value}`)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 8000)
  return { version: 1, fields, searchText }
}

export async function fetchVisionFieldCardPdfJson(
  town: string,
  visionPid: string,
): Promise<VisionFieldCardJson | null> {
  const url = visionGisFieldCardPdfUrl(town, visionPid)
  if (!url) return null
  try {
    const res = await fetch(url, {
      headers: { accept: 'application/pdf' },
      cache: 'no-store',
    })
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length < 100) return null
    const parsed = parseVisionFieldCardPdf(extractVisionPdfText(buf))
    return parsed.fields.length > 0 ? parsed : null
  } catch {
    return null
  }
}
