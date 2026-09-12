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
  isVisionQuitclaim,
  normalizeVisionOwnerLine,
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
  /** A given name alone is not a landlord key (`Melissa` ≠ Melissa Marks). */
  if (tokens.length < 2) return ''
  return [...tokens].sort().join('|')
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

  for (const row of input.ownership ?? []) {
    const role: VisionOwnerKeyRole = isVisionQuitclaim(row)
      ? 'quitclaim_grantee'
      : 'warranty_buyer'
    pushNameKeys(out, seen, row.owner, role)
  }
  pushNameKeys(out, seen, input.ownerName, 'owner_of_record')

  return out
}

export type VisionOwnerPortfolioParcel = {
  town: string
  visionPid: string
  siteAddress: string
}

export type VisionOwnerPortfolio = {
  clusterId: string
  clusterKind: VisionOwnerKeyKind
  /** Name from deed history (2+ homes) vs same mailbox. */
  relationship: 'landlord' | 'owner'
  town: string
  displayName: string
  mailingLabel: string | null
  parcelCount: number
  parcels: VisionOwnerPortfolioParcel[]
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
  rows: readonly VisionOwnerPortfolio[],
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
    out.push(row)
  }
  return out
}

export function ownerPortfolioRelationship(
  clusterKind: VisionOwnerKeyKind,
): 'landlord' | 'owner' {
  return clusterKind === 'name' ? 'landlord' : 'owner'
}
