/**
 * Intelligence deal-board score tiers + middle-tier collapse rules.
 * Used by `/intelligence` and documented in Admin → Data controls → Deal board.
 */

/** Top / bottom band size when sorting by score (desc). Middle is the remainder (~60%). */
export const BOARD_SCORE_TIER_FRACTION = 0.2;

/**
 * Collapsed board never shows fewer than this many rows on the current page.
 * Middle rows are only hideable down to this floor.
 */
export const BOARD_MIN_VISIBLE = 10;

/** Page size for the deal board (tiers apply per page, not the full filtered set). */
export const BOARD_LISTING_LIMIT = 100;

/** Map view groups — keep pins readable. */
export const BOARD_MAP_LISTING_LIMIT = 20;

export type BoardScoreTiers<T> = {
  top: T[];
  middle: T[];
  bottom: T[];
  canTier: boolean;
};

export type BoardMiddleCollapsePlan<T> = {
  top: T[];
  /** Middle rows that stay visible even when collapsed (to hit the min). */
  middlePinned: T[];
  /** Middle rows the toggle may hide. */
  middleCollapsible: T[];
  bottom: T[];
  canCollapse: boolean;
  hideableCount: number;
};

type ScoreRow = { score: number };

/** Split listings into top 20%, middle 60%, and bottom 20% by Goldilocks score. */
export function splitBoardByScoreTier<T extends ScoreRow>(
  listings: T[],
): BoardScoreTiers<T> {
  const n = listings.length;
  if (n === 0) return { top: [], middle: [], bottom: [], canTier: false };

  const byScore = [...listings].sort((a, b) => b.score - a.score);
  const topCount = Math.max(1, Math.round(n * BOARD_SCORE_TIER_FRACTION));
  const bottomCount = Math.max(1, Math.round(n * BOARD_SCORE_TIER_FRACTION));
  const topEnd = topCount;
  const bottomStart = n - bottomCount;

  if (bottomStart <= topEnd) {
    return { top: byScore, middle: [], bottom: [], canTier: false };
  }

  return {
    top: byScore.slice(0, topEnd),
    middle: byScore.slice(topEnd, bottomStart),
    bottom: byScore.slice(bottomStart),
    canTier: true,
  };
}

/**
 * Middle tier may hide at most `total − BOARD_MIN_VISIBLE` listings so the
 * collapsed board never dips below 10 (or the full set when smaller).
 */
export function planMiddleTierCollapse<T>(
  tiers: BoardScoreTiers<T>,
): BoardMiddleCollapsePlan<T> {
  const { top, middle, bottom, canTier } = tiers;
  const total = top.length + middle.length + bottom.length;
  const maxHide = Math.max(0, total - BOARD_MIN_VISIBLE);
  const hideableCount = canTier ? Math.min(middle.length, maxHide) : 0;
  const pinCount = middle.length - hideableCount;
  return {
    top,
    middlePinned: middle.slice(0, pinCount),
    middleCollapsible: middle.slice(pinCount),
    bottom,
    canCollapse: hideableCount > 0,
    hideableCount,
  };
}

/**
 * Gate for showing the middle-tier collapse UI. Must match
 * `boardTiers` in IntelligenceClient.
 */
export function intelligenceMiddleTierEligible(options: {
  sortKey: string;
  sortDir: "asc" | "desc";
  vintageFilterActive: boolean;
}): boolean {
  return (
    options.sortKey === "score" &&
    options.sortDir === "desc" &&
    !options.vintageFilterActive
  );
}
