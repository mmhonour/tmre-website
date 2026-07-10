export type BudgetLineItem = {
  id: string
  label: string
  amount: number
  sharePct: number
}

export type TaxCalendarEntry = {
  month: string
  day: string
  note: string
}

export type TownBudgetSnapshot = {
  town: string
  fiscalYear: string
  sourceLabel: string
  sourceUrl?: string
  millRate: {
    current: number
    prior: number
    changePct: number
  }
  totalBudget: number
  stateAssistance: number
  fundBalanceReservePct: number
  highlights: string[]
  allocation: BudgetLineItem[]
  revenues: BudgetLineItem[]
  expenditures: BudgetLineItem[]
  taxCalendar: TaxCalendarEntry[]
  contacts: {
    taxCollectorPhone: string
    taxCollectorEmail: string
    taxCollectorUrl: string
    payTaxesUrl: string
    assessorPhone: string
    townHallAddress: string
  }
}
