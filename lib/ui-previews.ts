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
      "Admin landlord / owner aggregation: same name on warranty or quitclaim history, or the same mailbox. Find (admin) links here.",
  },
  {
    slug: "open-houses-town-day",
    title: "Open houses by town and day",
    summary:
      "Town +/− with a unique-home count for the Monday–Sunday week. Cards list every open house that home has this week.",
  },
  {
    slug: "open-houses-town-order",
    title: "Open houses — collapsed towns + order",
    summary:
      "Towns start collapsed. Close all towns / Expand all towns. Drag ⋮⋮ to set a preferred order, stored in tmre_oh_town_order.",
  },
  {
    slug: "open-houses-filter-bar",
    title: "Open houses — hero pills + sticky bar",
    summary:
      "Sale / rental and towns start in the navy hero and dock into the cream bar on scroll. Most / First are exclusive on their own line. Alerts left, view glyphs right.",
  },
  {
    slug: "open-houses-focus",
    title: "Open houses — most / first showing",
    summary:
      "Most open houses and First showing are mutually exclusive (top 3 historical hosts per town vs zero past).",
  },
  {
    slug: "open-houses-forward",
    title: "Open houses — remaining week + load error",
    summary:
      "Page lists today-through-Sunday only. A series that ended yesterday is out. Load failure is not an empty week.",
  },
  {
    slug: "listing-open-house-history",
    title: "Listing — open houses after History",
    summary:
      "Stored public open houses for this property sit under the MLS timeline. Upcoming vs held is stamped by the history API.",
  },
  {
    slug: "open-house-alerts",
    title: "Open house + listing alerts",
    summary:
      "Open Houses signup is titled for showings (optional new listings). Latest can add open-house notify when a matching home first schedules a showing.",
  },
  {
    slug: "open-houses-next-oh",
    title: "Open houses — next OH + alerts",
    summary:
      "Next-open mark (black on white) on grid (photo upper right), rows (panel upper right), and compact (right-aligned). Rows photo stretches to the row height. Listing alerts reuse Intelligence searches, or town + home type + price.",
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
