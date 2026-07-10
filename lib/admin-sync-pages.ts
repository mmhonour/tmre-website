import type { AdminSyncPanelRowId } from "@/lib/admin-sync-schedule-format";

export type AdminSyncImpactedPage = {
  label: string;
  href: string;
};

/** User-facing routes whose data depends on each admin sync row. */
export const ADMIN_SYNC_IMPACTED_PAGES: Record<AdminSyncPanelRowId, AdminSyncImpactedPage[]> = {
  "full-resync": [
    { label: "Intelligence", href: "/intelligence" },
    { label: "Latest", href: "/latest" },
    { label: "New construction", href: "/new-construction" },
    { label: "Find", href: "/find" },
    { label: "Listings", href: "/intelligence/listings" },
  ],
  incremental: [
    { label: "Intelligence", href: "/intelligence" },
    { label: "Latest", href: "/latest" },
    { label: "New construction", href: "/new-construction" },
    { label: "Find", href: "/find" },
    { label: "Listings", href: "/intelligence/listings" },
  ],
  "latest-mls": [
    { label: "Intelligence", href: "/intelligence" },
    { label: "Latest", href: "/latest" },
    { label: "New construction", href: "/new-construction" },
    { label: "Find", href: "/find" },
  ],
  "listing-scores": [
    { label: "Intelligence", href: "/intelligence" },
    { label: "Latest", href: "/latest" },
    { label: "Deal of the Day", href: "/deal-of-the-day" },
    { label: "Listing score", href: "/score" },
  ],
  "refresh-finished": [
    { label: "Intelligence", href: "/intelligence" },
    { label: "Latest", href: "/latest" },
    { label: "New construction", href: "/new-construction" },
    { label: "Find", href: "/find" },
    { label: "Home", href: "/" },
  ],
  "stats-cache": [{ label: "Stats", href: "/stats" }],
  "deal-of-the-day": [
    { label: "Home", href: "/" },
    { label: "Intelligence", href: "/intelligence" },
    { label: "Deal of the Day", href: "/deal-of-the-day" },
  ],
  "property-addresses": [{ label: "List with me", href: "/list-with-me" }],
};

export function adminSyncImpactedPages(rowId: string): AdminSyncImpactedPage[] {
  if (rowId in ADMIN_SYNC_IMPACTED_PAGES) {
    return ADMIN_SYNC_IMPACTED_PAGES[rowId as AdminSyncPanelRowId];
  }
  return [];
}
