export type AdminTabId =
  | "db"
  | "postgres"
  | "stats"
  | "data-controls"
  | "cookies"
  | "architecture"
  | "syncs"
  | "server"
  | "glossary";

/** Sub-panels under Admin → Data Controls. */
export type AdminDataControlsPanelId =
  | "site"
  | "spotlight"
  | "goldilocks"
  | "pricing"
  | "vintages"
  | "rets"
  | "intel-inventory";

/** Sub-panels under Admin → Syncs. */
export type AdminSyncsPanelId = "configure" | "history" | "overview";

/** Sub-panels under Admin → Database. */
export type AdminDatabasePanelId =
  | "rets-connection"
  | "inventory"
  | "town-counts"
  | "db-tuning";

/** Sub-panels under Admin → Architecture. */
export type AdminArchitecturePanelId = "map" | "docs";

export type AdminSectionLink = {
  id: string;
  label: string;
  tab: AdminTabId;
  /** Sub-panel when the tab has nested panels (Syncs / Database / Data controls / Architecture). */
  panel?:
    | AdminSyncsPanelId
    | AdminDataControlsPanelId
    | AdminDatabasePanelId
    | AdminArchitecturePanelId;
};

/** Former top-level tabs now nested under Data Controls. */
export const LEGACY_ADMIN_TAB_TO_DATA_CONTROLS: Record<
  string,
  AdminDataControlsPanelId
> = {
  site: "site",
  spotlight: "spotlight",
  goldilocks: "goldilocks",
  pricing: "pricing",
  rets: "rets",
};

/**
 * Former Database sync panels (and sync-log top-level) → Syncs sub-panel.
 * Also maps old `?tab=db&panel=sync|sync-history` via normalize in the layout.
 */
export const LEGACY_ADMIN_PANEL_TO_SYNCS: Record<string, AdminSyncsPanelId> = {
  sync: "configure",
  "sync-history": "history",
  "sync-log": "history",
};

/** Former top-level Product docs tab → Architecture sub-panel. */
export const LEGACY_ADMIN_TAB_TO_ARCHITECTURE: Record<
  string,
  AdminArchitecturePanelId
> = {
  docs: "docs",
};

export const ADMIN_DATA_CONTROLS_PANELS: {
  id: AdminDataControlsPanelId;
  label: string;
  subtitle: string;
}[] = [
  {
    id: "site",
    label: "Site controls",
    subtitle: "Photos, contact, Monday market brief, and social profiles",
  },
  {
    id: "spotlight",
    label: "Spotlight",
    subtitle: "Curated homepage slots (#1–#3) and privacy",
  },
  {
    id: "goldilocks",
    label: "Goldilocks",
    subtitle:
      "Factor weights, DOM bands, and remark characteristics — each as a sub-tab",
  },
  {
    id: "pricing",
    label: "Pricing",
    subtitle: "Sales, Rentals, and What if match parameters",
  },
  {
    id: "vintages",
    label: "Vintages",
    subtitle: "Read-only year-built buckets used across stats and matching",
  },
  {
    id: "rets",
    label: "RETS",
    subtitle: "SmartMLS credentials and connection health",
  },
  {
    id: "intel-inventory",
    label: "Market Bands",
    subtitle:
      "Value, Mid-market, Luxury, and Discount ranges/steps for Intelligence charts",
  },
];

export const ADMIN_SYNCS_PANELS: {
  id: AdminSyncsPanelId;
  label: string;
  subtitle: string;
}[] = [
  {
    id: "configure",
    label: "Sync configure",
    subtitle:
      "Enable/disable scheduled syncs, set Next overrides, and Run now",
  },
  {
    id: "history",
    label: "Sync history",
    subtitle: "Durable database sync history and latest in-browser sync steps",
  },
  {
    id: "overview",
    label: "Schedules overview",
    subtitle: "Startup schedule, Netlify crons, and Census zip-boundary sync",
  },
];

