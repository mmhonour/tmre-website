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
    slug: "open-houses-town-day",
    title: "Open houses by town and day",
    summary:
      "Town sections, then Today / Tomorrow / weekday. Days with no showing are omitted.",
  },
];

export function uiPreviewHref(slug: string): string {
  return `/preview/${slug}`;
}
