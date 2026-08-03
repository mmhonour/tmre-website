import type { TmreTown } from '@/lib/tmre-towns'

/** One home Market Pulse town card (searchable TMRE set). */
export type HomeMarketPulseTown = {
  town: TmreTown
  tagline: string
  medianPrice: number | null
  daysOnMarket: number | null
  saleToList: number | null
  monthsSupply: number | null
  /** Closings with CloseDate in the past 7 days (from sales-by-month cache). */
  closedThisWeek: number | null
  /** Sum of close prices for those closings (dollar volume). */
  closedThisWeekVolume: number | null
  trends: {
    medianPrice: string
    daysOnMarket: string
    saleToList: string
    monthsSupply: string
    closedThisWeek: string
    closedThisWeekVolume: string
  }
}
