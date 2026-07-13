export type AdminTabId = "db" | "server" | "docs" | "site" | "rets";

export type AdminSectionLink = {
  id: string;
  label: string;
  tab: AdminTabId;
};

export type AdminDocLink = {
  label: string;
  href: string;
  description: string;
  external?: boolean;
};

export type AdminServerEntry = {
  label: string;
  detail: string;
  href?: string;
  schedule?: string;
};

export const ADMIN_TABS: { id: AdminTabId; label: string; subtitle: string }[] = [
  {
    id: "db",
    label: "Database",
    subtitle: "SQLite sync, schemas, and refresh locks",
  },
  {
    id: "rets",
    label: "RETS",
    subtitle: "SmartMLS credentials and connection health",
  },
  {
    id: "server",
    label: "Web server",
    subtitle: "Startup schedule, Netlify functions, and API routes",
  },
  {
    id: "docs",
    label: "Product docs",
    subtitle: "Live pages and repository reference files",
  },
  {
    id: "site",
    label: "Site controls",
    subtitle: "Spotlight properties and privacy overrides",
  },
];

export const ADMIN_SECTION_LINKS: AdminSectionLink[] = [
  { id: "admin-rets-credentials", label: "RETS credentials", tab: "rets" },
  { id: "admin-sync", label: "Sync status", tab: "db" },
  { id: "admin-refresh-lock", label: "Refresh lock", tab: "db" },
  { id: "admin-town-counts", label: "Listings by town", tab: "db" },
  { id: "admin-sqlite-schemas", label: "Database schemas", tab: "db" },
  { id: "admin-db-tuning", label: "DB write tuning", tab: "db" },
  { id: "admin-sync-log", label: "Sync run log", tab: "db" },
  { id: "admin-startup", label: "Startup schedule", tab: "server" },
  { id: "admin-netlify", label: "Netlify functions", tab: "server" },
  { id: "admin-api-routes", label: "API routes", tab: "server" },
  { id: "admin-product-pages", label: "Product pages", tab: "docs" },
  { id: "admin-repo-docs", label: "Repository docs", tab: "docs" },
  { id: "admin-spotlight", label: "Spotlight privacy", tab: "site" },
  { id: "admin-spotlight-pages", label: "Spotlight pages", tab: "site" },
];

export const ADMIN_PRODUCT_PAGES: AdminDocLink[] = [
  { label: "Home", href: "/", description: "Deal of the Day hero and intelligence tools grid" },
  {
    label: "Intelligence",
    href: "/intelligence",
    description: "Deal board, town stats, and listing discovery",
  },
  { label: "Latest", href: "/latest", description: "New and reduced listings feed with town map" },
  { label: "Stats", href: "/stats", description: "Sales, pricing, DOM, and vintage market charts" },
  {
    label: "Spotlight",
    href: "/spotlight",
    description: "Featured properties (tabs 1–3) with privacy controls",
  },
  {
    label: "Deal of the Day",
    href: "/deal-of-the-day",
    description: "Daily curated pick per town and property kind",
  },
  {
    label: "Find",
    href: "/find",
    description: "Address and MLS search across TMRE towns",
  },
  {
    label: "List with me",
    href: "/list-with-me",
    description: "Seller intake with property-address autocomplete",
  },
  {
    label: "New construction",
    href: "/new-construction",
    description: "Builder supply and new-build inventory",
  },
  {
    label: "Visitors",
    href: "/visitors",
    description: "Visitor log and town interest",
  },
  {
    label: "Listing detail",
    href: "/listings/24152517",
    description: "Example property page (overview, photos, comps, if)",
  },
];

export type AdminRepoDoc = {
  label: string;
  path: string;
  description: string;
};

export const ADMIN_REPO_DOCS: AdminRepoDoc[] = [
  {
    label: "AGENTS.md",
    path: "AGENTS.md",
    description: "Agent rules, startup/sync notes, and admin diagram policy",
  },
  {
    label: "spotlight-listing.ts",
    path: "lib/spotlight-listing.ts",
    description: "Spotlight property configs (tabs 1–3 addresses and MLS ids)",
  },
  {
    label: "startup-process.ts",
    path: "lib/startup-process.ts",
    description: "Mirrors instrumentation.ts startup lanes for /admin",
  },
  {
    label: "sqlite-schema-diagram.ts",
    path: "lib/sqlite-schema-diagram.ts",
    description: "Live listing-photos SQLite schema diagram source",
  },
];

export const ADMIN_NETLIFY_FUNCTIONS: AdminServerEntry[] = [
  {
    label: "sync-listings",
    detail: "Incremental MLS → SQLite (modified-since RETS pull)",
    schedule: "Every 30 min",
  },
  {
    label: "sync-listings-full",
    detail: "Full town reload, scores, superlatives, and product caches",
    schedule: "Weekly Mon ~5am ET",
  },
  {
    label: "sync-property-addresses",
    detail: "MLS + assessor address directory for List With Me",
    schedule: "Weekly Mon ~1am ET",
  },
  {
    label: "sync-listing-edge-scores",
    detail: "Comparable edge-score warm pass",
    schedule: "On demand / scheduled",
  },
];

export const ADMIN_API_ROUTE_GROUPS: { title: string; routes: AdminServerEntry[] }[] = [
  {
    title: "Listings & search",
    routes: [
      { label: "GET /api/listings", detail: "Active board inventory by town", href: "/api/listings?city=Westport" },
      { label: "GET /api/listings/find", detail: "Address / MLS text search", href: "/api/listings/find?q=treadwell" },
      { label: "GET /api/addresses/search", detail: "Property directory autocomplete", href: "/api/addresses/search?q=kings" },
      { label: "GET /api/addresses/resolve", detail: "Single address → MLS id (persists)", href: "/api/addresses/resolve?q=87+Kings+Highway+South,+Westport" },
      { label: "GET /api/listings/[mlsId]", detail: "Listing detail payload", href: "/api/listings/24152517" },
    ],
  },
  {
    title: "Intelligence & product caches",
    routes: [
      { label: "GET /api/intelligence/deal-board", detail: "Deal board rows + headlines", href: "/api/intelligence/deal-board" },
      { label: "GET /api/deal-of-the-day", detail: "DOTD carousel picks", href: "/api/deal-of-the-day" },
      { label: "GET /api/spotlight", detail: "Spotlight listing + score", href: "/api/spotlight" },
      { label: "GET /api/latest/listings", detail: "Latest feed rows", href: "/api/listings/latest" },
      { label: "GET /api/stats/page", detail: "Stats page bundle", href: "/api/stats/page" },
    ],
  },
  {
    title: "Admin & sync",
    routes: [
      { label: "GET /api/admin/rets-credentials", detail: "RETS credentials + optional probe", href: "/api/admin/rets-credentials" },
      { label: "POST /api/admin/rets-credentials", detail: "Save RETS credentials and probe login" },
      { label: "GET /api/admin/sync", detail: "Trigger sync actions", href: "/api/admin/sync" },
      { label: "GET /api/admin/spotlight-privacy", detail: "Spotlight privacy overrides", href: "/api/admin/spotlight-privacy" },
      { label: "POST /api/sync/listings/incremental", detail: "Manual incremental sync hook", href: "/api/sync/listings/incremental" },
    ],
  },
];

export function adminTabForSection(sectionId: string): AdminTabId | null {
  return ADMIN_SECTION_LINKS.find((link) => link.id === sectionId)?.tab ?? null;
}

export function adminSectionHref(sectionId: string, tab: AdminTabId): string {
  return `/admin?tab=${tab}#${sectionId}`;
}
