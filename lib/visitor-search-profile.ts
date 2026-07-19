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
      (c.boardStatus && c.boardStatus !== 'all'),
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
  }
}

function readHistoryRaw(): VisitorSearchProfileEntry[] {
  const raw = readClientPref(SEARCH_HISTORY_COOKIE)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (row): row is VisitorSearchProfileEntry =>
        !!row &&
        typeof row === 'object' &&
        typeof (row as VisitorSearchProfileEntry).fingerprint === 'string' &&
        typeof (row as VisitorSearchProfileEntry).label === 'string' &&
        !!(row as VisitorSearchProfileEntry).criteria,
    )
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

/**
 * Unique searches for the Latest alert form: history cookie first, then the
 * current cookie filter snapshot if it isn't already listed.
 */
export function listUniqueVisitorSearches(): VisitorSearchProfileEntry[] {
  if (typeof document === 'undefined') return []
  const history = readHistoryRaw()
  const current = readCurrentSearchFromCookies()
  if (!isMeaningfulCriteria(current)) return history
  const fp = fingerprintCriteria(current)
  if (history.some((e) => e.fingerprint === fp)) return history
  return [
    {
      fingerprint: fp,
      label: labelCriteria(current),
      criteria: current,
      lastUsedAt: new Date().toISOString(),
      useCount: 1,
    },
    ...history,
  ]
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
