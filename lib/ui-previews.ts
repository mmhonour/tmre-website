export type UiPreviewEntry = {
  slug: string;
  title: string;
  summary: string;
};

/** Noindex UI sandboxes. Add a row when you add `/preview/<slug>`. */
export const UI_PREVIEWS: readonly UiPreviewEntry[] = [
  {
    slug: "map-pins",
    title: "Map pins and zip perspective",
    summary:
      "Tap a pin — the thumbnail card must switch. The house sits in its Fairfield zip, not downtown.",
  },
];

export function uiPreviewHref(slug: string): string {
  return `/preview/${slug}`;
}
