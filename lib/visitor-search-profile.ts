/**
 * Client-side visitor search profile built from filter cookies + a history
 * cookie of unique searches. Used by /latest alert signup and recorded from
 * Intelligence (and similar filter surfaces) as users refine criteria.
 */

import {
  clearClientPref,
  readClientPref,
  writeClientPref,
} from '@/lib/client-prefs'
import { TMRE_TOWNS } from '@/lib/tmre-towns'

export const SEARCH_HISTORY_COOKIE = 'tmre_search_history'
const HISTORY_MAX = 24

export type VisitorSearchCriteria = {
  source: 'intelligence' | 'find' | 'latest' | 'custom'
  /** Town name, or null / "All" for any TMRE town. */
  town: string | null
  tx: 'sale' | 'rental' | 'all' | null
  propertyClass: 'residential' | 'commercial' | 'all' | null
  saleProperty: string | null
  minBeds: number | null
  maxBeds: number | null
  minBaths: number | null
  maxBaths: number | null
  zip: string | null
  newConstruction: boolean | null
  boardStatus: string | null
  /** Intelligence price band; null = no floor / no cap. */
  minPrice: number | null
  maxPrice: number | null
}

export type VisitorSearchProfileEntry = {
  fingerprint: string
  label: string
  criteria: VisitorSearchCriteria
  lastUsedAt: string
  useCount: number
}

function parseNumFilter(raw: string | null, opts?: { maxIsOpen?: boolean }): number | null {
  if (!raw || raw === 'any' || raw === 'all' || raw === '' || raw === '0') return null
  // Intelligence sliders use "6" as the open top of the range — treat as no cap.
  if (opts?.maxIsOpen && raw === '6') return null
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : null
}

function normalizeTown(raw: string | null): string | null {
  if (!raw || raw === 'All' || raw === 'all') return null
  return raw.trim() || null
}

function normalizePrice(raw: unknown): number | null {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) return null
  return raw
}

function formatPriceBit(n: number): string {
  if (n >= 1_000_000) {
    const m = n / 1_000_000
    const s = Number.isInteger(m) ? String(m) : m.toFixed(1).replace(/\.0$/, '')
    return `$${s}M`
  }
  if (n >= 1000) return `$${Math.round(n / 1000)}K`
  return `$${Math.round(n).toLocaleString()}`
}

/** Compact price band for alert labels — e.g. `$800K–$1.5M`, `$1M+`. */
export function formatCriteriaPriceRange(
  minPrice: number | null | undefined,
  maxPrice: number | null | undefined,
): string | null {
  const hasMin = minPrice != null && minPrice > 0
  const hasMax = maxPrice != null && maxPrice > 0
  if (!hasMin && !hasMax) return null
  if (hasMin && hasMax) return `${formatPriceBit(minPrice!)}–${formatPriceBit(maxPrice!)}`
  if (hasMin) return `${formatPriceBit(minPrice!)}+`
  return `Up to ${formatPriceBit(maxPrice!)}`
}

function readIntelBoardPrices(): { minPrice: number | null; maxPrice: number | null } {
  const raw = readClientPref('tmre_intel_board')
  if (!raw) return { minPrice: null, maxPrice: null }
  const qs = raw.startsWith('?') ? raw.slice(1) : raw
  try {
    const params = new URLSearchParams(qs)
    const pmin = Number(params.get('pmin'))
    const pmax = Number(params.get('pmax'))
    return {
      minPrice: Number.isFinite(pmin) && pmin > 0 ? pmin : null,
      maxPrice: Number.isFinite(pmax) && pmax > 0 ? pmax : null,
    }
  } catch {
    return { minPrice: null, maxPrice: null }
  }
}

export function normalizeVisitorSearchCriteria(
  raw: Partial<VisitorSearchCriteria> & Pick<VisitorSearchCriteria, 'source'>,
): VisitorSearchCriteria {
  return {
    source: raw.source,
    town: raw.town ?? null,
    tx: raw.tx ?? null,
    propertyClass: raw.propertyClass ?? null,
    saleProperty: raw.saleProperty ?? null,
    minBeds: raw.minBeds ?? null,
    maxBeds: raw.maxBeds ?? null,
    minBaths: raw.minBaths ?? null,
    maxBaths: raw.maxBaths ?? null,
    zip: raw.zip ?? null,
    newConstruction: raw.newConstruction ?? null,
    boardStatus: raw.boardStatus ?? null,
    minPrice: normalizePrice(raw.minPrice),
    maxPrice: normalizePrice(raw.maxPrice),
  }
}

/** Stable fingerprint for deduping unique searches. */
export function fingerprintCriteria(c: VisitorSearchCriteria): string {
  const parts = [
    c.source,
    c.town ?? '*',
    c.tx ?? '*',
    c.propertyClass ?? '*',
    c.saleProperty ?? '*',
    c.minBeds ?? '*',
    c.maxBeds ?? '*',
    c.minBaths ?? '*',
    c.maxBaths ?? '*',
    c.zip ?? '*',
    c.newConstruction === null ? '*' : c.newConstruction ? '1' : '0',
    c.boardStatus ?? '*',
    c.minPrice ?? '*',
    c.maxPrice ?? '*',
  ]
  return parts.join('|')
}

