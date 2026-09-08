import { normalizeStreetLine, streetSearchVariants } from '@/lib/property-address'
import { streetLineWithoutType } from '@/lib/street-type-abbreviations'

const STREET_TYPES = new Set([
  'st',
  'rd',
  'ave',
  'dr',
  'ln',
  'ct',
  'blvd',
  'pl',
  'cir',
  'way',
  'ter',
  'trl',
  'hwy',
  'pkwy',
  'sq',
  'tpke',
  'ext',
])

const UNIT_TOKENS = new Set([
  'unit',
  'apt',
  'ste',
  'suite',
  'fl',
  'floor',
  '#',
])

function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  const row = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i += 1) {
    let prev = i - 1
    row[0] = i
    for (let j = 1; j <= b.length; j += 1) {
      const cur = row[j]
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + cost)
      prev = cur
    }
  }
  return row[b.length] ?? b.length
}

/**
 * House number + street name with spaces/hyphens removed and the type
 * stripped. `16 Sea Spray Rd` and `16 Seaspray Road` both → `16` / `seaspray`.
 * That is the only handle Find has before a listing is pulled (no parcel #).
 */
export function collapsedListingStreet(
  street: string,
): { house: string; name: string } | null {
  const tokens = normalizeStreetLine(street).split(' ').filter(Boolean)
  const house = tokens[0]
  if (!house || !/^\d+[a-z]?$/.test(house)) return null
  const nameTokens = tokens.slice(1).filter((token) => !UNIT_TOKENS.has(token))
  while (nameTokens.length > 0) {
    const last = nameTokens[nameTokens.length - 1]
    if (!last) break
    if (STREET_TYPES.has(last) || /^\d+[a-z]?$/.test(last)) {
      nameTokens.pop()
      continue
    }
    break
  }
  const name = nameTokens.join('').replace(/[^a-z0-9]/g, '')
  if (!name) return null
  return { house, name }
}

/** Same house, same street after collapsing Sea Spray ↔ Seaspray ↔ Sea-Spray. */
export function findListingStreetsMatch(a: string, b: string): boolean {
  const left = collapsedListingStreet(a)
  const right = collapsedListingStreet(b)
  if (!left || !right || left.house !== right.house) return false
  if (left.name === right.name) return true
  const shortest = Math.min(left.name.length, right.name.length)
  if (shortest < 6) return false
  return levenshtein(left.name, right.name) <= 1
}

/**
 * RETS UnparsedAddress hops. Omit Rd/Road first — `*road*` misses `Rd`
 * and `*ln*` misses `Lane`. Then the short type, then the long type.
 * Name-pattern glue (Seaspray) is a last hop, not the main guess.
 */
export function findListingStreetQueries(street: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  const add = (value: string) => {
    const key = value.replace(/\s+/g, ' ').trim().toLowerCase()
    if (!key || seen.has(key)) return
    seen.add(key)
    out.push(value.replace(/\s+/g, ' ').trim())
  }
  add(streetLineWithoutType(street))
  const variants = [...streetSearchVariants(street)].sort(
    (a, b) => a.length - b.length,
  )
  for (const variant of variants) add(variant)
  return out
}
