import {
  isCoastalStripIndex,
  type CoastalStripIndex,
} from '@/lib/location-estimate-zip-grid-shared'

/**
 * Hand-set What-if strips when the painted cell and the agreed house
 * assignment disagree (click-cycle can land Coast on a 2nd-strip house).
 */
export const LISTING_COASTAL_STRIP_OVERRIDES: Record<string, CoastalStripIndex> =
  {
    '24186969': 1,
  }

export function resolveListingCoastalStrip(
  mlsId: string | null | undefined,
  painted: CoastalStripIndex | null | undefined,
): CoastalStripIndex | null {
  const id = mlsId?.trim()
  if (id) {
    const override = LISTING_COASTAL_STRIP_OVERRIDES[id]
    if (isCoastalStripIndex(override)) return override
  }
  return isCoastalStripIndex(painted) ? painted : null
}
