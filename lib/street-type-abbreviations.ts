/**
 * Street-type short ↔ long pairs for Find RETS / listing match.
 *
 * Humans treat Rd and Road as the same street. RETS wildcards do not:
 * `*road*` misses `Rd`; `*ln*` misses `Lane`. Review this list against
 * `npm run listing:street-suffixes` (distinct last tokens on listings).
 */
export type StreetTypeAbbreviation = {
  short: string
  long: string
  /** How UnparsedAddress=*token* behaves. */
  rets: 'short-hits-long' | 'need-both'
}

export const STREET_TYPE_ABBREVIATIONS: readonly StreetTypeAbbreviation[] = [
  { short: 'rd', long: 'road', rets: 'short-hits-long' },
  { short: 'st', long: 'street', rets: 'short-hits-long' },
  { short: 'ave', long: 'avenue', rets: 'short-hits-long' },
  { short: 'dr', long: 'drive', rets: 'short-hits-long' },
  { short: 'ln', long: 'lane', rets: 'need-both' },
  { short: 'ct', long: 'court', rets: 'need-both' },
  { short: 'blvd', long: 'boulevard', rets: 'need-both' },
  { short: 'pl', long: 'place', rets: 'need-both' },
  { short: 'cir', long: 'circle', rets: 'need-both' },
  { short: 'ter', long: 'terrace', rets: 'need-both' },
  { short: 'trl', long: 'trail', rets: 'need-both' },
  { short: 'hwy', long: 'highway', rets: 'need-both' },
  { short: 'pkwy', long: 'parkway', rets: 'need-both' },
  { short: 'sq', long: 'square', rets: 'need-both' },
  { short: 'tpke', long: 'turnpike', rets: 'need-both' },
  { short: 'ext', long: 'extension', rets: 'need-both' },
  { short: 'la', long: 'lane', rets: 'need-both' },
]

const TYPE_TOKENS = new Set(
  STREET_TYPE_ABBREVIATIONS.flatMap((row) => [row.short, row.long]),
)

export function isStreetTypeToken(token: string | null | undefined): boolean {
  const key = (token ?? '').toLowerCase().replace(/[.,]/g, '')
  return TYPE_TOKENS.has(key)
}

/** Drop a trailing Rd/Road/Ln/Lane so RETS can hit either abbreviation. */
export function streetLineWithoutType(street: string): string {
  const tokens = street.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)
  if (tokens.length < 3) return tokens.join(' ')
  const last = tokens[tokens.length - 1]
  if (isStreetTypeToken(last)) tokens.pop()
  return tokens.join(' ')
}
