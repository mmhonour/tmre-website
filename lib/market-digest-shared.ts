/** Client-safe market digest config types. */

export const DEFAULT_MARKET_DIGEST_SUBJECT_TEMPLATE =
  'Monday market brief — months supply & inventory ({date})'

export type MarketDigestConfig = {
  email: string
  enabled: boolean
  lastSentAt: string | null
  lastWeekKey: string | null
  /** Fallback when digest email unset. */
  defaultEmail: string
  /**
   * Subject line template. `{date}` → Eastern long date
   * (e.g. Monday, August 3, 2026).
   */
  subjectTemplate: string
  /** When true, append Admin social-profile handles in the email footer. */
  includeSocialProfiles: boolean
}
