import type { TmreTown } from '@/lib/tmre-towns'

/** One home Market Pulse town card (searchable TMRE set). */
export type HomeMarketPulseTown = {
  town: TmreTown
  tagline: string
  medianPrice: number | null
  daysOnMarket: number | null
  saleToList: number | null
  monthsSupply: number | null
  /** Closings with CloseDate in the past 28 days (from sales-by-month cache). */
  closedLast4Weeks: number | null
  /** Sum of close prices for those closings (dollar volume). */
  closedLast4WeeksVolume: number | null
  trends: {
    medianPrice: string
    daysOnMarket: string
    saleToList: string
    monthsSupply: string
    closedLast4Weeks: string
    closedLast4WeeksVolume: string
  }
}
