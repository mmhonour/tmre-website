export const HOME_PULSE_SORT_KEYS = [
  "medianPrice",
  "daysOnMarket",
  "saleToList",
  "monthsSupply",
  "closedLast4WeeksVolume",
  "closedLast4Weeks",
] as const;

export type HomePulseSortKey = (typeof HOME_PULSE_SORT_KEYS)[number];
export type HomePulseSortDir = "asc" | "desc";

export function isHomePulseSortKey(value: string): value is HomePulseSortKey {
  return (HOME_PULSE_SORT_KEYS as readonly string[]).includes(value);
}

/** First click is always descending. Same label toggles direction. */
export function nextHomePulseSort(
  currentKey: HomePulseSortKey | null,
  currentDir: HomePulseSortDir,
  clicked: HomePulseSortKey,
): { key: HomePulseSortKey; dir: HomePulseSortDir } {
  if (currentKey === clicked) {
    return { key: clicked, dir: currentDir === "desc" ? "asc" : "desc" };
  }
  return { key: clicked, dir: "desc" };
}

export function compareHomePulseValues(
  a: number | null,
  b: number | null,
  dir: HomePulseSortDir,
): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  const cmp = a - b;
  return dir === "desc" ? -cmp : cmp;
}
