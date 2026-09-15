export type UiPreviewEntry = {
  slug: string;
  title: string;
  summary: string;
};

/** Noindex UI sandboxes. Add a row when you add `/preview/<slug>`. */
export const UI_PREVIEWS: readonly UiPreviewEntry[] = [
  {
    slug: "listing-map-town-pin",
    title: "Listing map — town pin",
    summary:
      "When the MLS pin sits outside the listing’s town, the map uses a Census geocode of street + city + state + zip. Stored MLS lat/lon is not overwritten.",
  },
  {
    slug: "listing-showcase-nav",
    title: "Listing clicks → showcase",
    summary:
      "Latest thumbs and old /photos /history /comps tab paths open the full-bleed showcase, not classic chrome.",
  },
  {
    slug: "find-parcel-map",
    title: "VGSI neighborhood map",
    summary:
      "Find / VGSI map chips on the upper right. Quiet streets (no parking / cemetery icons). Reset fills the town outline.",
  },
  {
    slug: "admin-sync-sort",
    title: "Admin sync column sort",
    summary:
      "Click a heading to sort (including Order). Edits in the row stay put until the next heading click.",
  },
  {
    slug: "listing-vision-address",
    title: "Listing address → Vision card",
    summary:
      "Admin-only: click the street to the VGSI / Find parcel page. Locked visitors see plain text.",
  },
  {
    slug: "listing-admin-mobile",
    title: "Listing Admin on mobile",
    summary:
      "Admin tab scrolls to the contacting-agent / Vision block under the map. No desktop deck on a phone.",
  },
  {
    slug: "listing-card-photo",
    title: "Listing card photos — mid vs full",
    summary:
      "Grid / Large / Line boxes for MLS 24201214. Left is MediaMidsizeURL (?size=mid), right is the old full smash-down.",
  },
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
      "Admin landlord / owner aggregation. Date and Amount sort purchases. Each panel is an invisible grid: address left, dates and amounts right-aligned.",
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
      "Sale / rental and towns start in the navy hero and dock into the cream bar on scroll. One row: Date / By day / Price left, Open house alerts centered, Intelligence Large / Grid / Line right.",
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
      "Sunday 12:00 AM ET resets to Sunday–Saturday; Mon–Sat is remaining through Sunday. Cache still holds t+6. Load failure is not an empty week.",
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
    slug: "alert-job-health",
    title: "Alert doorbells — Incremental vs OH",
    summary:
      "Dirty from Incremental / OH, send from the Railway alerts job. One email if the visitor signed up for both.",
  },
  {
    slug: "open-houses-next-oh",
    title: "Open houses — next OH + alerts",
    summary:
      "Next-open mark (black on white) on Grid (photo upper right), Large (panel upper right), and Line (right-aligned). Large photo stretches to the row height.",
  },
  {
    slug: "find-deed-vs-prior",
    title: "Vision deed vs prior MLS ask",
    summary:
      "VGSI parcel page uses the last paid assessor sale. A Closed land ask from the year before is not the page price.",
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
      "VGSI LAST FIRST becomes First Last. A couple with one last name is First1 & First2 Last — not First Last and First. A first name alone is not a landlord key.",
  },
  {
    slug: "streets-letter-scroll",
    title: "Streets letter jump",
    summary:
      "Letter index hashes clear the fixed site header so the letter heading stays visible — not one or two streets too low.",
  },
  {
    slug: "list-with-me",
    title: "List With Me",
    summary:
      "Seller intake writes to Neon contacts, not data/contacts.json. Address autocomplete still uses the property directory.",
  },
  {
    slug: "listing-photo-focus",
    title: "Listing photo full screen",
    summary:
      "On a phone, tap the full-bleed photo or a thumbnail to see just the photo, first/previous/next/last, and the MLS caption when the agent entered one. On desktop the caption sits above play and the photo count. Close exits to the still-playing carousel unless the user hit pause. Rail and type stay hidden while it is open.",
  },
  {
    slug: "showcase-rail-pills",
    title: "Listing full-bleed rail pills",
    summary:
      "Full-bleed rail: Offered at / Closed at sits in the top-right, same band as status. Desktop: Maximize, Insight, Details, Comps above the right arrow; What if, Pulse, Map below. Phone: Maximize under Map; status and price rise and top-align, price flush to the right edge. Expanded Comps / What if use solid navy on every screen.",
  },
  {
    slug: "showcase-rail-desktop",
    title: "Showcase rail around the arrow — desktop",
    summary:
      "Desktop listing chrome: Maximize → Insight → Details → Comps above the right arrow; What if → Town pulse → Map below. Price top-right. Town pulse and Details are content-sized cards that grow top and bottom.",
  },
  {
    slug: "showcase-rail-mobile",
    title: "Showcase rail around the arrow — mobile",
    summary:
      "Phone listing chrome: Maximize under Map, status and Offered at / Closed at raised and top-aligned, price flush to the right edge. Expanded Comps / What if use solid navy. Town pulse and Details are content-sized cards that grow top and bottom. On a laptop, a 390×844 frame.",
  },
  {
    slug: "dod-town-bleed-desktop",
    title: "Deal of the Day town bleeds — desktop",
    summary:
      "Live weekly Deal of the Day picks. Bleed is a horizontal band behind the headline and town / sale / type filter only. Three carousel paints.",
  },
  {
    slug: "dod-town-bleed-mobile",
    title: "Deal of the Day town bleeds — mobile",
    summary:
      "Phone chrome: one town name, then a horizontal bleed behind the headline and pause / town / For Sale row — not the desktop town line stacked down the page. 390×844 frame on a laptop.",
  },
];

export function uiPreviewHref(slug: string): string {
  return `/preview/${slug}`;
}
