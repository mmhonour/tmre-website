export type IntelligenceSnapshotFilters = {
  tx: string;
  cls: string;
  saleProperty: string;
  zip: string | null;
  boardStatusFilter: string;
  minBedrooms: number;
  maxBedrooms: number;
  minBathrooms: number;
  maxBathrooms: number;
  minVintage: number;
  maxVintage: number;
  minSqft: number;
  maxSqft: number | null;
  exactBeds: boolean;
  newConstructionFilter: string;
  furnishedFilter: string;
  /** Under-contract rows are dropped from the pool unless this is on. */
  underContract: boolean;
  minPrice: number;
  maxPrice: number | null;
};

let listingsGeneration = 0;
const cache = new Map<string, unknown>();

function filtersKey(filters: IntelligenceSnapshotFilters): string {
  return [
    filters.tx,
    filters.cls,
    filters.saleProperty,
    filters.zip ?? "",
    filters.boardStatusFilter,
    filters.minBedrooms,
    filters.maxBedrooms,
    filters.minBathrooms,
    filters.maxBathrooms,
    filters.minVintage,
    filters.maxVintage,
    filters.minSqft,
    filters.maxSqft ?? "",
    filters.exactBeds ? "1" : "0",
    filters.newConstructionFilter,
    filters.furnishedFilter,
    filters.underContract ? "1" : "0",
    filters.minPrice,
    filters.maxPrice ?? "",
  ].join("|");
}

/** Invalidate cached snapshots when underlying listing data is refreshed. */
export function bumpIntelligenceSnapshotGeneration(): void {
  listingsGeneration += 1;
  cache.clear();
}

export function intelligenceSnapshotTownKey(
  town: string,
  filters: IntelligenceSnapshotFilters,
): string {
  return `${listingsGeneration}:${town}:${filtersKey(filters)}`;
}

export function intelligenceSnapshotBenchmarksKey(
  filters: IntelligenceSnapshotFilters,
): string {
  return `${listingsGeneration}:benchmarks:${filtersKey(filters)}`;
}

export function getOrSetIntelligenceSnapshotCache<T>(
  key: string,
  compute: () => T,
): T {
  if (cache.has(key)) return cache.get(key) as T;
  const value = compute();
  cache.set(key, value);
  return value;
}