/** Human label for the Latest form dropdown. */
export function labelCriteria(c: VisitorSearchCriteria): string {
  const bits: string[] = []
  if (c.town) bits.push(c.town)
  else bits.push('All towns')
  if (c.tx === 'sale') bits.push('for sale')
  else if (c.tx === 'rental') bits.push('for rent')
  if (c.saleProperty && c.saleProperty !== 'all') bits.push(c.saleProperty)
  else if (c.propertyClass && c.propertyClass !== 'all') bits.push(c.propertyClass)
  if (c.zip) bits.push(`ZIP ${c.zip}`)
  if (c.minBeds != null || c.maxBeds != null) {
    if (c.minBeds != null && c.maxBeds != null && c.minBeds === c.maxBeds) {
      bits.push(`${c.minBeds} bed`)
    } else if (c.minBeds != null && c.maxBeds != null) {
      bits.push(`${c.minBeds}–${c.maxBeds} beds`)
    } else if (c.minBeds != null) bits.push(`${c.minBeds}+ beds`)
    else bits.push(`≤${c.maxBeds} beds`)
  }
  if (c.minBaths != null) bits.push(`${c.minBaths}+ baths`)
  if (c.newConstruction) bits.push('new construction')
  if (c.boardStatus && c.boardStatus !== 'all') bits.push(c.boardStatus)
  const price = formatCriteriaPriceRange(c.minPrice, c.maxPrice)
  if (price) bits.push(price)
  return bits.join(' · ')
}

/** True when criteria is too empty to be a useful alert. */
export function isMeaningfulCriteria(c: VisitorSearchCriteria): boolean {
  return Boolean(
    c.town ||
      c.zip ||
      (c.tx && c.tx !== 'all') ||
      (c.saleProperty && c.saleProperty !== 'all') ||
      (c.propertyClass && c.propertyClass !== 'all' && c.propertyClass !== 'residential') ||
      c.minBeds != null ||
      c.maxBeds != null ||
      c.minBaths != null ||
      c.maxBaths != null ||
      c.newConstruction === true ||
      (c.boardStatus && c.boardStatus !== 'all') ||
      (c.minPrice != null && c.minPrice > 0) ||
      (c.maxPrice != null && c.maxPrice > 0),
  )
}

/** Snapshot of current Intelligence / Find filter cookies. */
export function readCurrentSearchFromCookies(): VisitorSearchCriteria {
  const findTown = readClientPref('tmre_find_town')
  const intelTown = readClientPref('tmre_intel_city')
  const town = normalizeTown(intelTown) ?? normalizeTown(findTown)

  const txRaw = readClientPref('tmre_tx')
  const tx =
    txRaw === 'sale' || txRaw === 'rental' || txRaw === 'all' ? txRaw : null

  const clsRaw = readClientPref('tmre_cls')
  const propertyClass =
    clsRaw === 'residential' || clsRaw === 'commercial' || clsRaw === 'all'
      ? clsRaw
      : null

  const saleProperty = readClientPref('tmre_sale_property')
  const nc = readClientPref('tmre_intel_new_construction')
  const boardPrices = readIntelBoardPrices()

  return {
    source: intelTown || txRaw || clsRaw ? 'intelligence' : findTown ? 'find' : 'custom',
    town,
    tx,
    propertyClass,
    saleProperty: saleProperty && saleProperty !== 'all' ? saleProperty : null,
    minBeds: parseNumFilter(readClientPref('tmre_intel_min_beds')),
    maxBeds: parseNumFilter(readClientPref('tmre_intel_max_beds'), {
      maxIsOpen: true,
    }),
    minBaths: parseNumFilter(readClientPref('tmre_intel_min_baths')),
    maxBaths: parseNumFilter(readClientPref('tmre_intel_max_baths'), {
      maxIsOpen: true,
    }),
    zip: readClientPref('tmre_intel_zip') || null,
    newConstruction: nc === 'new' ? true : nc === 'all' || !nc ? null : false,
    boardStatus: readClientPref('tmre_intel_board_status'),
    minPrice: boardPrices.minPrice,
    maxPrice: boardPrices.maxPrice,
  }
}

/**
 * When the visitor has no Intelligence / Find history yet, seed an alert from
 * the page they are on (town + sale/rent) plus the home type and price band
 * stored in their filter cookies.
 */
export function fallbackCriteriaFromPage(opts: {
  town?: string | null
  tx?: 'sale' | 'rental' | 'all' | null
}): VisitorSearchCriteria {
  const current = readCurrentSearchFromCookies()
  const town = normalizeTown(opts.town ?? null) ?? current.town
  const tx =
    opts.tx === 'sale' || opts.tx === 'rental' || opts.tx === 'all'
      ? opts.tx === 'all'
        ? current.tx
        : opts.tx
      : current.tx
  return normalizeVisitorSearchCriteria({
    ...current,
    source: 'intelligence',
    town,
    tx,
  })
}

