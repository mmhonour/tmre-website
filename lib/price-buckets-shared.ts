/**
 * Sale price bands for Stats "Sales by price" — defaults + normalize/classify.
 * Live overrides live in sync_meta (see price-buckets-config.ts).
 */

export type PriceBucketDef = {
  id: string
  label: string
  min: number
  /** Inclusive upper bound; null = open-ended (e.g. $10M+). */
  max: number | null
}

/** @deprecated Prefer PriceBucketDef — kept for existing imports. */
export type PriceBucket = PriceBucketDef

/** Legacy id union for the shipped defaults (custom admin ids are plain strings). */
export type PriceBucketId =
  | '0-500k'
  | '500k-1.249m'
  | '1.5m-2.25m'
  | '2.25m-3m'
  | '3m-4m'
  | '4m-6m'
  | '6m-10m'
  | '10m-plus'
  | 'unknown'
  | (string & {})

export type PriceBucketsConfig = {
  sale: PriceBucketDef[]
}

/** Closed-sale price tiers for Stats charts (code defaults). */
export const DEFAULT_PRICE_BUCKETS: PriceBucketDef[] = [
  { id: '0-500k', label: '$0–$499.99K', min: 0, max: 499_999 },
  { id: '500k-1.249m', label: '$500K–$1.249M', min: 500_000, max: 1_249_999 },
  // $1.25M–$1.5M rolls into this band so tiers stay contiguous.
  { id: '1.5m-2.25m', label: '$1.5M–$2.25M', min: 1_250_000, max: 2_249_999 },
  { id: '2.25m-3m', label: '$2.25M–$3M', min: 2_250_000, max: 2_999_999 },
  { id: '3m-4m', label: '$3M–$4M', min: 3_000_000, max: 3_999_999 },
  { id: '4m-6m', label: '$4M–$6M', min: 4_000_000, max: 5_999_999 },
  { id: '6m-10m', label: '$6M–$10M', min: 6_000_000, max: 9_999_999 },
  { id: '10m-plus', label: '$10M+', min: 10_000_000, max: null },
]

export const DEFAULT_PRICE_BUCKETS_CONFIG: PriceBucketsConfig = {
  sale: DEFAULT_PRICE_BUCKETS.map((b) => ({ ...b })),
}

/** Alias used across Stats — same as defaults until Admin overrides load. */
export const PRICE_BUCKETS = DEFAULT_PRICE_BUCKETS

export function clonePriceBucketsConfig(
  config: PriceBucketsConfig = DEFAULT_PRICE_BUCKETS_CONFIG,
): PriceBucketsConfig {
  return {
    sale: config.sale.map((b) => ({ ...b })),
  }
}

function slugId(raw: string): string {
  const s = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return s || 'band'
}

export function suggestPriceBucketId(label: string, used: Set<string>): string {
  let base = slugId(label)
  if (!used.has(base)) return base
  let n = 2
  while (used.has(`${base}-${n}`)) n += 1
  return `${base}-${n}`
}

export function normalizePriceBucketsConfig(
  input: unknown,
): { ok: true; config: PriceBucketsConfig } | { ok: false; error: string } {
  if (input == null || typeof input !== 'object') {
    return { ok: false, error: 'Config must be an object' }
  }
  const raw = input as { sale?: unknown }
  const list = Array.isArray(raw.sale)
    ? raw.sale
    : Array.isArray(input)
      ? input
      : null
  if (!list) {
    return { ok: false, error: 'sale must be an array of price bands' }
  }
  if (list.length < 1) {
    return { ok: false, error: 'Add at least one price band' }
  }
  if (list.length > 24) {
    return { ok: false, error: 'At most 24 price bands' }
  }

  const sale: PriceBucketDef[] = []
  const seen = new Set<string>()

  for (let i = 0; i < list.length; i++) {
    const row = list[i]
    if (!row || typeof row !== 'object') {
      return { ok: false, error: `Band ${i + 1}: invalid row` }
    }
    const r = row as Record<string, unknown>
    const label =
      typeof r.label === 'string' && r.label.trim() ? r.label.trim() : ''
    if (!label || label.length > 64) {
      return { ok: false, error: `Band ${i + 1}: label required (max 64 chars)` }
    }
    let id =
      typeof r.id === 'string' && r.id.trim()
        ? r.id.trim().toLowerCase()
        : suggestPriceBucketId(label, seen)
    if (id === 'unknown') {
      return { ok: false, error: `Band ${i + 1}: id "unknown" is reserved` }
    }
    if (!/^[a-z0-9][a-z0-9._-]{0,47}$/.test(id)) {
      return {
        ok: false,
        error: `Band ${i + 1}: id must be lowercase alphanumeric (max 48)`,
      }
    }
    if (seen.has(id)) {
      return { ok: false, error: `Duplicate band id "${id}"` }
    }
    seen.add(id)

    const min = Number(r.min)
    if (!Number.isFinite(min) || min < 0) {
      return { ok: false, error: `Band ${i + 1}: min must be ≥ 0` }
    }
    let max: number | null = null
    if (r.max != null && r.max !== '') {
      const maxN = Number(r.max)
      if (!Number.isFinite(maxN) || maxN < min) {
        return {
          ok: false,
          error: `Band ${i + 1}: max must be ≥ min (or empty for open-ended)`,
        }
      }
      max = maxN
    }

    sale.push({ id, label, min, max })
  }

  sale.sort((a, b) => a.min - b.min || a.id.localeCompare(b.id))

  return { ok: true, config: { sale } }
}

export function classifySalePrice(
  price: number | null | undefined,
  buckets: readonly PriceBucketDef[] = DEFAULT_PRICE_BUCKETS,
): string {
  if (price == null || !Number.isFinite(price) || price <= 0) return 'unknown'
  for (const bucket of buckets) {
    if (price < bucket.min) continue
    if (bucket.max == null || price <= bucket.max) return bucket.id
  }
  return 'unknown'
}

export function emptyPriceCounts(
  buckets: readonly PriceBucketDef[] = DEFAULT_PRICE_BUCKETS,
): Record<string, number> {
  const out: Record<string, number> = { unknown: 0 }
  for (const b of buckets) out[b.id] = 0
  return out
}

export function isDefaultPriceBucketsConfig(config: PriceBucketsConfig): boolean {
  return (
    JSON.stringify(config.sale) ===
    JSON.stringify(DEFAULT_PRICE_BUCKETS_CONFIG.sale)
  )
}
