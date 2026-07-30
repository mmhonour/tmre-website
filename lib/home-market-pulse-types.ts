import type { TmreTown } from '@/lib/tmre-towns'

/** One home Market Pulse town card (searchable TMRE set). */
export type HomeMarketPulseTown = {
  town: TmreTown
  tagline: string
  medianPrice: number | null
  daysOnMarket: number | null
  saleToList: number | null
  monthsSupply: number | null
  trends: {
    medianPrice: string
    daysOnMarket: string
    saleToList: string
    monthsSupply: string
  }
}
