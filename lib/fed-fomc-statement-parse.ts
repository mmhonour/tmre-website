/**
 * Parse an official FOMC statement page into range / vote / summary text.
 * No AI — text is grepped from the Fed's own release.
 */

import type { FomcDecision } from '@/lib/fed-fomc-calendar'

export type ParsedFomcStatement = {
  targetRangeLow: number | null
  targetRangeHigh: number | null
  decisionHint: FomcDecision | null
  /** 1–3 body paragraphs before the voting block. */
  summary: string | null
  /** Lead body paragraph. */
  excerpt: string | null
  voteNote: string | null
}

/** Strip tags / scripts and collapse whitespace. */
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#8209;/g, '-')
    .replace(/&#8211;/g, '-')
    .replace(/&#8212;/g, '-')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\u2011|\u2013|\u2014|\u2212/g, '-')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

/** Convert Fed fraction forms like 3-1/2 or 3-3/4 to a decimal. */
export function parseFedPercentToken(raw: string): number | null {
  const t = raw.trim().replace(/,/g, '')
  const frac = /^(\d+)\s*-\s*(\d+)\s*\/\s*(\d+)$/.exec(t)
  if (frac) {
    const whole = Number(frac[1])
    const num = Number(frac[2])
    const den = Number(frac[3])
    if (!Number.isFinite(whole) || !den) return null
    return whole + num / den
  }
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

function extractTargetRange(text: string): {
  low: number | null
  high: number | null
  decisionHint: FomcDecision | null
} {
  // "maintain the target range ... at 3-1/2 to 3-3/4 percent"
  // "raise the target range ... to 4 to 4-1/4 percent"
  // "lower the target range ... to 3-3/4 to 4 percent"
  const rangeRe =
    /(maintain|raise|lower|increased?|reduced?|cut)\s+(?:the\s+)?target\s+range\s+for\s+the\s+federal\s+funds\s+rate[^.]{0,120}?(\d+(?:\s*-\s*\d+\s*\/\s*\d+)?|\d+\.\d+)\s+to\s+(\d+(?:\s*-\s*\d+\s*\/\s*\d+)?|\d+\.\d+)\s+percent/i
  const m = rangeRe.exec(text)
  if (!m) {
    const loose =
      /target\s+range\s+for\s+the\s+federal\s+funds\s+rate\s+at\s+(\d+(?:\s*-\s*\d+\s*\/\s*\d+)?|\d+\.\d+)\s+to\s+(\d+(?:\s*-\s*\d+\s*\/\s*\d+)?|\d+\.\d+)\s+percent/i.exec(
        text,
      )
    if (!loose) return { low: null, high: null, decisionHint: null }
    return {
      low: parseFedPercentToken(loose[1]!),
      high: parseFedPercentToken(loose[2]!),
      decisionHint: /maintain/i.test(text) ? 'hold' : null,
    }
  }
  const verb = m[1]!.toLowerCase()
  let decisionHint: FomcDecision | null = null
  if (/maintain/.test(verb)) decisionHint = 'hold'
  else if (/raise|increas/.test(verb)) decisionHint = 'hike'
  else if (/lower|reduc|cut/.test(verb)) decisionHint = 'cut'
  return {
    low: parseFedPercentToken(m[2]!),
    high: parseFedPercentToken(m[3]!),
    decisionHint,
  }
}

function extractVoteNote(text: string): string | null {
  const voting = /Voting for the monetary policy action[\s\S]{20,800}/i.exec(text)
  if (!voting) {
    const against = /Voting against[\s\S]{20,600}/i.exec(text)
    return against ? against[0].trim().slice(0, 600) : null
  }
  // Stop before media inquiries / implementation note.
  let block = voting[0]
  const stop = block.search(
    /\n\s*(For media inquiries|Implementation Note|Last Update)/i,
  )
  if (stop > 0) block = block.slice(0, stop)
  return block.replace(/\s+/g, ' ').trim().slice(0, 800)
}

function extractBodyParagraphs(text: string): string[] {
  // Drop chrome before the release time line when present.
  let body = text
  const release = /For release at[^\n]*\n+/i.exec(body)
  if (release) body = body.slice(release.index + release[0].length)

  const paragraphs = body
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter((p) => p.length > 40)
    .filter(
      (p) =>
        !/^Federal Reserve Board/i.test(p) &&
        !/^An official website/i.test(p) &&
        !/^Skip to main content/i.test(p) &&
        !/^Sections$/i.test(p) &&
        !/^Submit$/i.test(p) &&
        !/^Last Update:/i.test(p) &&
        !/^For media inquiries/i.test(p) &&
        !/^Implementation Note/i.test(p) &&
        !/^Federal Reserve issues FOMC statement$/i.test(p),
    )

  // Keep policy paragraphs; stop at voting.
  const out: string[] = []
  for (const p of paragraphs) {
    if (/^Voting for the monetary policy action/i.test(p)) break
    if (/^Voting against/i.test(p)) break
    // Skip the "approved the following statement by a N–N vote" intro when present.
    if (/approved the following statement/i.test(p) && p.length < 160) continue
    out.push(p)
    if (out.length >= 3) break
  }
  return out
}

export function parseFomcStatementText(text: string): ParsedFomcStatement {
  const normalized = text.replace(/\u00a0/g, ' ')
  const range = extractTargetRange(normalized)
  const paragraphs = extractBodyParagraphs(normalized)
  const excerpt = paragraphs[0] ?? null
  const summary =
    paragraphs.length > 0 ? paragraphs.slice(0, 3).join('\n\n') : null
  return {
    targetRangeLow: range.low,
    targetRangeHigh: range.high,
    decisionHint: range.decisionHint,
    summary,
    excerpt,
    voteNote: extractVoteNote(normalized),
  }
}

export function parseFomcStatementHtml(html: string): ParsedFomcStatement {
  return parseFomcStatementText(htmlToPlainText(html))
}

/** Guess the HTML statement URL from the decision day (YYYY-MM-DD). */
export function guessFomcStatementUrl(endDateYmd: string): string {
  const ymd = endDateYmd.replace(/-/g, '')
  return `https://www.federalreserve.gov/newsevents/pressreleases/monetary${ymd}a.htm`
}

export function decisionFromRangeChange(
  prevLow: number | null,
  prevHigh: number | null,
  nextLow: number | null,
  nextHigh: number | null,
  hint: FomcDecision | null,
): { decision: FomcDecision | null; basisPoints: number | null } {
  if (nextLow == null || nextHigh == null) {
    return { decision: hint, basisPoints: hint === 'hold' ? 0 : null }
  }
  if (prevLow == null || prevHigh == null) {
    return {
      decision: hint ?? 'hold',
      basisPoints: hint === 'hold' ? 0 : hint === 'cut' ? -25 : hint === 'hike' ? 25 : null,
    }
  }
  const delta = Math.round((nextLow - prevLow) * 100) // bps using low edge
  if (delta === 0) return { decision: 'hold', basisPoints: 0 }
  if (delta < 0) return { decision: 'cut', basisPoints: delta }
  return { decision: 'hike', basisPoints: delta }
}
