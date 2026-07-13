export type SpotlightSection =
  | "overview"
  | "photos"
  | "history"
  | "comparables"
  | "comparable-rentals"
  | "uag"
  | "if";

export function spotlightSectionHref(section: SpotlightSection): string {
  if (section === "photos") return "/spotlight/photos";
  if (section === "history") return "/spotlight/history";
  if (section === "comparables") return "/spotlight/comparables";
  if (section === "comparable-rentals") return "/spotlight/comparable-rentals";
  if (section === "uag") return "/spotlight/uag";
  if (section === "if") return "/spotlight/if";
  return "/spotlight";
}

/** Canonical shareable spotlight URL (use in marketing / email). */
export const SPOTLIGHT_SHARE_URL = "/spotlight";
