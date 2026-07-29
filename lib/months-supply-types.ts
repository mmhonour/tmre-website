import type { ListingKind } from '@/lib/listing-kind'
import type { ListingPropertyClass } from '@/lib/listing-property-class'

export type MonthsSupplyPayload = {
  city: string
  kind: ListingKind
  propertyClass: ListingPropertyClass
  activeCount: number
  avgMonthlyClosings: number | null
  monthsSupply: number | null
  generatedAt: string
}
