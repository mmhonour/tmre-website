export type StackCostStatus = 'ok' | 'needs_key' | 'error' | 'manual'

export type StackCostVendorRow = {
  id: string
  vendor: string
  what: string
  status: StackCostStatus
  need: string
  envKeys: string[]
  keysPresent: boolean
  amountUsd: number | null
  note: string | null
}

export type StackCostRollup = {
  from: string
  to: string
  fetchedAt: string
  rows: StackCostVendorRow[]
  totalUsd: number | null
}
