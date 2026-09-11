export const OH_TOWN_ORDER_COOKIE = 'tmre_oh_town_order'

/** Split a stored town-order cookie into names. Empty / missing → null. */
export function parseTownOrderCookie(raw: string | null | undefined): string[] | null {
  if (raw == null) return null
  const names = raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
  return names.length > 0 ? names : null
}

export function serializeTownOrderCookie(towns: readonly string[]): string {
  return towns.join(',')
}

/**
 * Apply a preferred order onto the live town list. Unknown names drop;
 * towns not in the preference append in their current order.
 */
export function mergeTownOrder(
  preferred: readonly string[] | null | undefined,
  towns: readonly string[],
): string[] {
  if (!preferred?.length) return [...towns]
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of preferred) {
    const match = towns.find((town) => town.toLowerCase() === raw.toLowerCase())
    if (!match || seen.has(match.toLowerCase())) continue
    seen.add(match.toLowerCase())
    out.push(match)
  }
  for (const town of towns) {
    if (!seen.has(town.toLowerCase())) out.push(town)
  }
  return out
}

export function placeTownNextTo(
  order: readonly string[],
  town: string,
  neighbor: string,
  side: 'before' | 'after',
): string[] {
  if (town === neighbor) return [...order]
  const next = order.filter((name) => name !== town)
  const index = next.indexOf(neighbor)
  if (index < 0) return [...order]
  next.splice(side === 'before' ? index : index + 1, 0, town)
  return next
}

export function moveTownInOrder(
  order: readonly string[],
  town: string,
  direction: -1 | 1,
): string[] {
  const index = order.indexOf(town)
  if (index < 0) return [...order]
  const neighbor = order[index + direction]
  if (!neighbor) return [...order]
  return placeTownNextTo(order, town, neighbor, direction < 0 ? 'before' : 'after')
}
