/** Photo 0 only — enough for listing / OH alert thumbs. */
export const ALERT_LEAD_PHOTO_WARM_CAP = 25

/** Unique MLS ids, first-seen order, capped so a pull cannot stall on Media. */
export function takeAlertLeadPhotoMlsIds(
  ids: readonly string[],
  cap = ALERT_LEAD_PHOTO_WARM_CAP,
): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of ids) {
    const id = raw.trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(id)
    if (out.length >= cap) break
  }
  return out
}
