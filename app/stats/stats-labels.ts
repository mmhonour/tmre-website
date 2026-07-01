import type { StatsKind } from './stats-towns'

export function statsVolumeNoun(kind: StatsKind, plural = true): string {
  if (kind === 'rental') return plural ? 'leases' : 'lease'
  return plural ? 'sales' : 'sale'
}

export function statsClosedLabel(kind: StatsKind): string {
  return kind === 'rental' ? 'closed leases' : 'closed sales'
}

export function statsActiveLabel(kind: StatsKind): string {
  return kind === 'rental' ? 'active rentals' : 'active listings'
}

export function statsPriceBandLabel(kind: StatsKind): string {
  return kind === 'rental' ? 'Rent band' : 'Price band'
}

export function statsByPriceTitle(kind: StatsKind): string {
  return kind === 'rental' ? 'Leases by rent' : 'Sales by price'
}

export function statsByVintageTitle(kind: StatsKind): string {
  return kind === 'rental' ? 'Leases by vintage' : 'Sales by vintage'
}

export function statsByMonthTitle(kind: StatsKind): string {
  return kind === 'rental' ? 'Closed leases by month' : 'Closed sales by month'
}

export function statsClosePriceLabel(kind: StatsKind): string {
  return kind === 'rental' ? 'Lease rent' : 'Close price'
}
