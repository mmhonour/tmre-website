/** Market Pulse category tabs (web). Email stays on ALL sales. */
export const MARKET_PULSE_CATEGORY_IDS = [
  'all',
  'sfr',
  'condo',
  'rentals',
  'commercial',
] as const

export type MarketPulseCategoryId = (typeof MARKET_PULSE_CATEGORY_IDS)[number]
