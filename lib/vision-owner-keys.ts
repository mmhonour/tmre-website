import {
  addressMatchKey,
  normalizePropertyAddress,
} from '@/lib/property-address'
import { parseVisionMailingLetterParts } from '@/lib/vision-mailing-address'
import {
  compileVisionOwnerParts,
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
  return normalizeVisionOwnerLine(line)
    .split(/\s*&\s*/)
    .map((part) => part.trim())
    .filter(Boolean)
}

export function visionOwnerNameKeyNorm(person: string): string {
  return person
    .toLowerCase()
    .replace(/[.,']/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .join('|')
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
  const compiled = compileVisionOwnerParts(
    input.ownership ?? [],
    input.ownerName,
  )
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

  const lines = compiled.displayLines
  const warranty = lines[0] ?? compiled.displayName ?? input.ownerName
  pushNameKeys(out, seen, warranty, 'warranty_buyer')
  for (const line of lines.slice(1)) {
    pushNameKeys(out, seen, line, 'quitclaim_grantee')
  }
  if (lines.length === 0) {
    pushNameKeys(out, seen, input.ownerName, 'owner_of_record')
  }

  return out
}
