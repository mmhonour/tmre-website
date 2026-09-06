import type { Town } from "./stats-towns";

/** Shared town accent colors for stats charts. */
export const STATS_TOWN_COLOR: Record<Town, string> = {
  Norwalk: "#38bdf8",
  Westport: "#D4AF37",
  Wilton: "#f97316",
  Fairfield: "#5ba08a",
  Weston: "#818cf8",
  "New Canaan": "#fbbf24",
  Ridgefield: "#fb7185",
};

export const STATS_TOWN_ACCENT_CLASS: Record<Town, string> = {
  Norwalk: "text-sky",
  Westport: "text-gold",
  Wilton: "text-coral",
  Fairfield: "text-sage",
  Weston: "text-indigo-400",
  "New Canaan": "text-amber-400",
  Ridgefield: "text-rose-400",
};

export const STATS_TOWN_BORDER_CLASS: Record<Town, string> = {
  Norwalk: "border-sky/30",
  Westport: "border-gold/30",
  Wilton: "border-coral/30",
  Fairfield: "border-sage/30",
  Weston: "border-indigo-400/30",
  "New Canaan": "border-amber-400/30",
  Ridgefield: "border-rose-400/30",
};
