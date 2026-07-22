/** Sale: `$465/sqft`; rental: `$2.10/sqft`. */
export function formatInsightMedianPpsf(
  value: number,
  rental: boolean,
): string {
  if (rental) return `$${value.toFixed(2)}/sqft`
  return `$${Math.round(value).toLocaleString('en-US')}/sqft`
}

export type MedianPpsfBand = 'below' | 'at' | 'above'

export function medianPpsfBand(
  pricePerSqft: number,
  cityMedianPpsf: number,
): MedianPpsfBand {
  const diff = (pricePerSqft - cityMedianPpsf) / cityMedianPpsf
  if (diff < -0.05) return 'below'
  if (diff > 0.05) return 'above'
  return 'at'
}
