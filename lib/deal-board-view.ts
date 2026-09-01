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
export type DealBoardMapLayout = "top" | "left" | "right";

export const DEAL_BOARD_MAP_LAYOUT_DEFAULT: DealBoardMapLayout = "top";

export const DEAL_BOARD_MAP_LAYOUT_VALUES: readonly DealBoardMapLayout[] = [
  "top",
  "left",
  "right",
] as const;

export const DEAL_BOARD_MAP_LAYOUT_PREF_KEY = "intel-board-map-layout-v1";

/** Spoken form, for title / aria — "Left" on its own says nothing. */
export const DEAL_BOARD_MAP_LAYOUT_LABELS: Record<DealBoardMapLayout, string> = {
  top: "Map on top",
  left: "Map on left",
  right: "Map on right",
};

/** Button faces — the control carries one static "Map on" label for all three. */
export const DEAL_BOARD_MAP_LAYOUT_SHORT_LABELS: Record<
  DealBoardMapLayout,
  string
> = {
  top: "Top",
  left: "Left",
  right: "Right",
};

/**
 * `side` was the only beside-the-cards value before Left / Right split it, and
 * it rendered to the right of the listings. Saved prefs and already-shared
 * links still carry it, so read it as Right rather than dropping to Top.
 */
export function dealBoardMapLayoutFromStored(
  raw: string | null | undefined,
): DealBoardMapLayout {
  const value = (raw ?? "").trim().toLowerCase();
  if (value === "left") return "left";
  if (value === "right" || value === "side") return "right";
  return DEAL_BOARD_MAP_LAYOUT_DEFAULT;
}

/** Prefer Large on phones when the visitor has no saved board-view preference. */
export function dealBoardViewDefaultForViewport(): DealBoardCardView {
  if (typeof window === "undefined") return DEAL_BOARD_VIEW_DEFAULT;
  return window.matchMedia(DEAL_BOARD_VIEW_MOBILE_MQ).matches
    ? DEAL_BOARD_VIEW_MOBILE_DEFAULT
    : DEAL_BOARD_VIEW_DEFAULT;
}
