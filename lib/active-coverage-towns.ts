/**
 * Shared helpers for the public coverage set — towns marked Active in
 * Admin → Data controls → CT coverage.
 *
 * Compile-time `TMRE_TOWNS` is the fallback and the zip/MLS-code universe.
 * Runtime lists come from Postgres via `getActiveCoverageTownsFresh`.
 */

import {
  formatTownList,
  isTmreTown,
  TMRE_TOWNS,
  type TmreTown,
} from '@/lib/tmre-towns'

export const FALLBACK_COVERAGE_TOWNS: readonly TmreTown[] = TMRE_TOWNS

/** Known towns first (stable TMRE order), then any extra activations A–Z. */
export function orderCoverageTowns(names: readonly string[]): string[] {
  const wanted = new Set(names.map((n) => n.trim()).filter(Boolean))
  const wantedLower = new Set([...wanted].map((n) => n.toLowerCase()))
  const known = TMRE_TOWNS.filter((town) => wantedLower.has(town.toLowerCase()))
  const extra = [...wanted]
    .filter((name) => !isTmreTown(name))
    .sort((a, b) => a.localeCompare(b))
  return [...known, ...extra]
}

/** Active towns that already have zip / MLS-code support. */
export function knownCoverageTowns(
  names: readonly string[],
): TmreTown[] {
  return orderCoverageTowns(names).filter(isTmreTown)
}

export function coverageTownsLabel(names: readonly string[]): string {
  return formatTownList(orderCoverageTowns(names))
}
