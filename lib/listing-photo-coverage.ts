/**
 * Slot-completeness for listing photos. Empty RETS object slots
 * (leading/trailing holes that never download) do not keep this false —
 * only interior gaps do. Shared by the per-listing store check and the
 * batched Closed gap-scan so both agree.
 */

export function listingPhotoIndicesAreContiguous(
  indices: readonly number[],
): boolean {
  if (indices.length === 0) return false
  for (let i = 1; i < indices.length; i++) {
    if (indices[i] !== indices[i - 1]! + 1) return false
  }
  return true
}

/**
 * True when stored indices already cover `expected` MLS slots (capped by
 * the caller). Ignores TTL — catch-up fills holes, it does not re-pull
 * complete galleries that are merely older than the warm interval.
 */
export function listingPhotosHaveRequiredSlots(
  indices: readonly number[],
  expected: number,
): boolean {
  if (indices.length <= 0) return false
  if (!listingPhotoIndicesAreContiguous(indices)) return false

  const stored = indices.length
  const min = indices[0]!
  const max = indices[indices.length - 1]!
  if (expected <= 0) return true
  if (min === 0 && stored >= expected) return true
  if (max === expected - 1 && stored === max - min + 1) return true
  if (min === 0 && max === stored - 1 && stored >= expected) return true
  return false
}
