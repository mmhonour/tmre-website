import {
  addressMatchKey,
  normalizePropertyAddress,
} from '@/lib/property-address'
import { parseVisionMailingLetterParts } from '@/lib/vision-mailing-address'
import {
  parseVisionOwnerPeople,
  visionOwnerPersonAssessorLine,
  VISION_OWNER_ENTITY_RE,
} from '@/lib/vision-owner-display'
import {
  formatVisionMoney,
  normalizeVisionOwnerLine,
  visionCurrentWarrantyOwnerLine,
  type VisionOwnershipRow,
} from '@/lib/vision-gis-parse'

export const VISION_OWNER_KEY_KINDS = ['mailing', 'name'] as const
export type VisionOwnerKeyKind = (typeof VISION_OWNER_KEY_KINDS)[number]

export const VISION_OWNER_KEY_ROLES = [
  'owner_of_record',
  'warranty_buyer',
  'quitclaim_grantee',
] as const
export type VisionOwnerKeyRole = (typeof VISION_OWNER_KEY_ROLES)[number]

export type VisionOwnerKey = {
  keyKind: VisionOwnerKeyKind
  keyNorm: string
  displayLabel: string
  role: VisionOwnerKeyRole
}

export function visionOwnerClusterId(
  keyKind: VisionOwnerKeyKind,
  keyNorm: string,
): string {
  return `${keyKind}:${keyNorm}`
}

export function splitVisionOwnerPeople(line: string): string[] {
  return parseVisionOwnerPeople(normalizeVisionOwnerLine(line))
    .map(visionOwnerPersonAssessorLine)
    .filter(Boolean)
}

/**
 * Tokens that are given names, not surnames. A key made only of these
 * (Pamela, Ann Lou, A Elizabeth) is not a landlord — VGSI couples often
 * leave the spouse as a bare given name.
 */
const GIVEN_NAME_TOKENS = new Set([
  'adrianne',
  'ann',
  'anne',
  'elizabeth',
  'jane',
  'john',
  'karin',
  'linda',
  'lou',
  'mary',
  'melissa',
  'pamela',
  'patricia',
  'peter',
  'susan',
  'william',
])

export function isIncompletePersonNameKey(keyNorm: string): boolean {
  if (!keyNorm.trim()) return true
  const parts = keyNorm
    .toLowerCase()
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean)
  if (parts.length === 0) return true
  if (VISION_OWNER_ENTITY_RE.test(parts.join(' '))) return false
  if (parts.length < 2) return true
  /** `A Elizabeth` — initial + given, no surname. Not `Al W III King`. */
  if (parts.length === 2 && parts.some((part) => part.length === 1)) return true
  return parts.every(
    (part) => part.length === 1 || GIVEN_NAME_TOKENS.has(part),
  )
}

