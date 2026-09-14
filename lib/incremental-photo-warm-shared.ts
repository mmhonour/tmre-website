/** Newest ids win when the queue is full — they are the ones someone will open. */
export const INCREMENTAL_PHOTO_WARM_QUEUE_CAP = 40

/** One side-work hop; leftover ids wait for the next Lane 3 run. */
export const INCREMENTAL_PHOTO_WARM_DRAIN_BATCH = 12

export function mergeIncrementalPhotoWarmQueue(
  existing: readonly string[],
  incoming: readonly string[],
  cap = INCREMENTAL_PHOTO_WARM_QUEUE_CAP,
): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of [...existing, ...incoming]) {
    const id = raw.trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  if (out.length <= cap) return out
  return out.slice(out.length - cap)
}
