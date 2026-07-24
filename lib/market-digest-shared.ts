/** Client-safe market digest config types. */

export type MarketDigestConfig = {
  email: string
  enabled: boolean
  lastSentAt: string | null
  lastWeekKey: string | null
  /** Fallback when digest email unset. */
  defaultEmail: string
}
