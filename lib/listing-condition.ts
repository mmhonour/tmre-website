import { matchesNewConstruction } from '@/lib/new-construction'

/** 1 = Excellent … 4 = Poor. Lower is better. */
export const LISTING_CONDITION_GRADES = [
  'excellent',
  'good',
  'fair',
  'poor',
] as const

export type ListingConditionGrade = (typeof LISTING_CONDITION_GRADES)[number]
export type ListingConditionRank = 1 | 2 | 3 | 4

export const LISTING_CONDITION_LABELS: Record<ListingConditionGrade, string> = {
  excellent: 'Excellent',
  good: 'Good',
  fair: 'Fair',
  poor: 'Poor',
}

export const LISTING_CONDITION_RANKS: Record<ListingConditionGrade, ListingConditionRank> =
  {
    excellent: 1,
    good: 2,
    fair: 3,
    poor: 4,
  }

/**
 * Manual grades until listings carry a stored condition.
 * 772 Rowland Rd (MLS 24186969) is Excellent for coastal What-if.
 */
export const LISTING_CONDITION_OVERRIDES: Record<string, ListingConditionGrade> = {
  '24186969': 'excellent',
}

export function isListingConditionGrade(
  value: unknown,
): value is ListingConditionGrade {
  return (
    value === 'excellent' ||
    value === 'good' ||
    value === 'fair' ||
    value === 'poor'
  )
}

export function listingConditionRank(
  grade: ListingConditionGrade | null | undefined,
): ListingConditionRank | null {
  if (!grade) return null
  return LISTING_CONDITION_RANKS[grade]
}

export function listingConditionLabel(
  grade: ListingConditionGrade | null | undefined,
): string | null {
  if (!grade) return null
  return LISTING_CONDITION_LABELS[grade]
}

/** Adjacent ranks count as similar (e.g. Excellent vs Good). */
export function conditionsAreSimilar(
  subject: ListingConditionGrade | null | undefined,
  comp: ListingConditionGrade | null | undefined,
): boolean {
  if (!subject || !comp) return true
  return Math.abs(LISTING_CONDITION_RANKS[subject] - LISTING_CONDITION_RANKS[comp]) <= 1
}

export function conditionsAreExact(
  subject: ListingConditionGrade | null | undefined,
  comp: ListingConditionGrade | null | undefined,
): boolean {
  if (!subject || !comp) return false
  return subject === comp
}

export function resolveListingCondition(input: {
  mlsId?: string | null
  listingKey?: string | null
  yearBuilt?: number | null
  propertyType?: string | null
  remarks?: string | null
  conditionGrade?: ListingConditionGrade | null
}): ListingConditionGrade | null {
  if (isListingConditionGrade(input.conditionGrade)) return input.conditionGrade

  const ids = [input.mlsId, input.listingKey]
    .map((id) => id?.trim())
    .filter((id): id is string => Boolean(id))
  for (const id of ids) {
    const override = LISTING_CONDITION_OVERRIDES[id]
    if (override) return override
  }

  const hay = [input.propertyType, input.remarks].filter(Boolean).join(' ')
  if (matchesNewConstruction(input.yearBuilt, hay || input.propertyType)) {
    return 'excellent'
  }
  return null
}
