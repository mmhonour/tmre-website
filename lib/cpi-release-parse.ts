/**
 * Parse an official BLS CPI news release into summary paragraphs + highlights.
 * No AI — text is grepped from the BLS HTML.
 */

import { htmlToPlainText } from '@/lib/fed-fomc-statement-parse'

export type CpiHighlightDirection = 'up' | 'down' | 'flat'

export type CpiHighlight = {
  label: string
  direction: CpiHighlightDirection
  /** Seasonally adjusted MoM % when known from Table A. */
  momPct?: number | null
  /** Unadjusted YoY % when known from Table A. */
  yoyPct?: number | null
  kind: 'category' | 'driver'
}

export type ParsedCpiRelease = {
  momPct: number | null
  yoyPct: number | null
  coreMomPct: number | null
  coreYoyPct: number | null
  /** 1–4 lead paragraphs from the release body. */
  summary: string | null
  /** First body paragraph. */
  excerpt: string | null
  highlights: CpiHighlight[]
}

/** Archive URL from BLS release day (YYYY-MM-DD). */
export function guessCpiReleaseUrl(releaseDate: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(releaseDate.trim())
  if (!m) return 'https://www.bls.gov/news.release/cpi.nr0.htm'
  return `https://www.bls.gov/news.release/archives/cpi_${m[2]}${m[3]}${m[1]}.htm`
}

export const CPI_CURRENT_RELEASE_URL =
  'https://www.bls.gov/news.release/cpi.nr0.htm'

