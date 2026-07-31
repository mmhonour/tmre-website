/** Client-safe town budget source slots (Admin → Data controls). */

import { TMRE_TOWNS, type TmreTown } from '@/lib/tmre-towns'

export type TownBudgetSourceSlot = {
  /** TMRE town this slot points at. */
  town: TmreTown
  /** Calendar / fetch year (default = current calendar year). */
  year: number
  /** Official budget page or document URL to fetch later. */
  sourceUrl: string
  /** Optional note (doc type, FY label, etc.). */
  notes: string
}

export type TownBudgetSourcesConfig = {
  slots: TownBudgetSourceSlot[]
}

export const TOWN_BUDGET_SOURCE_SLOT_COUNT = TMRE_TOWNS.length

export function currentBudgetFetchYear(now = new Date()): number {
  return now.getFullYear()
}

/** Year options for the Admin dropdown: prior through near-future. */
export function budgetFetchYearOptions(now = new Date()): number[] {
  const y = currentBudgetFetchYear(now)
  const years: number[] = []
  for (let i = y - 5; i <= y + 2; i++) years.push(i)
  return years
}

export function defaultTownBudgetSources(
  now = new Date(),
): TownBudgetSourcesConfig {
  const year = currentBudgetFetchYear(now)
  return {
    slots: TMRE_TOWNS.map((town) => ({
      town,
      year,
      sourceUrl: '',
      notes: '',
    })),
  }
}

export const DEFAULT_TOWN_BUDGET_SOURCES = defaultTownBudgetSources()

function asTown(value: unknown): TmreTown | null {
  if (typeof value !== 'string') return null
  return (TMRE_TOWNS as readonly string[]).includes(value)
    ? (value as TmreTown)
    : null
}

function asYear(value: unknown, fallback: number): number {
  const n =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim()
        ? Number(value)
        : NaN
  if (!Number.isFinite(n)) return fallback
  const y = Math.round(n)
  if (y < 1990 || y > 2100) return fallback
  return y
}

export function normalizeTownBudgetSources(
  raw: unknown,
  now = new Date(),
): TownBudgetSourcesConfig {
  const fallbackYear = currentBudgetFetchYear(now)
  const defaults = defaultTownBudgetSources(now).slots
  const incoming =
    raw &&
    typeof raw === 'object' &&
    Array.isArray((raw as { slots?: unknown }).slots)
      ? (raw as { slots: unknown[] }).slots
      : []

  // Prefer matching by town name so reordering TMRE_TOWNS does not scramble URLs.
  const byTown = new Map<string, Record<string, unknown>>()
  for (const row of incoming) {
    if (!row || typeof row !== 'object') continue
    const o = row as Record<string, unknown>
    const town = asTown(o.town)
    if (town) byTown.set(town, o)
  }

  const slots: TownBudgetSourceSlot[] = defaults.map((fallback, i) => {
    const o = byTown.get(fallback.town) ??
      (incoming[i] && typeof incoming[i] === 'object'
        ? (incoming[i] as Record<string, unknown>)
        : null)
    if (!o) return { ...fallback }
    return {
      town: fallback.town,
      year: asYear(o.year, fallbackYear),
      sourceUrl:
        typeof o.sourceUrl === 'string' ? o.sourceUrl.trim().slice(0, 800) : '',
      notes: typeof o.notes === 'string' ? o.notes.trim().slice(0, 500) : '',
    }
  })

  return { slots }
}
