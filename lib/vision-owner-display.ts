/**
 * VGSI owner lines are LAST FIRST. Find / Streets show First Last for
 * people. Entities (LLC, trust, …) stay in assessor order.
 */

export const VISION_OWNER_ENTITY_RE =
  /\b(llc|l\.l\.c\.?|inc\.?|corp\.?|ltd\.?|l\.?p\.?|llp|pllc|p\.?c\.?|trust|trustee|bank|assoc(?:iation)?|hoa|condo|church|estate|foundation|partners(?:hip)?|nominee|irrevocable|revocable|holdings)\b/i

function titleCaseToken(token: string): string {
  const upper = token.toUpperCase().replace(/\./g, '')
  if (/^(LLC|LLP|PLLC|LP|PC|PA|INC|CORP|LTD|NA)$/.test(upper)) {
    return token.toUpperCase()
  }
  if (/^(II|III|IV|VI|VII|IX)$/.test(upper)) return upper
  if (/^(JR|SR|ESQ)$/.test(upper)) {
    return `${upper[0]}${upper.slice(1).toLowerCase()}`
  }
  if (token.length === 1) return upper
  return token
    .split('-')
    .map((part) =>
      part
        ? `${part[0]!.toUpperCase()}${part.slice(1).toLowerCase()}`
        : part,
    )
    .join('-')
}

function formatVisionOwnerPerson(raw: string): string {
  const tokens = raw.trim().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return ''
  if (tokens.length === 1 || VISION_OWNER_ENTITY_RE.test(raw)) {
    return tokens.map(titleCaseToken).join(' ')
  }
  const last = tokens[0]!
  const given = tokens.slice(1)
  return [...given, last].map(titleCaseToken).join(' ')
}

export function formatVisionOwnerDisplay(
  name: string | null | undefined,
): string | null {
  const raw = name?.replace(/\s+/g, ' ').trim()
  if (!raw) return null
  const people = raw
    .split(/\s+(?:AND|&)\s+/i)
    .map((part) => part.trim())
    .filter(Boolean)
  const formatted = people.map(formatVisionOwnerPerson).filter(Boolean)
  return formatted.length > 0 ? formatted.join(' and ') : null
}

export function formatVisionOwnerDisplayLines(
  lines: readonly string[],
): string[] {
  return lines
    .map((line) => formatVisionOwnerDisplay(line))
    .filter((line): line is string => Boolean(line))
}