function readHistoryRaw(): VisitorSearchProfileEntry[] {
  const raw = readClientPref(SEARCH_HISTORY_COOKIE)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap((row) => {
      if (
        !row ||
        typeof row !== 'object' ||
        typeof (row as VisitorSearchProfileEntry).fingerprint !== 'string' ||
        typeof (row as VisitorSearchProfileEntry).label !== 'string' ||
        !(row as VisitorSearchProfileEntry).criteria
      ) {
        return []
      }
      const entry = row as VisitorSearchProfileEntry
      const criteria = normalizeVisitorSearchCriteria(entry.criteria)
      return [
        {
          ...entry,
          criteria,
          fingerprint: fingerprintCriteria(criteria),
          label: labelCriteria(criteria),
        },
      ]
    })
  } catch {
    return []
  }
}

function writeHistory(entries: VisitorSearchProfileEntry[]): void {
  writeClientPref(SEARCH_HISTORY_COOKIE, JSON.stringify(entries.slice(0, HISTORY_MAX)))
}

/** Record a unique search into the history cookie (deduped by fingerprint). */
export function recordVisitorSearch(criteria: VisitorSearchCriteria): void {
  if (typeof document === 'undefined') return
  criteria = normalizeVisitorSearchCriteria(criteria)
  if (!isMeaningfulCriteria(criteria)) return
  const fingerprint = fingerprintCriteria(criteria)
  const label = labelCriteria(criteria)
  const now = new Date().toISOString()
  const prev = readHistoryRaw()
  const existing = prev.find((e) => e.fingerprint === fingerprint)
  const next: VisitorSearchProfileEntry[] = existing
    ? [
        {
          ...existing,
          label,
          criteria,
          lastUsedAt: now,
          useCount: existing.useCount + 1,
        },
        ...prev.filter((e) => e.fingerprint !== fingerprint),
      ]
    : [{ fingerprint, label, criteria, lastUsedAt: now, useCount: 1 }, ...prev]
  writeHistory(next)
}

/** Most-used first; ties break to most recently used. */
export function sortVisitorSearchesByFrequency(
  entries: VisitorSearchProfileEntry[],
): VisitorSearchProfileEntry[] {
  return [...entries].sort((a, b) => {
    const byCount = (b.useCount || 0) - (a.useCount || 0)
    if (byCount !== 0) return byCount
    return (b.lastUsedAt || '').localeCompare(a.lastUsedAt || '')
  })
}

/**
 * Unique searches for the Latest alert form: history cookie first, then the
 * current cookie filter snapshot if it isn't already listed.
 * Ordered by frequency (most common search first).
 */
export function listUniqueVisitorSearches(): VisitorSearchProfileEntry[] {
  if (typeof document === 'undefined') return []
  const history = readHistoryRaw()
  const current = readCurrentSearchFromCookies()
  if (!isMeaningfulCriteria(current)) {
    return sortVisitorSearchesByFrequency(history)
  }
  const fp = fingerprintCriteria(current)
  if (history.some((e) => e.fingerprint === fp)) {
    return sortVisitorSearchesByFrequency(history)
  }
  return sortVisitorSearchesByFrequency([
    {
      fingerprint: fp,
      label: labelCriteria(current),
      criteria: current,
      lastUsedAt: new Date().toISOString(),
      useCount: 1,
    },
    ...history,
  ])
}

/**
 * Recent unique searches, or a single synthesized entry from `fallback` when
 * the visitor has not run Intelligence / Find yet.
 */
export function listUniqueVisitorSearchesOrFallback(
  fallback?: VisitorSearchCriteria | null,
): { searches: VisitorSearchProfileEntry[]; usedFallback: boolean } {
  const searches = listUniqueVisitorSearches()
  if (searches.length > 0) return { searches, usedFallback: false }
  if (!fallback) return { searches: [], usedFallback: false }
  const criteria = normalizeVisitorSearchCriteria(fallback)
  if (!isMeaningfulCriteria(criteria)) {
    return { searches: [], usedFallback: false }
  }
  return {
    searches: [
      {
        fingerprint: fingerprintCriteria(criteria),
        label: labelCriteria(criteria),
        criteria,
        lastUsedAt: new Date().toISOString(),
        useCount: 1,
      },
    ],
    usedFallback: true,
  }
}

export function clearVisitorSearchHistory(): void {
  clearClientPref(SEARCH_HISTORY_COOKIE)
}

/** Towns a criteria applies to (for matching). Empty = all TMRE towns. */
export function townsForCriteria(c: VisitorSearchCriteria): string[] {
  if (c.town && (TMRE_TOWNS as readonly string[]).includes(c.town)) {
    return [c.town]
  }
  return []
}
