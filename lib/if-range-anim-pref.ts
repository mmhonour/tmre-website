import { readClientPref, writeClientPref } from "@/lib/client-prefs";

/** MLS ids that have already seen/used What if Median|Average|Weighted — skip range size anim. */
export const IF_RANGE_ANIM_SEEN_COOKIE = "tmre_if_range_anim_seen";

const MAX_SEEN_IDS = 80;

function readSeenIds(): string[] {
  const raw = readClientPref(IF_RANGE_ANIM_SEEN_COOKIE);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === "string" && id.length > 0);
  } catch {
    return raw
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
  }
}

export function hasIfRangeAnimSeen(mlsId: string): boolean {
  const id = mlsId.trim();
  if (!id) return false;
  return readSeenIds().includes(id);
}

/** Persist that this listing should no longer play the What if range size animation. */
export function markIfRangeAnimSeen(mlsId: string): void {
  const id = mlsId.trim();
  if (!id) return;
  const ids = readSeenIds().filter((x) => x !== id);
  ids.push(id);
  while (ids.length > MAX_SEEN_IDS) ids.shift();
  writeClientPref(IF_RANGE_ANIM_SEEN_COOKIE, JSON.stringify(ids));
}
