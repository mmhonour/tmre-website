import type { StatsCity, StatsKind } from "./stats-towns";

export type MonthlyCount = { year: number; month: number; count: number };

export type StatsMonthApiResponse = {
  city: string;
  data: MonthlyCount[];
  fallback?: boolean;
};

const inflight = new Map<string, Promise<StatsMonthApiResponse | null>>();

function cacheKey(apiPath: string, city: StatsCity, kind: StatsKind): string {
  return `${apiPath}:${city}:${kind}`;
}

export function fetchStatsMonthData(
  apiPath: string,
  city: StatsCity,
  kind: StatsKind,
): Promise<StatsMonthApiResponse | null> {
  const key = cacheKey(apiPath, city, kind);
  const existing = inflight.get(key);
  if (existing) return existing;

  const cityParam =
    city === "All" ? "city=All" : `city=${encodeURIComponent(city)}`;
  const promise = fetch(`${apiPath}?${cityParam}&kind=${kind}`, { cache: "no-store" })
    .then((r) => (r.ok ? (r.json() as Promise<StatsMonthApiResponse>) : null))
    .catch(() => null);

  inflight.set(key, promise);
  return promise;
}

export function clearStatsMonthApiCache(): void {
  inflight.clear();
}
