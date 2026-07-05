import { TMRE_TOWNS, type TmreTown } from "@/lib/tmre-towns";

/** Per-town market positioning copy on Intelligence. */
export const TOWN_MARKET_TAGLINES: Record<TmreTown, string> = {
  Norwalk: "Premium-velocity market",
  "New Canaan": "Premier Fairfield County address",
  Westport: "Trophy-tier inventory",
  Wilton: "Upscale residential enclave",
  Weston: "Quiet luxury enclave",
  Fairfield: "Balanced Fairfield County market",
  Ridgefield: "Historic charm, upscale inventory",
};

export function townMarketTagline(town: TmreTown): string {
  return TOWN_MARKET_TAGLINES[town];
}

export function allTownMarketTaglines(): { town: TmreTown; phrase: string }[] {
  return TMRE_TOWNS.map((town) => ({
    town,
    phrase: TOWN_MARKET_TAGLINES[town],
  }));
}
