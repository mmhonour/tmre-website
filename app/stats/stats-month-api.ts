import { loadTabJson, prefetchTabJson } from "@/lib/tab-data-prefetch";
import type { StatsCity, StatsKind } from "./stats-towns";

export type MonthlyCount = { year: number; month: number; count: number };

export type StatsMonthApiResponse = {
  city: string;
  data: MonthlyCount[];
  fallback?: boolean;
};

function monthApiUrl(apiPath: string, city: StatsCity, kind: StatsKind): string {
  const cityParam =
    city === "All" ? "city=All" : `city=${encodeURIComponent(city)}`;
  return `${apiPath}?${cityParam}&kind=${kind}`;
}

export function prefetchStatsMonthData(
  apiPath: string,
  city: StatsCity,
  kind: StatsKind,
): void {
  prefetchTabJson(monthApiUrl(apiPath, city, kind));
}

export function fetchStatsMonthData(
  apiPath: string,
  city: StatsCity,
  kind: StatsKind,
): Promise<StatsMonthApiResponse | null> {
  return loadTabJson<StatsMonthApiResponse>(monthApiUrl(apiPath, city, kind));
}

/** @deprecated Cache is now the shared tab-json prefetch map. */
export function clearStatsMonthApiCache(): void {
  // no-op — kept for call-site compat
}
