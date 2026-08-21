export type DealBoardView = "large" | "grid" | "line" | "map";

/** Card layouts — mutually exclusive. Map is a separate on/off layer. */
export type DealBoardCardView = "large" | "grid" | "line";

/** Desktop / SSR fallback when no stored preference. */
export const DEAL_BOARD_VIEW_DEFAULT: DealBoardCardView = "grid";

/** Mobile first-visit default (narrow viewport, no stored preference). */
export const DEAL_BOARD_VIEW_MOBILE_DEFAULT: DealBoardCardView = "large";

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

export const DEAL_BOARD_CARD_VIEW_VALUES: readonly DealBoardCardView[] = [
  "large",
  "grid",
  "line",
] as const;

export const DEAL_BOARD_MAP_ON_PREF_KEY = "intel-board-map-on-v1";

/**
 * Board view preference is shared across surfaces, so a saved "map" has to
 * degrade for the ones that cannot render a map.
 */
export function dealBoardCardView(view: DealBoardView): DealBoardCardView {
  return view === "map" ? "grid" : view;
}

/**
 * Where the map sits relative to the cards on desktop. Phones hide the cards
 * and run the map full-bleed.
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
export function dealBoardViewDefaultForViewport(): DealBoardCardView {
  if (typeof window === "undefined") return DEAL_BOARD_VIEW_DEFAULT;
  return window.matchMedia(DEAL_BOARD_VIEW_MOBILE_MQ).matches
    ? DEAL_BOARD_VIEW_MOBILE_DEFAULT
    : DEAL_BOARD_VIEW_DEFAULT;
}
