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
      "Town sections, then Today / Tomorrow / weekday. Days with no showing are omitted.",
  },
  {
    slug: "find-address-diverge",
    title: "Vision vs MLS address",
    summary:
      "FYI on the Find parcel page when the assessor street and the MLS street are not the same spelling.",
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
