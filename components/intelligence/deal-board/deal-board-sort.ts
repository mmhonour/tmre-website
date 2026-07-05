export type DealBoardSortKey =
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

export const DEAL_BOARD_SORT_COLUMNS: {
  key: DealBoardSortKey;
  label: string;
  align?: "left" | "right";
  townOnly?: boolean;
}[] = [
  { key: "score", label: "Score" },
  { key: "beds", label: "Bed", align: "right" },
  { key: "baths", label: "Bath", align: "right" },
  { key: "town", label: "Town", townOnly: true },
  { key: "price", label: "Price", align: "right" },
  { key: "ppsf", label: "$ / sqft", align: "right" },
  { key: "sqft", label: "Sqft", align: "right" },
  { key: "dom", label: "DOM", align: "right" },
  { key: "year", label: "Year Built", align: "right" },
  { key: "status", label: "Status / Insight" },
];

export function dealBoardSortLabel(key: DealBoardSortKey): string {
  return DEAL_BOARD_SORT_COLUMNS.find((c) => c.key === key)?.label ?? key;
}