export const ADMIN_DATABASE_PANELS: {
  id: AdminDatabasePanelId;
  label: string;
  subtitle: string;
}[] = [
  {
    id: "rets-connection",
    label: "RETS connection",
    subtitle: "Live SmartMLS probe and stored connection health",
  },
  {
    id: "inventory",
    label: "Database inventory",
    subtitle: "Connected stores, paths/sizes, and row summaries",
  },
  {
    id: "town-counts",
    label: "Listings by town",
    subtitle: "Active listing counts from the current Postgres inventory",
  },
  {
    id: "db-tuning",
    label: "DB write tuning",
    subtitle: "Upsert chunk size for listings sync writes",
  },
];

export const ADMIN_ARCHITECTURE_PANELS: {
  id: AdminArchitecturePanelId;
  label: string;
  subtitle: string;
}[] = [
  {
    id: "map",
    label: "Site architecture",
    subtitle:
      "Visual map of Netlify, Neon, RETS, R2, DNS/CDN, Resend, and related services",
  },
  {
    id: "docs",
    label: "Product docs",
    subtitle: "Live pages and repository reference files",
  },
];

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
    id: "syncs",
    label: "Syncs",
    subtitle:
      "Configure enablement and schedules, sync history, and startup/cron overview",
  },
  {
    id: "db",
    label: "Database",
    subtitle: "RETS connection, inventory, town counts, and write tuning",
  },
  {
    id: "postgres",
    label: "NEON Postgres",
    subtitle:
      "Live Neon schema diagram and listings inventory — all public tables since last migration",
  },
  {
    id: "stats",
    label: "Stats",
    subtitle:
      "Sales by price, Market Bands, and where caches live",
  },
  {
    id: "data-controls",
    label: "Data controls",
    subtitle:
      "Site, Spotlight, Goldilocks, Pricing, Vintages, RETS, and Market Bands",
  },
  {
    id: "cookies",
    label: "Cookies",
    subtitle:
      "See and delete cookies for this browser (prefs, visitor id, unlock)",
  },
  {
    id: "architecture",
    label: "Architecture",
    subtitle: "Site architecture map and product docs",
  },
  {
    id: "server",
    label: "Web server",
    subtitle: "API routes and request handlers",
  },
  {
    id: "glossary",
    label: "Glossary",
    subtitle: "Acronyms and concepts from product chats on this PC",
  },
];

