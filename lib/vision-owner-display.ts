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

export type VisionOwnerPerson = {
  last: string
  given: string[]
  entity: boolean
}

/**
 * VGSI joint lines are `LAST FIRST [& FIRST2]`. A bare second token is the
 * spouse's given name, not a new last name. Inherit the first person's last
 * so we never key or label on a first name alone.
 */
export function parseVisionOwnerPeople(
  line: string | null | undefined,
): VisionOwnerPerson[] {
  const raw = line?.replace(/\s+/g, ' ').trim()
  if (!raw) return []
  const parts = raw
    .split(/\s+(?:AND|&)\s+/i)
    .map((part) => part.trim())
    .filter(Boolean)
  const people: VisionOwnerPerson[] = []
  let inheritLast = ''
  for (const part of parts) {
    const tokens = part.split(/\s+/).filter(Boolean)
    if (tokens.length === 0) continue
    if (VISION_OWNER_ENTITY_RE.test(part)) {
      people.push({ last: '', given: tokens, entity: true })
      continue
    }
    if (tokens.length === 1) {
      people.push({
        last: inheritLast,
        given: [tokens[0]!],
        entity: false,
      })
      continue
    }
    const last = tokens[0]!
    const given = tokens.slice(1)
    inheritLast = last
    people.push({ last, given, entity: false })
  }
  return people
}

/** Assessor-order person lines (`THARP CHARLES`, `THARP ADRIANNE`). */
export function visionOwnerPersonAssessorLine(person: VisionOwnerPerson): string {
  if (person.entity) return person.given.join(' ')
  return [person.last, ...person.given].filter(Boolean).join(' ')
}

function formatVisionOwnerPerson(person: VisionOwnerPerson): string {
  if (person.entity || !person.last) {
    return person.given.map(titleCaseToken).join(' ')
  }
  return [...person.given, person.last].map(titleCaseToken).join(' ')
}

export function formatVisionOwnerDisplay(
  name: string | null | undefined,
): string | null {
  const people = parseVisionOwnerPeople(name)
  if (people.length === 0) return null
  const humans = people.filter((person) => !person.entity && person.last)
  const sharedLast =
    humans.length >= 2 &&
    people.every((person) => !person.entity) &&
    humans.every(
      (person) => person.last.toLowerCase() === humans[0]!.last.toLowerCase(),
    )
  if (sharedLast) {
    const givens = humans
      .map((person) => person.given.map(titleCaseToken).join(' '))
      .filter(Boolean)
    if (givens.length >= 2) {
      return `${givens.join(' & ')} ${titleCaseToken(humans[0]!.last)}`
    }
  }
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
