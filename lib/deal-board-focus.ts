/** Session + hash helpers so returning to Intelligence lands on the same listing. */

export const DEAL_BOARD_FOCUS_STORAGE_KEY = "tmre_intel_deal_focus";

export type DealBoardFocusState = {
  mlsId: string;
  boardPage: number;
  middleExpanded: boolean;
};

/** Stable DOM id / URL hash fragment for a deal-board row. */
export function dealBoardRowDomId(mlsId: string): string {
  const safe = mlsId.trim().replace(/[^A-Za-z0-9_-]/g, "_");
  return `deal-${safe}`;
}

export function dealBoardReturnPath(mlsId: string): string {
  return `/intelligence#${dealBoardRowDomId(mlsId)}`;
}

export function parseDealBoardFocusHash(hash: string): string | null {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!raw.startsWith("deal-")) return null;
  const id = raw.slice("deal-".length).trim();
  return id || null;
}

/** Map a sanitized hash id back to a listing key when possible. */
export function matchListingKeyFromFocusId(
  focusId: string,
  keys: Iterable<string>,
): string | null {
  const needle = focusId.trim();
  if (!needle) return null;
  for (const key of keys) {
    if (key === needle) return key;
    if (dealBoardRowDomId(key) === `deal-${needle}`) return key;
    if (dealBoardRowDomId(key).slice("deal-".length) === needle) return key;
  }
  return null;
}

export function rememberDealBoardFocus(state: DealBoardFocusState): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(DEAL_BOARD_FOCUS_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore quota / private mode
  }
}

export function peekDealBoardFocus(): DealBoardFocusState | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(DEAL_BOARD_FOCUS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DealBoardFocusState>;
    if (typeof parsed.mlsId !== "string" || !parsed.mlsId.trim()) return null;
    return {
      mlsId: parsed.mlsId.trim(),
      boardPage:
        typeof parsed.boardPage === "number" && parsed.boardPage >= 1
          ? Math.floor(parsed.boardPage)
          : 1,
      middleExpanded: Boolean(parsed.middleExpanded),
    };
  } catch {
    return null;
  }
}

export function clearDealBoardFocus(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(DEAL_BOARD_FOCUS_STORAGE_KEY);
  } catch {
    // ignore
  }
}

/** Stamp #deal-… on the current Intelligence URL so browser Back keeps the target. */
export function stampDealBoardHash(mlsId: string): void {
  if (typeof window === "undefined") return;
  const id = dealBoardRowDomId(mlsId);
  const next = `#${id}`;
  if (window.location.hash === next) return;
  const url = `${window.location.pathname}${window.location.search}${next}`;
  window.history.replaceState(window.history.state, "", url);
}
