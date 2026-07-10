import type { TownBudgetSnapshot } from '@/lib/town-budget/types'
import { westportFy2027 } from '@/lib/town-budget/westport-fy-2027'

export type { BudgetLineItem, TaxCalendarEntry, TownBudgetSnapshot } from '@/lib/town-budget/types'

export const TOWN_BUDGET_TOWNS = ['Westport'] as const
export type TownBudgetTown = (typeof TOWN_BUDGET_TOWNS)[number]

const byTown: Record<TownBudgetTown, TownBudgetSnapshot> = {
  Westport: westportFy2027,
}

export function getTownBudget(town: TownBudgetTown): TownBudgetSnapshot {
  return byTown[town]
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
