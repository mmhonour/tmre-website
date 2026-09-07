import {
  addressMatchKey,
  normalizePropertyAddress,
} from '@/lib/property-address'

export type VisionMailingFormat = {
  /** Letter lines: name (if any), street, city / state / zip. */
  letterLines: string[]
  /** True when the mailing street is not the residence street. */
  offsite: boolean
  /**
   * Street-list / Find-card block when offsite:
   * `Mailing Address` then the letter lines. Empty when on-site or missing.
   */
  labeledLines: string[]
}

const STATE_ABBR =
  /^(A[LKSZRAEP]|C[AOT]|D[EC]|F[LM]|G[AU]|HI|I[ADLN]|K[SY]|LA|M[ADEHINOPST]|N[CDEHJMVY]|O[HKR]|P[ARW]|RI|S[CD]|T[NX]|UT|V[AIT]|W[AIVY])$/i

function collapse(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function splitMailingTokens(raw: string): string[] {
  const normalized = raw.replace(/\r\n/g, '\n').trim()
  if (normalized.includes('\n')) {
    return normalized.split('\n').map(collapse).filter(Boolean)
  }
  return normalized.split(',').map(collapse).filter(Boolean)
}

function isStateZipToken(token: string): boolean {
  const m = token.match(/^([A-Za-z]{2})(?:\s+(\d{5}(?:-\d{4})?))?$/)
  return Boolean(m && STATE_ABBR.test(m[1]))
}

function isStreetish(token: string): boolean {
  if (/^(p\.?\s*o\.?\s*box|post office box|pobox)\b/i.test(token)) return true
  return /^\d/.test(token)
}

function isCityStateLine(token: string): boolean {
  if (isStateZipToken(token)) return true
  if (isStreetish(token)) return false
  const parts = token.split(/\s+/)
  if (parts.length < 2) return false
  const last = parts[parts.length - 1] ?? ''
  const prev = parts[parts.length - 2] ?? ''
  if (/^\d{5}(?:-\d{4})?$/.test(last) && STATE_ABBR.test(prev)) return true
  return STATE_ABBR.test(last)
}

function namesMatch(a: string, b: string): boolean {
  const left = collapse(a).toLowerCase()
  const right = collapse(b).toLowerCase()
  if (!left || !right) return false
  return left === right || left.includes(right) || right.includes(left)
}

/**
 * Split a VGSI mailing blob into letter lines.
 * `9 PINE ST, WESTPORT, CT` → street + city/state.
 * A leading non-street token is the addressee name.
 */
export function parseVisionMailingLetterParts(mailing: string): {
  name: string | null
  street: string | null
  cityState: string | null
} {
  const tokens = splitMailingTokens(mailing)
  if (tokens.length === 0) {
    return { name: null, street: null, cityState: null }
  }

  let cityState: string | null = null
  let rest = tokens
  const last = rest[rest.length - 1]
  if (rest.length >= 2 && last && isStateZipToken(last)) {
    cityState = `${rest[rest.length - 2]}, ${last}`
    rest = rest.slice(0, -2)
  } else if (last && isCityStateLine(last)) {
    cityState = last.includes(',')
      ? last
      : last.replace(/\s+([A-Za-z]{2})(\s+\d{5}(?:-\d{4})?)?$/, ', $1$2')
    rest = rest.slice(0, -1)
  }

  let name: string | null = null
  let street: string | null = null
  if (rest.length === 0) {
    return { name, street, cityState }
  }
  if (rest.length === 1) {
    const only = rest[0]!
    if (isStreetish(only) || !cityState) street = only
    else name = only
    return { name, street, cityState }
  }

  let streetIdx = -1
  for (let i = rest.length - 1; i >= 0; i -= 1) {
    if (isStreetish(rest[i]!)) {
      streetIdx = i
      break
    }
  }
  if (streetIdx >= 0) {
    street = rest.slice(streetIdx).join(', ')
    const nameParts = rest.slice(0, streetIdx)
    if (nameParts.length > 0) name = nameParts.join(' ')
  } else {
    name = rest[0] ?? null
    street = rest.slice(1).join(', ') || null
  }
  return { name, street, cityState }
}

export function visionMailingStreetDiffers(
  residenceStreet: string | null | undefined,
  mailingStreet: string | null | undefined,
  town: string,
): boolean {
  const house = collapse(residenceStreet ?? '')
  const mail = collapse(mailingStreet ?? '')
  if (!mail) return false
  if (!house) return true
  const houseKey = addressMatchKey(normalizePropertyAddress(town, house, null))
  const mailKey = addressMatchKey(normalizePropertyAddress(town, mail, null))
  return houseKey !== mailKey
}

/**
 * Letter-style mailing block. When the mailing street is not the
 * residence, `labeledLines` starts with `Mailing Address`.
 */
export function formatVisionMailingAddress(opts: {
  mailing: string | null | undefined
  residenceStreet: string | null | undefined
  town: string
  ownerName?: string | null
}): VisionMailingFormat {
  const mailing = collapse(opts.mailing ?? '')
  if (!mailing) {
    return { letterLines: [], offsite: false, labeledLines: [] }
  }

  const parts = parseVisionMailingLetterParts(mailing)
  const owner = collapse(opts.ownerName ?? '')
  const name =
    parts.name ||
    (owner && !namesMatch(owner, parts.street ?? '') ? owner : null)

  const letterLines = [name, parts.street, parts.cityState].filter(
    (line): line is string => Boolean(line),
  )
  const offsite = visionMailingStreetDiffers(
    opts.residenceStreet,
    parts.street ?? mailing,
    opts.town,
  )
  return {
    letterLines,
    offsite,
    labeledLines: offsite ? ['Mailing Address', ...letterLines] : [],
  }
}
