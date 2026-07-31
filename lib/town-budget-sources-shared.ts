/** Client-safe town budget source slots (Admin → Data controls). */

export type TownBudgetSourceSlot = {
  /** Municipality name (matches ct_towns.name when active). */
  town: string
  /** Calendar / fetch year (default = current calendar year). */
  year: number
  /** Official budget page or document URL to fetch later. */
  sourceUrl: string
}

export type TownBudgetSourcesConfig = {
  slots: TownBudgetSourceSlot[]
}

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

export function emptyTownBudgetSources(): TownBudgetSourcesConfig {
  return { slots: [] }
}

/** @deprecated Prefer empty + active towns merge — kept for API payload shape. */
export const DEFAULT_TOWN_BUDGET_SOURCES = emptyTownBudgetSources()

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

function asTownName(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const town = value.trim().slice(0, 80)
  return town || null
}

/** Index stored / incoming slots by town name (case-sensitive, matches ct_towns). */
export function townBudgetSlotsByTown(
  raw: unknown,
): Map<string, TownBudgetSourceSlot> {
  const fallbackYear = currentBudgetFetchYear()
  const map = new Map<string, TownBudgetSourceSlot>()
  const incoming =
    raw &&
    typeof raw === 'object' &&
    Array.isArray((raw as { slots?: unknown }).slots)
      ? (raw as { slots: unknown[] }).slots
      : []

  for (const row of incoming) {
    if (!row || typeof row !== 'object') continue
    const o = row as Record<string, unknown>
    const town = asTownName(o.town)
    if (!town) continue
    map.set(town, {
      town,
      year: asYear(o.year, fallbackYear),
      sourceUrl:
        typeof o.sourceUrl === 'string' ? o.sourceUrl.trim().slice(0, 800) : '',
    })
  }
  return map
}

/**
 * Build display slots for the given active CT coverage towns, carrying forward
 * any saved URL / year from storage.
 */
export function mergeTownBudgetSourcesForActiveTowns(
  stored: unknown,
  activeTowns: readonly string[],
  now = new Date(),
): TownBudgetSourcesConfig {
  const byTown = townBudgetSlotsByTown(stored)
  const year = currentBudgetFetchYear(now)
  const towns = [...activeTowns]
    .map((t) => t.trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b))

  return {
    slots: towns.map((town) => {
      const prev = byTown.get(town)
      return {
        town,
        year: prev ? asYear(prev.year, year) : year,
        sourceUrl: prev?.sourceUrl ?? '',
      }
    }),
  }
}

/**
 * Normalize a PATCH body. When `activeTowns` is provided, only those towns are
 * returned (for the Admin table). Without it, returns every slot in the body.
 */
export function normalizeTownBudgetSources(
  raw: unknown,
  options?: { activeTowns?: readonly string[]; now?: Date },
): TownBudgetSourcesConfig {
  const now = options?.now ?? new Date()
  if (options?.activeTowns) {
    return mergeTownBudgetSourcesForActiveTowns(raw, options.activeTowns, now)
  }
  const byTown = townBudgetSlotsByTown(raw)
  const slots = [...byTown.values()].sort((a, b) =>
    a.town.localeCompare(b.town),
  )
  return { slots }
}
