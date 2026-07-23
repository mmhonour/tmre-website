export type DealBoardView = "large" | "grid" | "line";

/** Desktop / SSR fallback when no stored preference. */
export const DEAL_BOARD_VIEW_DEFAULT: DealBoardView = "grid";

/** Mobile first-visit default (narrow viewport, no stored preference). */
export const DEAL_BOARD_VIEW_MOBILE_DEFAULT: DealBoardView = "large";

export const DEAL_BOARD_VIEW_MOBILE_MQ = "(max-width: 767px)";

export const DEAL_BOARD_VIEW_PREF_KEY = "intel-board-view-v2";

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

/** Prefer Large on phones when the visitor has no saved board-view preference. */
export function dealBoardViewDefaultForViewport(): DealBoardView {
  if (typeof window === "undefined") return DEAL_BOARD_VIEW_DEFAULT;
  return window.matchMedia(DEAL_BOARD_VIEW_MOBILE_MQ).matches
    ? DEAL_BOARD_VIEW_MOBILE_DEFAULT
    : DEAL_BOARD_VIEW_DEFAULT;
}
