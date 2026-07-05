export type DealBoardView = "large" | "grid" | "line";

export const DEAL_BOARD_VIEW_DEFAULT: DealBoardView = "grid";

export const DEAL_BOARD_VIEW_PREF_KEY = "intel-board-view";

export const DEAL_BOARD_VIEW_VALUES: readonly DealBoardView[] = [
  "large",
  "grid",
  "line",
] as const;

export const DEAL_BOARD_VIEW_LABELS: Record<DealBoardView, string> = {
  large: "Large",
  grid: "Grid",
  line: "Line",
};