export const ADMIN_SECTION_LINKS: AdminSectionLink[] = [
  {
    id: "admin-rets-connection",
    label: "RETS connection",
    tab: "db",
    panel: "rets-connection",
  },
  {
    id: "admin-sync",
    label: "Sync configure",
    tab: "syncs",
    panel: "configure",
  },
  {
    id: "admin-database-inventory",
    label: "Database inventory",
    tab: "db",
    panel: "inventory",
  },
  {
    id: "admin-town-counts",
    label: "Listings by town",
    tab: "db",
    panel: "town-counts",
  },
  {
    id: "admin-db-tuning",
    label: "DB write tuning",
    tab: "db",
    panel: "db-tuning",
  },
  {
    id: "admin-sync-history",
    label: "DB sync history",
    tab: "syncs",
    panel: "history",
  },
  {
    id: "admin-sync-log",
    label: "Latest sync steps",
    tab: "syncs",
    panel: "history",
  },
  { id: "admin-stats-interesting", label: "Interesting stats", tab: "stats" },
  { id: "admin-stats-price-buckets", label: "Sales by price bands", tab: "stats" },
  { id: "admin-stats-inventory", label: "Stats storage map", tab: "stats" },
  { id: "admin-stats-market", label: "Market & town stats", tab: "stats" },
  { id: "admin-stats-feeds", label: "Latest feeds", tab: "stats" },
  { id: "admin-stats-deals", label: "Deal of the Day / Week", tab: "stats" },
  { id: "admin-stats-intelligence", label: "Intelligence caches", tab: "stats" },
  { id: "admin-stats-listing-derived", label: "Listing-derived scores", tab: "stats" },
  { id: "admin-stats-photos", label: "Photo storage", tab: "stats" },
  { id: "admin-stats-sync-control", label: "Sync control & config", tab: "stats" },
  { id: "admin-stats-site-data", label: "Site form / visitor data", tab: "stats" },
  { id: "admin-stats-ephemeral", label: "Ephemeral caches", tab: "stats" },
  {
    id: "admin-photo-health",
    label: "Listing photo health",
    tab: "data-controls",
    panel: "site",
  },
  {
    id: "admin-photo-ttl",
    label: "Listing photo TTL",
    tab: "data-controls",
    panel: "site",
  },
  {
    id: "admin-brokerage-name",
    label: "Brokerage name",
    tab: "data-controls",
    panel: "site",
  },
  {
    id: "admin-contact-email",
    label: "Contact form email",
    tab: "data-controls",
    panel: "site",
  },
  {
    id: "admin-contact-phone",
    label: "Contact phone",
    tab: "data-controls",
    panel: "site",
  },
  {
    id: "admin-market-digest",
    label: "Monday market brief",
    tab: "data-controls",
    panel: "site",
  },
  {
    id: "admin-deploy-notify",
    label: "Deploy notifications",
    tab: "data-controls",
    panel: "site",
  },
  {
    id: "admin-social-profiles",
    label: "Social media profiles",
    tab: "data-controls",
    panel: "site",
  },
  {
    id: "admin-spotlight",
    label: "Spotlight properties",
    tab: "data-controls",
    panel: "spotlight",
  },
  {
    id: "admin-goldilocks",
    label: "Goldilocks scoring",
    tab: "data-controls",
    panel: "goldilocks",
  },
  {
    id: "admin-pricing",
    label: "Pricing match parameters",
    tab: "data-controls",
    panel: "pricing",
  },
  {
    id: "admin-vintages",
    label: "Vintage buckets",
    tab: "data-controls",
    panel: "vintages",
  },
  {
    id: "admin-site-architecture",
    label: "Site architecture",
    tab: "architecture",
    panel: "map",
  },
  {
    id: "admin-rets-credentials",
    label: "RETS credentials",
    tab: "data-controls",
    panel: "rets",
  },
  {
    id: "admin-browser-cookies",
    label: "Browser cookies",
    tab: "cookies",
  },
  {
    id: "admin-inventory-segment-bands",
    label: "Market Bands",
    tab: "stats",
  },
  {
    id: "admin-intel-inventory",
    label: "Market Bands",
    tab: "data-controls",
    panel: "intel-inventory",
  },
  {
    id: "admin-sqlite-schemas",
    label: "NEON Postgres schema",
    tab: "postgres",
  },
  {
    id: "admin-startup",
    label: "Startup schedule",
    tab: "syncs",
    panel: "overview",
  },
  {
    id: "admin-netlify",
    label: "Netlify functions",
    tab: "syncs",
    panel: "overview",
  },
  {
    id: "admin-zip-boundaries",
    label: "Zip boundary sync",
    tab: "syncs",
    panel: "overview",
  },
  { id: "admin-api-routes", label: "API routes", tab: "server" },
  {
    id: "admin-product-pages",
    label: "Product pages",
    tab: "architecture",
    panel: "docs",
  },
  {
    id: "admin-repo-docs",
    label: "Repository docs",
    tab: "architecture",
    panel: "docs",
  },
  { id: "admin-glossary", label: "Glossary", tab: "glossary" },
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
    detail:
      "Thin schedule every 30m — stamps heartbeat + lean RETS in-process; optionally queues sync-listings-worker. Never background:true here (silent no-op with schedule).",
    schedule: "Every 30 min",
  },
  {
    label: "sync-listings-worker",
    detail:
      "Background worker for Admin Run cron (full RETS) or thin-cron side work (board/stats + digests). Not on the schedule itself.",
    schedule: "On invoke (background)",
  },
  {
    label: "sync-listings-full",
    detail:
      "Thin weekly trigger — queues sync-listings-full-worker (full town reload). Schedule only; no background flag.",
    schedule: "Weekly Mon ~5am ET",
  },
  {
    label: "sync-listings-full-worker",
    detail: "Background full reload, scores, superlatives, and product caches",
    schedule: "On invoke (background)",
  },
  {
    label: "sync-property-addresses",
    detail:
      "Thin weekly trigger — queues sync-property-addresses-worker (MLS + assessor directory)",
    schedule: "Weekly Mon ~1am ET",
  },
  {
    label: "sync-property-addresses-worker",
    detail: "Background property-address directory verify + enrich",
    schedule: "On invoke (background)",
  },
  {
    label: "sync-listing-edge-scores",
    detail:
      "Thin weekly trigger — queues sync-listing-edge-scores-worker",
    schedule: "Weekly Mon ~2am ET",
  },
  {
    label: "sync-listing-edge-scores-worker",
    detail: "Background comparable edge-score warm pass",
    schedule: "On invoke (background)",
  },
  {
    label: "sync-zip-boundaries",
    detail:
      "Thin monthly trigger — queues sync-zip-boundaries-worker (Census TIGERweb → zip_boundaries)",
    schedule: "Monthly 1st ~10:00 UTC",
  },
  {
    label: "sync-zip-boundaries-worker",
    detail: "Background zip boundary refresh for Intelligence / Latest maps",
    schedule: "On invoke (background)",
  },
  {
    label: "market-digest",
    detail:
      "Thin Monday trigger — queues market-digest-worker (months supply brief email)",
    schedule: "Weekly Mon ~8am ET",
  },
  {
    label: "market-digest-worker",
    detail: "Background Monday market brief email send",
    schedule: "On invoke (background)",
  },
];

