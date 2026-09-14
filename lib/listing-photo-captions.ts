/**
 * Agent-entered MLS media text for one photo — ImageOf (Kitchen, Living
 * Room) and ShortDescription, not something we invent in the browser.
 */
const CAPTION_KEYS = [
  "ShortDescription",
  "ImageOf",
  "LongDescription",
  "MediaCaption",
  "Caption",
  "Description",
] as const;

export function mediaRecordCaption(
  record: Record<string, string | undefined | null>,
): string | null {
  for (const key of CAPTION_KEYS) {
    const value = record[key]?.replace(/\s+/g, " ").trim();
    if (value) return value;
  }
  return null;
}

export function listingPhotoCaptionsFromMedia(
  records: readonly Record<string, string | undefined | null>[],
): (string | null)[] {
  return records.map(mediaRecordCaption);
}