function parsePctToken(raw: string): number | null {
  const t = raw.trim().replace(/,/g, '')
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

function extractHeadlinePercents(text: string): {
  momPct: number | null
  yoyPct: number | null
} {
  // "increased 0.2 percent on a seasonally adjusted basis"
  const mom =
    /(?:increased|decreased|rose|fell|unchanged)\s+([\d.]+)\s+percent\s+on\s+a\s+seasonally\s+adjusted\s+basis/i.exec(
      text,
    ) ||
    /seasonally\s+adjusted\s+basis\s+in\s+\w+[^.]{0,40}?(?:increased|decreased|rose|fell)\s+([\d.]+)\s+percent/i.exec(
      text,
    )
  let momPct = mom ? parsePctToken(mom[1]!) : null
  if (
    momPct != null &&
    /(?:decreased|fell)\s+[\d.]+\s+percent\s+on\s+a\s+seasonally\s+adjusted/i.test(
      text.slice(0, 500),
    )
  ) {
    momPct = -Math.abs(momPct)
  }
  if (/unchanged over the month|unchanged on a seasonally adjusted/i.test(text.slice(0, 400))) {
    momPct = 0
  }

  const yoy =
    /(?:over the last 12 months|for the 12 months ending[^,]{0,40}),?\s*(?:the all items index )?(?:increased|decreased|rose|fell)\s+([\d.]+)\s+percent/i.exec(
      text,
    ) ||
    /all items index (?:increased|decreased|rose|fell)\s+([\d.]+)\s+percent before seasonal adjustment/i.exec(
      text,
    )
  let yoyPct = yoy ? parsePctToken(yoy[1]!) : null
  if (
    yoyPct != null &&
    /(?:decreased|fell)\s+[\d.]+\s+percent before seasonal/i.test(text.slice(0, 800))
  ) {
    yoyPct = -Math.abs(yoyPct)
  }

  return { momPct, yoyPct }
}

function extractCorePercents(text: string): {
  coreMomPct: number | null
  coreYoyPct: number | null
} {
  const mom =
    /all items less food and energy (?:rose|fell|increased|decreased)\s+([\d.]+)\s+percent in/i.exec(
      text,
    )
  let coreMomPct = mom ? parsePctToken(mom[1]!) : null
  if (
    coreMomPct != null &&
    /all items less food and energy (?:fell|decreased)/i.test(text)
  ) {
    coreMomPct = -Math.abs(coreMomPct)
  }

  const yoy =
    /all items less food and energy index (?:rose|fell|increased|decreased)\s+([\d.]+)\s+percent over the last 12 months/i.exec(
      text,
    )
  let coreYoyPct = yoy ? parsePctToken(yoy[1]!) : null
  if (
    coreYoyPct != null &&
    /all items less food and energy index (?:fell|decreased)/i.test(text)
  ) {
    coreYoyPct = -Math.abs(coreYoyPct)
  }

  return { coreMomPct, coreYoyPct }
}

function splitListItems(raw: string): string[] {
  return raw
    .replace(/\s+/g, ' ')
    .replace(/\.$/, '')
    .split(',')
    .map((s) => s.trim().replace(/^and\s+/i, ''))
    .filter((s) => s.length > 1 && s.length < 80)
}

function extractProseHighlights(text: string): CpiHighlight[] {
  const out: CpiHighlight[] = []
  const increased =
    /Indexes that increased over the month include ([^.]+)\./i.exec(text)
  if (increased) {
    for (const label of splitListItems(increased[1]!)) {
      out.push({ label, direction: 'up', kind: 'category' })
    }
  }
  const decreased =
    /(?:The\s+)?[Ii]ndexes for ([^.]{1,200}?) (?:were|was) among\s+(?:the\s+)?(?:few\s+)?major indexes that decreased/i.exec(
      text,
    ) ||
    /indexes that decreased over the month include ([^.]+)\./i.exec(text)
  if (decreased) {
    for (const label of splitListItems(decreased[1]!)) {
      out.push({ label, direction: 'down', kind: 'category' })
    }
  }

  // Primary driver line — shelter / energy / etc.
  const driver =
    /The index for ([^.]+?) (?:rose|fell|increased|decreased) ([\d.]+)\s+percent in \w+ and was the primary factor/i.exec(
      text,
    )
  if (driver) {
    const dir = /fell|decreased/i.test(driver[0]) ? 'down' : 'up'
    const pct = parsePctToken(driver[2]!)
    out.unshift({
      label: driver[1]!.trim(),
      direction: dir,
      momPct: pct != null ? (dir === 'down' ? -Math.abs(pct) : pct) : null,
      kind: 'driver',
    })
  }

  return out
}

/** Lead body paragraphs from the CPI-U news release, before table/notes. */
function extractSummaryParagraphs(text: string): string[] {
  // Prefer the official lead sentence — BLS pages also say "CONSUMER PRICE
  // INDEX" in the left nav, which would otherwise poison the excerpt.
  const start = text.search(
    /The Consumer Price Index for All Urban Consumers \(CPI-U\)/i,
  )
  if (start < 0) return []
  let body = text.slice(start)
  const cut = body.search(
    /\n-{3,}|\nTable A\.|\nTable 1\.|\nChanges to |\nTechnical Note|\nFacilities for|\nInformation from this release/i,
  )
  if (cut > 0) body = body.slice(0, cut)

  const paras = body
    .split(/\n\n+/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(
      (p) =>
        p.length > 60 &&
        /Consumer Price Index|index for|all items|Indexes that/i.test(p) &&
        !/Inflation & Prices|Producer Price|Import\/Export|Contract Escalation/i.test(
          p,
        ),
    )
    .slice(0, 4)

  if (paras.length > 0) return paras

  // Fallback: single long lead block — keep the first ~4 sentences.
  const compact = body.replace(/\s+/g, ' ').trim()
  const sentences = compact.match(/[^.!?]+[.!?]+/g) ?? []
  const lead = sentences
    .map((s) => s.trim())
    .filter((s) => s.length > 40)
    .slice(0, 4)
  return lead.length ? [lead.join(' ')] : compact ? [compact.slice(0, 1200)] : []
}

export function parseCpiReleaseHtml(html: string): ParsedCpiRelease {
  const text = htmlToPlainText(html)
  const paras = extractSummaryParagraphs(text)
  const summary = paras.length ? paras.join('\n\n') : null
  const excerpt = paras[0] ?? null
  const head = extractHeadlinePercents(text)
  const core = extractCorePercents(text)
  const highlights = extractProseHighlights(text)

  return {
    momPct: head.momPct,
    yoyPct: head.yoyPct,
    coreMomPct: core.coreMomPct,
    coreYoyPct: core.coreYoyPct,
    summary,
    excerpt,
    highlights,
  }
}