export function visionOwnerNameKeyNorm(person: string): string {
  const tokens = person
    .toLowerCase()
    .replace(/[.,']/g, '')
    .split(/\s+/)
    .filter(Boolean)
  if (tokens.length === 0) return ''
  if (VISION_OWNER_ENTITY_RE.test(person)) {
    return tokens.join('|')
  }
  /** A given name alone is not a landlord key (`Adrianne` ≠ Adrianne Tharp). */
  if (tokens.length < 2) return ''
  const keyNorm = [...tokens].sort().join('|')
  if (isIncompletePersonNameKey(keyNorm)) return ''
  return keyNorm
}

export function visionOwnerMailingKeyNorm(
  mailing: string | null | undefined,
  town: string,
): { keyNorm: string; displayLabel: string } | null {
  const parts = parseVisionMailingLetterParts(mailing ?? '')
  const street = parts.street?.trim()
  if (!street) return null
  const zip = parts.cityState?.match(/\b(\d{5})(?:-\d{4})?\b/)?.[1] ?? null
  const keyNorm = addressMatchKey(
    normalizePropertyAddress(town, street, zip),
  )
  if (!keyNorm) return null
  return { keyNorm, displayLabel: street }
}

function pushNameKeys(
  out: VisionOwnerKey[],
  seen: Set<string>,
  line: string | null | undefined,
  role: VisionOwnerKeyRole,
): void {
  if (!line?.trim()) return
  for (const person of splitVisionOwnerPeople(line)) {
    const keyNorm = visionOwnerNameKeyNorm(person)
    if (!keyNorm) continue
    const stamp = `name:${keyNorm}`
    if (seen.has(stamp)) continue
    seen.add(stamp)
    out.push({
      keyKind: 'name',
      keyNorm,
      displayLabel: person,
      role,
    })
  }
}

export function extractVisionOwnerKeys(input: {
  town: string
  ownerName?: string | null
  ownerMailingAddress?: string | null
  ownership?: readonly VisionOwnershipRow[] | null
}): VisionOwnerKey[] {
  const out: VisionOwnerKey[] = []
  const seen = new Set<string>()

  const mailing = visionOwnerMailingKeyNorm(
    input.ownerMailingAddress,
    input.town,
  )
  if (mailing) {
    seen.add(`mailing:${mailing.keyNorm}`)
    out.push({
      keyKind: 'mailing',
      keyNorm: mailing.keyNorm,
      displayLabel: mailing.displayLabel,
      role: 'owner_of_record',
    })
  }

  const warrantyLine = visionCurrentWarrantyOwnerLine(
    input.ownership,
    input.ownerName,
  )
  if (warrantyLine) {
    pushNameKeys(out, seen, warrantyLine, 'warranty_buyer')
  } else if (!input.ownership?.length) {
    pushNameKeys(out, seen, input.ownerName, 'owner_of_record')
  }

  return out
}

/** True when `keyNorm` is on this parcel’s current (non-superseded) warranty. */
export function hasCurrentWarrantyNameKey(
  input: Parameters<typeof extractVisionOwnerKeys>[0],
  keyNorm: string,
): boolean {
  return extractVisionOwnerKeys(input).some(
    (key) => key.keyKind === 'name' && key.keyNorm === keyNorm,
  )
}

/**
 * Drop name-cluster members whose current warranty no longer includes
 * that person. Unknown parcels (`keysForParcel` → null) stay until a
 * Field Card can prove they sold.
 */
export function keepParcelsOnCurrentWarrantyName<
  T extends { town: string; visionPid: string },
>(
  clusterId: string,
  parcels: readonly T[],
  keysForParcel: (parcel: T) => readonly VisionOwnerKey[] | null,
): T[] {
  if (!clusterId.startsWith('name:')) return [...parcels]
  const keyNorm = clusterId.slice('name:'.length)
  return parcels.filter((parcel) => {
    const keys = keysForParcel(parcel)
    if (keys == null) return true
    return keys.some((key) => key.keyKind === 'name' && key.keyNorm === keyNorm)
  })
}

export type VisionOwnerPortfolioParcel = {
  town: string
  visionPid: string
  siteAddress: string
  lastPaidPrice: number | null
  lastPaidPriceLabel: string | null
  lastPaidSaleDate: string | null
}

export type VisionOwnerPortfolio = {
  clusterId: string
  clusterKind: VisionOwnerKeyKind
  /** Current warranty name on 2+ homes vs same mailbox. */
  relationship: 'landlord' | 'owner'
  town: string
  displayName: string
  mailingLabel: string | null
  parcelCount: number
  parcels: VisionOwnerPortfolioParcel[]
  /** Sum of last paid purchases on the homes in this panel. */
  lastPaidTotal: number | null
  lastPaidTotalLabel: string | null
}

export type VisionOwnerPortfolioDraft = Omit<
  VisionOwnerPortfolio,
  'lastPaidTotal' | 'lastPaidTotalLabel'
>

/** Sum last paid purchases already on the parcel list (not quitclaim $0). */
export function ownerPortfolioPurchaseTotal(
  parcels: readonly Pick<VisionOwnerPortfolioParcel, 'lastPaidPrice'>[],
): { lastPaidTotal: number | null; lastPaidTotalLabel: string | null } {
  let total = 0
  let counted = 0
  for (const parcel of parcels) {
    const price = parcel.lastPaidPrice
    if (price == null || !(price > 0)) continue
    total += price
    counted += 1
  }
  if (counted === 0) {
    return { lastPaidTotal: null, lastPaidTotalLabel: null }
  }
  return {
    lastPaidTotal: total,
    lastPaidTotalLabel: formatVisionMoney(total),
  }
}

export function clusterKindFromId(
  clusterId: string,
): VisionOwnerKeyKind | null {
  if (clusterId.startsWith('mailing:')) return 'mailing'
  if (clusterId.startsWith('name:')) return 'name'
  return null
}

/**
 * One row per portfolio. Prefer the largest cluster, mailing over name
 * when counts tie, and skip a cluster whose cards already appeared.
 */
export function pickUniqueOwnerPortfolios(
  rows: readonly VisionOwnerPortfolioDraft[],
): VisionOwnerPortfolio[] {
  const ranked = [...rows].sort((a, b) => {
    if (b.parcelCount !== a.parcelCount) return b.parcelCount - a.parcelCount
    if (a.clusterKind !== b.clusterKind) {
      return a.clusterKind === 'mailing' ? -1 : 1
    }
    return a.displayName.localeCompare(b.displayName)
  })
  const seen = new Set<string>()
  const out: VisionOwnerPortfolio[] = []
  for (const row of ranked) {
    const keys = row.parcels.map((p) => `${p.town}:${p.visionPid}`)
    if (keys.length === 0 || keys.every((key) => seen.has(key))) continue
    for (const key of keys) seen.add(key)
    out.push({
      ...row,
      ...ownerPortfolioPurchaseTotal(row.parcels),
    })
  }
  return out
}

export function ownerPortfolioRelationship(
  clusterKind: VisionOwnerKeyKind,
): 'landlord' | 'owner' {
  return clusterKind === 'name' ? 'landlord' : 'owner'
}
