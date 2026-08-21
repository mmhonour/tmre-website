export type DealBoardView = "large" | "grid" | "line" | "map";

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
  "map",
] as const;

export const DEAL_BOARD_VIEW_LABELS: Record<DealBoardView, string> = {
  large: "Large",
  grid: "Grid",
  line: "Line",
  map: "Map",
};

/** Card-only views, for boards with no map panel (e.g. /lookey). */
export const DEAL_BOARD_CARD_VIEW_VALUES: readonly DealBoardView[] = [
  "large",
  "grid",
  "line",
] as const;

/**
 * Board view preference is shared across surfaces, so a saved "map" has to
 * degrade for the ones that cannot render a map.
 */
export function dealBoardCardView(view: DealBoardView): DealBoardView {
  return view === "map" ? "grid" : view;
}

/**
 * Where the map sits relative to the cards on desktop. Phones ignore this and
 * always run the map full-bleed with the card list hidden.
 */
export type DealBoardMapLayout = "top" | "side";

export const DEAL_BOARD_MAP_LAYOUT_DEFAULT: DealBoardMapLayout = "top";

export const DEAL_BOARD_MAP_LAYOUT_VALUES: readonly DealBoardMapLayout[] = [
  "top",
  "side",
] as const;

export const DEAL_BOARD_MAP_LAYOUT_PREF_KEY = "intel-board-map-layout-v1";

export const DEAL_BOARD_MAP_LAYOUT_LABELS: Record<DealBoardMapLayout, string> = {
  top: "Map on top",
  side: "Map beside",
};

/** Prefer Large on phones when the visitor has no saved board-view preference. */
export function dealBoardViewDefaultForViewport(): DealBoardView {
  if (typeof window === "undefined") return DEAL_BOARD_VIEW_DEFAULT;
  return window.matchMedia(DEAL_BOARD_VIEW_MOBILE_MQ).matches
    ? DEAL_BOARD_VIEW_MOBILE_DEFAULT
    : DEAL_BOARD_VIEW_DEFAULT;
}
