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

/**
 * Inclusive numeric year range per bucket, mirroring `classifyYearBuilt`
 * boundaries. The two open-ended buckets use a nominal 40-year span so the
 * edge rule always has a finite span to work with.
 */
export const VINTAGE_BUCKET_RANGES: Record<
  Exclude<VintageBucketId, 'unknown'>,
  { lo: number; hi: number }
> = {
  'pre-1900': { lo: 1859, hi: 1899 },
  '1900-1940': { lo: 1900, hi: 1940 },
  '1941-1970': { lo: 1941, hi: 1970 },
  '1970-1990': { lo: 1971, hi: 1990 },
  '1991-2010': { lo: 1991, hi: 2009 },
  '2010-2020': { lo: 2010, hi: 2019 },
  '2020-present': { lo: 2020, hi: 2060 },
}

/**
 * Fraction of a bucket's year span within which a subject sitting near an edge
 * also pulls in the bordering vintage. e.g. the 1900–1940 bucket spans 40
 * years, so 30% = 12 years: a home built in 1900 (at the low edge) also matches
 * Pre-1900, and a home built in 1928 (within 12 years of 1940) also matches
 * 1941–1970.
 */
export const COMPARABLES_VINTAGE_EDGE_FRACTION = 0.3

/**
 * Bordering vintage bucket(s) to include beyond the subject's own bucket when
 * the subject year sits within `COMPARABLES_VINTAGE_EDGE_FRACTION` of a shared
 * edge. Directional: a low-edge subject reaches the older bucket, a high-edge
 * subject reaches the newer one. Returns [] when the subject is comfortably
 * mid-bucket or has an unknown vintage.
 */
export function vintageEdgeBuckets(
  subjectYear: number | null | undefined,
  subjectBucket: VintageBucketId,
  edgeFraction: number = COMPARABLES_VINTAGE_EDGE_FRACTION,
): VintageBucketId[] {
  if (subjectBucket === 'unknown') return []
  if (subjectYear == null || !Number.isFinite(subjectYear)) return []
  const idx = vintageBucketIndex(subjectBucket)
  if (idx == null) return []
  const range = VINTAGE_BUCKET_RANGES[subjectBucket]
  if (!range) return []
  const span = range.hi - range.lo
  if (span <= 0) return []
  const fraction =
    Number.isFinite(edgeFraction) && edgeFraction > 0
      ? edgeFraction
      : COMPARABLES_VINTAGE_EDGE_FRACTION
  const threshold = span * fraction

  const out: VintageBucketId[] = []
  if (subjectYear - range.lo <= threshold) {
    const below = VINTAGE_BUCKETS[idx - 1]
    if (below) out.push(below.id)
  }
  if (range.hi - subjectYear <= threshold) {
    const above = VINTAGE_BUCKETS[idx + 1]
    if (above) out.push(above.id)
  }
  return out
}

/**
 * Comparable vintage match used by the matcher: the subject's own bucket always
 * qualifies, plus a bordering bucket when the subject year is within the edge
 * threshold of that shared boundary (see `vintageEdgeBuckets`).
 */
export function vintageMatchesForComparable(
  subjectYear: number | null | undefined,
  subjectBucket: VintageBucketId,
  compBucket: VintageBucketId,
  edgeFraction: number = COMPARABLES_VINTAGE_EDGE_FRACTION,
): boolean {
  if (subjectBucket === 'unknown' || compBucket === 'unknown') {
    return subjectBucket === compBucket
  }
  if (subjectBucket === compBucket) return true
  return vintageEdgeBuckets(subjectYear, subjectBucket, edgeFraction).includes(
    compBucket,
  )
}