/** Documented in Admin → Server / Site — Netlify → webhook, not a cron function. */
export const ADMIN_DEPLOY_NOTIFY_HOOK = {
  label: "POST /api/webhooks/netlify-deploy",
  detail:
    "Netlify outbound webhook → email (Resend) and/or SMS (Twilio) for main production deploys",
  href: "/api/webhooks/netlify-deploy",
};

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
      {
        label: "GET /api/zip-boundaries",
        detail: "Cached ZCTA rings from Postgres (TIGERweb monthly sync)",
        href: "/api/zip-boundaries?zips=06880",
      },
      {
        label: "POST /api/saved-searches",
        detail: "Create visitor listing alert from cookie search profile",
        href: "/latest#latest-alerts",
      },
    ],
  },
  {
    title: "Admin & sync",
    routes: [
      { label: "GET /api/admin/rets-credentials", detail: "RETS credentials + optional probe", href: "/api/admin/rets-credentials" },
      { label: "POST /api/admin/rets-credentials", detail: "Save RETS credentials and probe login" },
      { label: "GET /api/admin/sync", detail: "Trigger sync actions", href: "/api/admin/sync" },
      { label: "GET /api/admin/spotlight-privacy", detail: "Spotlight privacy overrides", href: "/api/admin/spotlight-privacy" },
      { label: "GET /api/admin/goldilocks-config", detail: "Goldilocks weights + characteristics", href: "/api/admin/goldilocks-config" },
      { label: "GET /api/admin/price-buckets", detail: "Sales by price band definitions", href: "/api/admin/price-buckets" },
      { label: "GET /api/admin/pricing-matching-config", detail: "Sales / Rentals / What if match parameters", href: "/api/admin/pricing-matching-config" },
      { label: "POST /api/sync/listings/incremental", detail: "Manual incremental sync hook", href: "/api/sync/listings/incremental" },
      {
        label: ADMIN_DEPLOY_NOTIFY_HOOK.label,
        detail: ADMIN_DEPLOY_NOTIFY_HOOK.detail,
        href: ADMIN_DEPLOY_NOTIFY_HOOK.href,
      },
      {
        label: "GET/PATCH/POST /api/admin/deploy-notify",
        detail: "Deploy notify preferences + Send test (Admin → Site)",
        href: "/api/admin/deploy-notify",
      },
    ],
  },
];

export function adminTabForSection(sectionId: string): AdminTabId | null {
  return ADMIN_SECTION_LINKS.find((link) => link.id === sectionId)?.tab ?? null;
}

