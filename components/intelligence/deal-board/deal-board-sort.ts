import { normalizeTownName } from "@/lib/tmre-towns";

export type DealBoardSortKey =
  | "looked"
  | "score"
  | "beds"
  | "baths"
  | "town"
  | "price"
  | "ppsf"
  | "sqft"
  | "dom"
  | "year"
  | "status";

export type DealBoardSortDir = "asc" | "desc";

export const DEAL_BOARD_SORT_KEYS: readonly DealBoardSortKey[] = [
  "looked",
  "score",
  "beds",
  "baths",
  "town",
  "price",
  "ppsf",
  "sqft",
  "dom",
  "year",
  "status",
] as const;

export const DEAL_BOARD_SORT_DIRS: readonly DealBoardSortDir[] = [
  "asc",
  "desc",
] as const;

const STATUS_SORT_ORDER: Record<string, number> = {
  New: 0,
  Reduced: 1,
  Increased: 2,
  Active: 3,
  Pending: 4,
  "Coming Soon": 5,
  "Back on Market": 6,
};

export type DealBoardSortable = {
  key: string;
  score: number;
  city?: string | null;
  beds?: number | null;
  baths?: number | null;
  price: number;
  pricePerSqft: number | null;
  sqft: number | null;
  dom: number | null;
  yearBuilt?: number | null;
  status: string;
};

function compareNullable(
  a: number | null,
  b: number | null,
  dir: DealBoardSortDir,
): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return dir === "asc" ? a - b : b - a;
}

export function sortDealBoardListings<T extends DealBoardSortable>(
  rows: readonly T[],
  sortKey: DealBoardSortKey,
  sortDir: DealBoardSortDir,
): T[] {
  const sorted = [...rows];
  sorted.sort((a, b) => {
    let cmp = 0;
    switch (sortKey) {
      case "looked":
        // Lookey supplies viewedAt order; keep input order here.
        return 0;
      case "score":
        cmp = a.score - b.score;
        break;
      case "town": {
        const townName = (l: DealBoardSortable) =>
          (l.city ? normalizeTownName(l.city) : "") ?? "";
        cmp = townName(a).localeCompare(townName(b), undefined, {
          sensitivity: "base",
        });
        break;
      }
      case "beds":
        return compareNullable(a.beds ?? null, b.beds ?? null, sortDir);
      case "baths":
        return compareNullable(a.baths ?? null, b.baths ?? null, sortDir);
      case "price":
        cmp = a.price - b.price;
        break;
      case "ppsf":
        return compareNullable(a.pricePerSqft, b.pricePerSqft, sortDir);
      case "sqft":
        return compareNullable(a.sqft, b.sqft, sortDir);
      case "dom":
        return compareNullable(a.dom, b.dom, sortDir);
      case "year":
        return compareNullable(a.yearBuilt ?? null, b.yearBuilt ?? null, sortDir);
      case "status":
        cmp =
          (STATUS_SORT_ORDER[a.status] ?? 99) -
          (STATUS_SORT_ORDER[b.status] ?? 99);
        break;
    }
    return sortDir === "asc" ? cmp : -cmp;
  });
  return sorted;
}

export const DEAL_BOARD_SORT_COLUMNS: {
  key: DealBoardSortKey;
  label: string;
  align?: "left" | "right";
  townOnly?: boolean;
  lookeyOnly?: boolean;
}[] = [
  { key: "looked", label: "Last looked", lookeyOnly: true },
  { key: "score", label: "Score" },
  { key: "price", label: "Price", align: "right" },
  { key: "ppsf", label: "$ / sqft", align: "right" },
  { key: "beds", label: "Bed", align: "right" },
  { key: "baths", label: "Bath", align: "right" },
  { key: "dom", label: "DOM", align: "right" },
  { key: "year", label: "Year Built", align: "right" },
  { key: "town", label: "Town", townOnly: true },
  { key: "sqft", label: "Sqft", align: "right" },
  { key: "status", label: "Status / Insight" },
];

export function dealBoardSortLabel(key: DealBoardSortKey): string {
  return DEAL_BOARD_SORT_COLUMNS.find((c) => c.key === key)?.label ?? key;
}
