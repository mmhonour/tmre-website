import type { TownBudgetSnapshot } from '@/lib/town-budget/types'
import { westportFy2027 } from '@/lib/town-budget/westport-fy-2027'
import { norwalkFy2027 } from '@/lib/town-budget/norwalk-fy-2027'
import { fairfieldFy2027 } from '@/lib/town-budget/fairfield-fy-2027'
import { wiltonFy2026 } from '@/lib/town-budget/wilton-fy-2026'
import { wiltonFy2027 } from '@/lib/town-budget/wilton-fy-2027'

export type { BudgetLineItem, TaxCalendarEntry, TownBudgetSnapshot } from '@/lib/town-budget/types'

export const TOWN_BUDGET_TOWNS = ['Westport', 'Norwalk', 'Fairfield', 'Wilton'] as const
export type TownBudgetTown = (typeof TOWN_BUDGET_TOWNS)[number]

/** All registered snapshots — multiple fiscal years per town when available. */
export const TOWN_BUDGET_SNAPSHOTS: TownBudgetSnapshot[] = [
  westportFy2027,
  norwalkFy2027,
  fairfieldFy2027,
  wiltonFy2027,
  wiltonFy2026,
]

export function getTownBudgetSnapshotsForTown(
  town: TownBudgetTown,
): TownBudgetSnapshot[] {
  return TOWN_BUDGET_SNAPSHOTS.filter((s) => s.town === town).sort((a, b) =>
    b.fiscalYear.localeCompare(a.fiscalYear),
  )
}

export function getAllTownBudgetSnapshots(): TownBudgetSnapshot[] {
  return [...TOWN_BUDGET_SNAPSHOTS]
}

export function getAvailableBudgetFiscalYears(): string[] {
  return Array.from(new Set(TOWN_BUDGET_SNAPSHOTS.map((s) => s.fiscalYear))).sort().reverse()
}

export function getTownBudget(
  town: TownBudgetTown,
  fiscalYear?: string,
): TownBudgetSnapshot {
  const snapshots = getTownBudgetSnapshotsForTown(town)
  if (fiscalYear) {
    const match = snapshots.find((s) => s.fiscalYear === fiscalYear)
    if (match) return match
  }
  return snapshots[0]!
}

export function formatBudgetCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatBudgetMillRate(rate: number): string {
  return rate.toFixed(2)
}
