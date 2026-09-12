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
  {
    slug: "owner-portfolios",
    title: "Owner portfolios (2+ homes)",
    summary:
      "Admin landlord / owner aggregation: same name on warranty or quitclaim history, or the same mailbox. Find (admin) links here.",
  },
  {
    slug: "open-houses-view-glyphs",
    title: "Open houses — Large / Grid / Line",
    summary:
      "Full website Open Houses page (nav + footer). All towns open. ?view=large|grid|line. Same glyphs as Intelligence.",
  },
  {
    slug: "open-houses-one-per-town",
    title: "Open houses — one listing per town",
    summary:
      "Test cap: one fixture home in each town so /open-houses can load. Towns start collapsed.",
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
      "Towns start collapsed. Drag the town name to reorder. Fold glyphs sit to the right of the view icons.",
  },
  {
    slug: "open-houses-filter-bar",
    title: "Open houses — hero pills + sticky bar",
    summary:
      "Sale / rental and towns start in the navy hero and dock into the cream bar on scroll. Open house alerts sits right of Date / By day / Price. View glyphs match Intelligence: Large, Grid, Line.",
  },
  {
    slug: "open-houses-focus",
    title: "Open houses — most / first showing",
    summary:
      "Show by: All, Most open houses (top 3 hosts per town), or First showing (zero past).",
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
      "Open Houses signup is titled Open house alerts (optional new listings). Latest keeps listing alerts and can add open houses.",
  },
  {
    slug: "open-houses-next-oh",
    title: "Open houses — next OH + alerts",
    summary:
      "Next-open mark (black on white) on Grid (photo upper right), Large (panel upper right), and Line (right-aligned). Large photo stretches to the row height.",
  },
  {
    slug: "find-address-diverge",
    title: "Vision vs MLS address",
    summary:
      "FYI when assessor and MLS streets really differ (2A vs 2A-A). 5 LOCUST LN and 5 Locust Lane are the same street — no note.",
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
