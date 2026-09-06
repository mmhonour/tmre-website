import { TOWN_LIST, type Town } from "./stats-towns";

export const STATS_TOWN_DECK_ORDER_KEY = "tmre_stats_town_deck_order";
export const STATS_TOWN_DECK_OPEN_KEY = "tmre_stats_town_deck_open";

export function parseTownDeckOrder(
  raw: string | null | undefined,
  fallback: readonly Town[] = TOWN_LIST,
): Town[] {
  const valid = new Set<Town>(TOWN_LIST);
  const seen = new Set<Town>();
  const parsed: Town[] = [];

  if (raw) {
    for (const part of raw.split(",")) {
      const name = part.trim() as Town;
      if (!valid.has(name) || seen.has(name)) continue;
      seen.add(name);
      parsed.push(name);
    }
  }

  for (const town of fallback) {
    if (seen.has(town)) continue;
    seen.add(town);
    parsed.push(town);
  }

  for (const town of TOWN_LIST) {
    if (seen.has(town)) continue;
    parsed.push(town);
  }

  return parsed;
}

export function parseTownDeckOpen(raw: string | null | undefined): Town[] {
  if (!raw) return [];
  const valid = new Set<Town>(TOWN_LIST);
  const seen = new Set<Town>();
  const parsed: Town[] = [];
  for (const part of raw.split(",")) {
    const name = part.trim() as Town;
    if (!valid.has(name) || seen.has(name)) continue;
    seen.add(name);
    parsed.push(name);
  }
  return parsed;
}

export function serializeTowns(towns: readonly Town[]): string {
  return towns.join(",");
}

export function placeTownRelativeTo(
  order: readonly Town[],
  moving: Town,
  target: Town,
  placeBefore: boolean,
): Town[] {
  if (moving === target) return [...order];
  const next = order.filter((town) => town !== moving);
  const idx = next.indexOf(target);
  if (idx < 0) return [...order];
  next.splice(placeBefore ? idx : idx + 1, 0, moving);
  return next;
}

export function toggleTownOpen(open: readonly Town[], town: Town): Town[] {
  return open.includes(town) ? open.filter((item) => item !== town) : [...open, town];
}

export function ensureTownOpen(open: readonly Town[], town: Town): Town[] {
  return open.includes(town) ? [...open] : [...open, town];
}
