export type VintageBucketId =
  | 'pre-1900'
  | '1900-1940'
  | '1941-1970'
  | '1970-1990'
  | '1991-2010'
  | '2010-2020'
  | '2020-present'
  | 'unknown'

export type VintageBucket = {
  id: VintageBucketId
  label: string
}

/** Display order for charts — excludes unknown. */
export const VINTAGE_BUCKETS: VintageBucket[] = [
  { id: 'pre-1900', label: 'Pre-1900' },
  { id: '1900-1940', label: '1900–1940' },
  { id: '1941-1970', label: '1941–1970' },
  { id: '1970-1990', label: '1970–1990' },
  { id: '1991-2010', label: '1991–2010' },
  { id: '2010-2020', label: '2010–2020' },
  { id: '2020-present', label: '2020–present' },
]

const MAX_REASONABLE_YEAR = new Date().getFullYear() + 2

/** Map year built to a non-overlapping vintage bucket (user-facing labels). */
export function classifyYearBuilt(year: number | null | undefined): VintageBucketId {
  if (year == null || !Number.isFinite(year) || year < 1600 || year > MAX_REASONABLE_YEAR) {
    return 'unknown'
  }
  if (year < 1900) return 'pre-1900'
  if (year <= 1940) return '1900-1940'
  if (year <= 1970) return '1941-1970'
  if (year <= 1990) return '1970-1990'
  if (year <= 2009) return '1991-2010'
  if (year <= 2019) return '2010-2020'
  return '2020-present'
}

export function emptyVintageCounts(): Record<VintageBucketId, number> {
  return {
    'pre-1900': 0,
    '1900-1940': 0,
    '1941-1970': 0,
    '1970-1990': 0,
    '1991-2010': 0,
    '2010-2020': 0,
    '2020-present': 0,
    unknown: 0,
  }
}

/** Adjacent vintage buckets allowed when matching comparables. */
export const COMPARABLES_VINTAGE_BUCKET_TOLERANCE = 1

function vintageBucketIndex(id: VintageBucketId): number | null {
  const idx = VINTAGE_BUCKETS.findIndex((b) => b.id === id)
  return idx >= 0 ? idx : null
}

/** Bucket index distance for ranking comparables (0 = same bucket). */
export function vintageBucketDistance(
  subject: VintageBucketId,
  comp: VintageBucketId,
): number {
  if (subject === 'unknown' || comp === 'unknown') {
    return subject === comp ? 0 : Number.POSITIVE_INFINITY
  }
  const subjectIdx = vintageBucketIndex(subject)
  const compIdx = vintageBucketIndex(comp)
  if (subjectIdx == null || compIdx == null) return subject === comp ? 0 : 1
  return Math.abs(subjectIdx - compIdx)
}

/** True when comp vintage is within ±tolerance buckets of the subject. */
export function vintageBucketsWithinTolerance(
  subject: VintageBucketId,
  comp: VintageBucketId,
  tolerance = COMPARABLES_VINTAGE_BUCKET_TOLERANCE,
): boolean {
  if (subject === 'unknown' || comp === 'unknown') {
    return subject === comp
  }
  const subjectIdx = vintageBucketIndex(subject)
  const compIdx = vintageBucketIndex(comp)
  if (subjectIdx == null || compIdx == null) return subject === comp
  return Math.abs(subjectIdx - compIdx) <= tolerance
}
