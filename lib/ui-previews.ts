export type UiPreviewEntry = {
  slug: string;
  title: string;
  summary: string;
};

/** Noindex UI sandboxes. Add a row when you add `/preview/<slug>`. */
export const UI_PREVIEWS: readonly UiPreviewEntry[] = [
  {
    slug: "stats-town-deck",
    title: "Stats town snapshot deck",
    summary:
      "Open several town cards at once, scroll the rail, and drag one over another to stack them.",
  },
  {
    slug: "owner-portfolios",
    title: "Owner portfolios (2+ homes)",
    summary:
      "Admin owner aggregation: largest 2+ clusters first, optional street scope. Mailing overlap wins over a name-only duplicate.",
  },
  {
    slug: "open-houses-town-day",
    title: "Open houses by town and day",
    summary:
      "Town +/− with a unique-home count for the Monday–Sunday week. Cards list every open house that home has this week.",
  },
  {
    slug: "find-address-diverge",
    title: "Vision vs MLS address",
    summary:
      "FYI on the Find parcel page when the assessor street and the MLS street are not the same spelling.",
  },
  {
    slug: "find-stony-rets",
    title: "Find RETS hops (2A Stony Pt)",
    summary:
      "StreetNumber hops, paid-deed Closed window, and Vision↔MLS match for 2A STONY PT RD. Probe RETS is read-only.",
  },
  {
    slug: "vision-owner-first-last",
    title: "Owner First Last",
    summary:
      "VGSI LAST FIRST becomes First Last for people; LLC and trust lines stay as filed.",
  },
];

export function uiPreviewHref(slug: string): string {
  return `/preview/${slug}`;
}
