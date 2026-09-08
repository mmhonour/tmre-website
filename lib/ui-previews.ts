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
    slug: "home-pulse-label-sort",
    title: "Home pulse label sort",
    summary:
      "Click Median price, DOM, and the other card labels to sort towns. Volume closed opens the Stats chart on Volume.",
  },
];

export function uiPreviewHref(slug: string): string {
  return `/preview/${slug}`;
}