export function adminDataControlsPanelForSection(
  sectionId: string,
): AdminDataControlsPanelId | null {
  const panel = ADMIN_SECTION_LINKS.find((link) => link.id === sectionId)?.panel;
  return isAdminDataControlsPanelId(panel) ? panel : null;
}

export function adminSyncsPanelForSection(
  sectionId: string,
): AdminSyncsPanelId | null {
  const panel = ADMIN_SECTION_LINKS.find((link) => link.id === sectionId)?.panel;
  return isAdminSyncsPanelId(panel) ? panel : null;
}

export function adminDatabasePanelForSection(
  sectionId: string,
): AdminDatabasePanelId | null {
  const panel = ADMIN_SECTION_LINKS.find((link) => link.id === sectionId)?.panel;
  return isAdminDatabasePanelId(panel) ? panel : null;
}

export function adminArchitecturePanelForSection(
  sectionId: string,
): AdminArchitecturePanelId | null {
  const panel = ADMIN_SECTION_LINKS.find((link) => link.id === sectionId)?.panel;
  return isAdminArchitecturePanelId(panel) ? panel : null;
}

export function isAdminDataControlsPanelId(
  value: string | null | undefined,
): value is AdminDataControlsPanelId {
  return (
    value === "site" ||
    value === "spotlight" ||
    value === "goldilocks" ||
    value === "pricing" ||
    value === "vintages" ||
    value === "rets" ||
    value === "intel-inventory"
  );
}

export function isAdminSyncsPanelId(
  value: string | null | undefined,
): value is AdminSyncsPanelId {
  return (
    value === "configure" || value === "history" || value === "overview"
  );
}

export function isAdminDatabasePanelId(
  value: string | null | undefined,
): value is AdminDatabasePanelId {
  return (
    value === "rets-connection" ||
    value === "inventory" ||
    value === "town-counts" ||
    value === "db-tuning"
  );
}

/** Schema diagram deep-links under Admin → NEON Postgres. */
export function isAdminPostgresSchemaHash(hash: string): boolean {
  return (
    hash.startsWith("schema-table-") ||
    hash === "admin-sqlite-schemas" ||
    hash === "postgres-listings"
  );
}

export function isAdminArchitecturePanelId(
  value: string | null | undefined,
): value is AdminArchitecturePanelId {
  return value === "map" || value === "docs";
}

export function adminSectionHref(sectionId: string, tab: AdminTabId): string {
  const link = ADMIN_SECTION_LINKS.find((row) => row.id === sectionId);
  const params = new URLSearchParams({ tab });
  if (
    link?.panel &&
    ((tab === "syncs" && isAdminSyncsPanelId(link.panel)) ||
      (tab === "data-controls" && isAdminDataControlsPanelId(link.panel)) ||
      (tab === "db" && isAdminDatabasePanelId(link.panel)) ||
      (tab === "architecture" && isAdminArchitecturePanelId(link.panel)))
  ) {
    params.set("panel", link.panel);
  }
  return `/admin?${params.toString()}#${sectionId}`;
}

export function adminDataControlsHref(panel: AdminDataControlsPanelId): string {
  return `/admin?tab=data-controls&panel=${panel}`;
}

export function adminSyncsHref(panel: AdminSyncsPanelId): string {
  return `/admin?tab=syncs&panel=${panel}`;
}

export function adminDatabaseHref(panel: AdminDatabasePanelId): string {
  return `/admin?tab=db&panel=${panel}`;
}

export function adminArchitectureHref(panel: AdminArchitecturePanelId): string {
  return `/admin?tab=architecture&panel=${panel}`;
}

/** Anchor id for a table card on the Admin Postgres schema diagram. */
export function adminPostgresSchemaTableAnchor(table: string): string {
  return `schema-table-${table}`;
}

/** Deep-link to a table on Admin → NEON Postgres. */
export function adminPostgresTableHref(table: string): string {
  return `/admin?tab=postgres#${adminPostgresSchemaTableAnchor(table)}`;
}
