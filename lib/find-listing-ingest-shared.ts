/** Town RETS / listings queries use — Vision town first, then city, then Westport. */
export function listingIngestTown(
  vision:
    | { town?: string | null; city?: string | null }
    | string
    | null
    | undefined,
): string {
  if (typeof vision === 'string') return vision.trim() || 'Westport'
  return vision?.town?.trim() || vision?.city?.trim() || 'Westport'
}
