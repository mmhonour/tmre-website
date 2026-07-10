import { readClientPref, writeClientPref } from "@/lib/client-prefs";

export function readPersistedYears(
  key: string,
  validYears: readonly number[],
  fallback: readonly number[],
): number[] {
  const raw = readClientPref(key);
  if (!raw) return [...fallback];
  const valid = new Set(validYears);
  const parsed = raw
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((year) => Number.isInteger(year) && valid.has(year));
  return parsed.length > 0 ? parsed : [...fallback];
}

export function writePersistedYears(key: string, years: Iterable<number>): void {
  writeClientPref(key, [...years].join(","));
}

export function readPersistedTimelineMode(
  key: string,
): "calendar" | "continuous" | null {
  const stored = readClientPref(key);
  if (stored === "calendar" || stored === "continuous") return stored;
  return null;
}

export function writePersistedTimelineMode(
  key: string,
  mode: "calendar" | "continuous",
): void {
  writeClientPref(key, mode);
}
