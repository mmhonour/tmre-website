import type { ListingKind } from '@/lib/listing-kind'
import type { ListingPropertyClass } from '@/lib/listing-property-class'
import type { StatsValueCalc } from '@/lib/stats-compute'

export type MonthsSupplyPayload = {
  city: string
  kind: ListingKind
  propertyClass: ListingPropertyClass
  activeCount: number
  /** Cached at rebuild — Market Pulse / Stats hover methodology. */
  activeCountCalc?: StatsValueCalc
  avgMonthlyClosings: number | null
  monthsSupply: number | null
  monthsSupplyCalc?: StatsValueCalc
  generatedAt: string
}
