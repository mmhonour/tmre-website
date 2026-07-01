/** Vision Appraisal / VGSI town codes for Fairfield County, CT */
export const VISION_TOWNS: Record<string, string> = {
  norwalk: 'NORWALK',
  westport: 'WESTPORT',
  wilton: 'WILTON',
  fairfield: 'FAIRFIELD',
  weston: 'WESTON',
  'new canaan': 'NEWCANAAN',
  ridgefield: 'RIDGEFIELD',
}

export type VisionSale = {
  address: string
  saleDate: string
  salePrice: string
  owner: string
}

const ownerCache = new Map<string, { owner: string | null; expiresAt: number }>()
const OWNER_CACHE_TTL = 24 * 60 * 60 * 1000

const salesCache = new Map<string, { sales: VisionSale[]; fetchedAt: number }>()
const SALES_CACHE_TTL = 6 * 60 * 60 * 1000

export function visionTownCode(townName: string): string | null {
  const key = townName.trim().toLowerCase()
  return VISION_TOWNS[key] ?? null
}

/** Split "311 Hillspoint Rd" into { streetNo: "311", streetName: "Hillspoint Rd" } */
export function parseStreet(street: string): { streetNo: string; streetName: string } | null {
  const m = street.trim().match(/^(\d+[A-Za-z]?)\s+(.+)$/)
  if (!m) return null
  return { streetNo: m[1], streetName: m[2] }
}

export function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

export function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b(\w)/g, (c) => c.toUpperCase())
}

export function parseSalesTable(html: string): VisionSale[] {
  const sales: VisionSale[] = []
  const rowPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
  let rowMatch: RegExpExecArray | null

  while ((rowMatch = rowPattern.exec(html)) !== null) {
    const row = rowMatch[1]
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) =>
      stripHtml(m[1]),
    )

    if (cells.length < 4) continue

    const dateIdx = cells.findIndex((c) => /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/.test(c))
    if (dateIdx < 1) continue

    const address = titleCase(cells[dateIdx - 1] || cells[0])
    const saleDate = cells[dateIdx]
    const salePrice = cells[dateIdx + 1] ?? '—'
    const rawOwner = cells[dateIdx + 2] ?? cells[dateIdx + 1] ?? ''
    const owner = titleCase(rawOwner.replace(/&amp;/g, '&'))

    if (!address || !owner || owner.length < 2) continue
    if (/address|location|owner|buyer|price|date/i.test(address)) continue

    sales.push({ address, saleDate, salePrice, owner })
  }

  return sales
}

function parseOwnerFromHtml(html: string, streetNo: string, streetName: string): string | null {
  const targetAddr = `${streetNo} ${streetName}`.toUpperCase().replace(/\s+/g, ' ')
  const rows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) ?? []

  for (const row of rows) {
    const cells = (row.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) ?? []).map((c) =>
      stripHtml(c).toUpperCase(),
    )
    const addrIdx = cells.findIndex(
      (c) =>
        c.includes(streetNo) &&
        c.replace(/\s+/g, ' ').includes(streetName.toUpperCase().split(' ')[0]),
    )
    if (addrIdx === -1) continue

    const ownerCell = cells[2] ?? cells[addrIdx + 1]
    if (ownerCell && ownerCell.length > 1 && ownerCell !== targetAddr) {
      return titleCase(ownerCell)
    }
  }
  return null
}

export async function fetchOwnerFromVision(
  townCode: string,
  streetNo: string,
  streetName: string,
): Promise<string | null> {
  const cacheKey = `${townCode}:${streetNo}:${streetName.toUpperCase()}`
  const hit = ownerCache.get(cacheKey)
  if (hit && hit.expiresAt > Date.now()) return hit.owner

  const baseUrl = `https://www.visionappraisal.com/databases/CT/${townCode}`
  const searchUrl = `${baseUrl}/querysql.asp?type=street&streetno=${encodeURIComponent(streetNo)}&streetname=${encodeURIComponent(streetName)}&SearchType=1`

  const res = await fetch(searchUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; tmre-bot/1.0)',
      Accept: 'text/html',
    },
    signal: AbortSignal.timeout(8000),
  })

  if (!res.ok) {
    ownerCache.set(cacheKey, { owner: null, expiresAt: Date.now() + OWNER_CACHE_TTL })
    return null
  }

  const html = await res.text()
  const owner = parseOwnerFromHtml(html, streetNo, streetName)
  ownerCache.set(cacheKey, { owner, expiresAt: Date.now() + OWNER_CACHE_TTL })
  return owner
}

export async function fetchTownRecentSales(townName: string): Promise<VisionSale[]> {
  const townCode = visionTownCode(townName)
  if (!townCode) return []

  const cached = salesCache.get(townCode)
  if (cached && Date.now() - cached.fetchedAt < SALES_CACHE_TTL) {
    return cached.sales
  }

  const url = `https://www.visionappraisal.com/databases/CT/${townCode}/recentSales.asp`
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; tmre-bot/1.0)',
      Accept: 'text/html',
    },
    signal: AbortSignal.timeout(10_000),
  })

  if (!res.ok) {
    if (cached) return cached.sales
    throw new Error(`Vision Appraisal returned ${res.status}`)
  }

  const html = await res.text()
  const sales = parseSalesTable(html)
  salesCache.set(townCode, { sales, fetchedAt: Date.now() })
  return sales
}

/** Match a listing street to a Vision recent-sales row address. */
export function saleMatchesStreet(listingStreet: string, saleAddress: string): boolean {
  const parsed = parseStreet(listingStreet)
  if (!parsed) return false

  const saleUpper = saleAddress.toUpperCase().replace(/\s+/g, ' ')
  const firstWord = parsed.streetName.toUpperCase().split(/[\s,.]/)[0]
  if (!firstWord) return false

  return saleUpper.includes(parsed.streetNo.toUpperCase()) && saleUpper.includes(firstWord)
}
