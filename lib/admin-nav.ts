import { WESTPORT_VISION_GIS_HOME } from "@/lib/vision-gis-towns";

export type AdminTabId =
  | "postgres"
  | "stats"
  | "traffic"
  | "visitors"
  | "data-controls"
  | "communications"
  | "cookies"
  | "syncs"
  | "r2"
  | "server"
  | "glossary";

/** Sub-panels under Admin → Data Controls. */
export type AdminDataControlsPanelId =
  | "site"
  | "spotlight"
  | "goldilocks"
  | "pricing"
  | "price-bands"
  | "vintages"
  | "rets"
  | "intel-inventory"
  | "intel-deal-board"
  | "ct-coverage"
  | "town-budget";

/** Sub-panels under Admin → Cookies. */
export type AdminCookiesPanelId = "cookies" | "ephemeral";

/**
 * Sub-panels under Admin → Web server.
 *
 * The three architecture panels (`map`, `status-logic`, `docs`) moved here from
 * a former top-level Architecture tab, keeping their ids so deep links and hash
 * anchors survive. Admin has two levels, not three, so they sit alongside the
 * other server panels rather than nested under an Architecture group.
 */
export type AdminServerPanelId =
  | "api-routes"
  | "site-menu"
  | "page-styles"
  | "ui-kit"
  | "intel-descriptor-sizes"
  | "api-costs"
  | "map"
  | "status-logic"
  | "docs";

/** Sub-panels under Admin → Syncs. */
export type AdminSyncsPanelId =
  | "dashboard"
  | "configure"
  | "latest-health"
  | "mls-reconcile"
  | "history"
  | "overview"
  | "db-tuning"
  | "rets-connection"
  | "photo-ttl";

/** Sub-panels under Admin → NEON Postgres. */
export type AdminPostgresPanelId = "schema" | "inventory" | "town-counts";

/**
 * Retained as the narrowed set of Web server panels that used to live under a
 * top-level Architecture tab. Kept so existing deep links and helpers stay
 * expressible; new code should use AdminServerPanelId.
 */
export type AdminArchitecturePanelId = "map" | "docs" | "status-logic";

/** Sub-panels under Admin → Communications. */
export type AdminCommunicationsPanelId =
  | "market-digest"
  | "social-profiles"
  | "listing-alerts"
  | "mortgage-page";

export type AdminSectionLink = {
  id: string;
  label: string;
  tab: AdminTabId;
  /** Sub-panel when the tab has nested panels (Syncs / Database / Data controls / Architecture / Communications / Cookies). */
  panel?:
    | AdminSyncsPanelId
    | AdminDataControlsPanelId
    | AdminPostgresPanelId
    | AdminArchitecturePanelId
    | AdminCommunicationsPanelId
    | AdminCookiesPanelId
    | AdminServerPanelId;
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
  /** Old “Sync configure” (run + settings) → Dashboard (quick run view). */
  sync: "dashboard",
  "sync-history": "history",
  "sync-log": "history",
  /** Former Database → DB write tuning. */
  "db-tuning": "db-tuning",
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
    subtitle: "Contact, brokerage, and deploy notifications",
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
    id: "price-bands",
    label: "Sales by price bands",
    subtitle: "Bucket edges for Stats → Sales by price charts",
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
  {
    id: "intel-deal-board",
    label: "Deal board",
    subtitle:
      "Location-estimate map outlines plus read-only middle-tier rules",
  },
  {
    id: "ct-coverage",
    label: "CT coverage",
    subtitle:
      "Activate CT counties / towns for future site-wide coverage (not wired to pages yet)",
  },
  {
    id: "town-budget",
    label: "Town budget",
    subtitle:
      "Town · Source URL · Year — one row per CT coverage–enabled town; sync/parse later",
  },
];

export const ADMIN_SERVER_PANELS: {
  id: AdminServerPanelId;
  label: string;
  subtitle: string;
}[] = [
  {
    id: "api-routes",
    label: "API routes",
    subtitle: "Next.js route handlers under app/api/",
  },
  {
    id: "site-menu",
    label: "Site menu",
    subtitle:
      "Public header nav — rename, reorder, show/hide, add custom Explore groups, add the same page to more than one group",
  },
  {
    id: "page-styles",
    label: "Page styles",
    subtitle: "Palette, typography, and presets for Market Pulse",
  },
  {
    id: "ui-kit",
    label: "UI kit",
    subtitle:
      "Live preview of every tab / pill style with stable IDs (mobile + desktop notes)",
  },
  {
    id: "intel-descriptor-sizes",
    label: "Filter text",
    subtitle:
      "Mobile vs desktop idle size for Intelligence filter descriptors",
  },
  {
    id: "api-costs",
    label: "API costs",
    subtitle: "Jun/Jul stack spend via vendor APIs where they exist; paste the rest from invoices",
  },
  {
    id: "map",
    label: "Site architecture",
    subtitle:
      "Visual map of Netlify DNS/nameservers, site host, Railway, Neon, R2, Resend, mail forwarder, and related services",
  },
  {
    id: "status-logic",
    label: "Latest rules",
    subtitle:
      "/latest badge precedence, feed ranking, and how many rows the page renders — sourced from lib/latest-status-rules.ts",
  },
  {
    id: "docs",
    label: "Product docs",
    subtitle: "Live pages and repository reference files",
  },
];

export const ADMIN_SYNCS_PANELS: {
  id: AdminSyncsPanelId;
  label: string;
  subtitle: string;
}[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    subtitle:
      "Run syncs and scan status — compact view for phone and desktop",
  },
  {
    id: "history",
    label: "Sync history",
    subtitle: "Durable database sync history and latest in-browser sync steps",
  },
  {
    id: "configure",
    label: "Configure",
    subtitle:
      "Pause schedules, frequency / description, Next time overrides, and impacted pages",
  },
  {
    id: "latest-health",
    label: "Latest health",
    subtitle:
      "Feed freshness clocks and upsert history for /latest (display rules live under Web server → Latest rules)",
  },
  {
    id: "mls-reconcile",
    label: "MLS reconcile",
    subtitle:
      "Per town, compares the live MLS Active set against Postgres by MLS number — what the MLS has that we are missing, and what we still show as Active",
  },
  {
    id: "overview",
    label: "Schedules overview",
    subtitle: "Startup schedule, Netlify crons, and Census zip-boundary sync",
  },
  {
    id: "db-tuning",
    label: "DB write tuning",
    subtitle: "Upsert chunk size and RETS Active fetch limit",
  },
  {
    id: "rets-connection",
    label: "RETS connection",
    subtitle: "Live SmartMLS probe and stored connection health",
  },
  {
    id: "photo-ttl",
    label: "Listing photo TTL",
    subtitle:
      "How long cached listing photo bytes stay fresh before re-fetch / re-encode",
  },
];

export const ADMIN_POSTGRES_PANELS: {
  id: AdminPostgresPanelId;
  label: string;
  subtitle: string;
}[] = [
  {
    id: "schema",
    label: "NEON Postgres",
    subtitle:
      "Tables, columns, approximate counts, and relationships",
  },
  {
    id: "inventory",
    label: "Database inventory",
    subtitle:
      "Table row comparison vs last full-resync snapshot, plus connected-store summaries",
  },
  {
    id: "town-counts",
    label: "Listings by town",
    subtitle: "Active listing counts from the current Postgres inventory",
  },
];

export const ADMIN_COMMUNICATIONS_PANELS: {
  id: AdminCommunicationsPanelId;
  label: string;
  subtitle: string;
}[] = [
  {
    id: "market-digest",
    label: "Monday market brief",
    subtitle:
      "Weekly inventory / months-supply email (~8am Eastern) and Deal of the Week note",
  },
  {
    id: "social-profiles",
    label: "Social media profiles",
    subtitle:
      "Account handles and profile URLs for future market-brief / Deal of the Week posting",
  },
  {
    id: "listing-alerts",
    label: "Listing alerts",
    subtitle:
      "End-user alerts from Latest — email, search criteria, cadence, and delivery status",
  },
  {
    id: "mortgage-page",
    label: "Mortgage page",
    subtitle:
      "Commentary, spot quote, conforming loan limits, and FRED rate refresh for /mortgage-rates",
  },
];

export const ADMIN_COOKIES_PANELS: {
  id: AdminCookiesPanelId;
  label: string;
  subtitle: string;
}[] = [
  {
    id: "cookies",
    label: "Cookies",
    subtitle:
      "Catalog of cookie purposes + live jar (prefs, visitor id, unlock) and browser storage",
  },
  {
    id: "ephemeral",
    label: "Ephemeral",
    subtitle:
      "Per-instance memory caches and browser-only stores — not durable across deploys",
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
      "Dashboard, Configure, RETS connection, history, and cron overview",
  },
  {
    id: "stats",
    label: "Stats",
    subtitle: "Interesting stats, Market Bands, and where caches live",
  },
  {
    id: "traffic",
    label: "Traffic",
    subtitle:
      "Running view counts per property and page, counted from every visit since the counter went live",
  },
  {
    id: "visitors",
    label: "Visitors",
    subtitle:
      "Visitor activity log — provider → location or property → date, with +/− drilldown",
  },
  {
    id: "data-controls",
    label: "Data controls",
    subtitle:
      "Site, Spotlight, Goldilocks, Pricing, Sales by price bands, Vintages, RETS, and Market Bands",
  },
  {
    id: "communications",
    label: "Communications",
    subtitle:
      "Monday market brief, social profiles, listing alerts, and mortgage page",
  },
  {
    id: "cookies",
    label: "Cookies",
    subtitle:
      "Browser cookie jar, known cookie catalog, and ephemeral memory / browser caches",
  },
  {
    id: "postgres",
    label: "NEON",
    subtitle:
      "Schema, database inventory, and active listings by town",
  },
  {
    id: "r2",
    label: "R2",
    subtitle: "Cloudflare R2 listing photo storage health and related tools",
  },
  {
    id: "server",
    label: "Web server",
    subtitle: "API routes, site menu, and Market Pulse page styles",
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
    tab: "syncs",
    panel: "rets-connection",
  },
  {
    id: "admin-sync",
    label: "Syncs dashboard",
    tab: "syncs",
    panel: "dashboard",
  },
  {
    id: "admin-incremental-architecture",
    label: "Incremental cron diagram",
    tab: "syncs",
    panel: "dashboard",
  },
  {
    id: "admin-latest-page",
    label: "Latest page health",
    tab: "syncs",
    panel: "latest-health",
  },
  {
    id: "admin-mls-reconcile",
    label: "MLS reconcile",
    tab: "syncs",
    panel: "mls-reconcile",
  },
  {
    id: "admin-sync-configure",
    label: "Syncs configure",
    tab: "syncs",
    panel: "configure",
  },
  {
    id: "admin-inventory-comparison",
    label: "Inventory comparison",
    tab: "postgres",
    panel: "inventory",
  },
  {
    id: "admin-database-inventory",
    label: "Database inventory",
    tab: "postgres",
    panel: "inventory",
  },
  {
    id: "admin-sqlite-schemas",
    label: "NEON Postgres",
    tab: "postgres",
    panel: "schema",
  },
  {
    id: "admin-town-counts",
    label: "Listings by town",
    tab: "postgres",
    panel: "town-counts",
  },
  {
    id: "admin-db-tuning",
    label: "DB write tuning",
    tab: "syncs",
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
  { id: "admin-top-properties", label: "Most viewed properties", tab: "visitors" },
  { id: "admin-top-pages", label: "Most viewed pages", tab: "visitors" },
  { id: "admin-visitors-log", label: "Visitors log", tab: "visitors" },
  { id: "admin-stats-interesting", label: "Interesting stats", tab: "stats" },
  {
    id: "admin-stats-price-buckets",
    label: "Sales by price bands",
    tab: "data-controls",
    panel: "price-bands",
  },
  {
    id: "admin-ct-coverage",
    label: "CT coverage",
    tab: "data-controls",
    panel: "ct-coverage",
  },
  {
    id: "admin-town-budget-sources",
    label: "Town budget sources",
    tab: "data-controls",
    panel: "town-budget",
  },
  { id: "admin-stats-inventory", label: "Stats storage map", tab: "stats" },
  { id: "admin-stats-market", label: "Market & town stats", tab: "stats" },
  { id: "admin-stats-feeds", label: "Latest feeds", tab: "stats" },
  { id: "admin-stats-deals", label: "Deal of the Day / Week", tab: "stats" },
  { id: "admin-stats-intelligence", label: "Intelligence caches", tab: "stats" },
  { id: "admin-stats-listing-derived", label: "Listing-derived scores", tab: "stats" },
  { id: "admin-stats-photos", label: "Photo storage", tab: "stats" },
  { id: "admin-stats-sync-control", label: "Sync control & config", tab: "stats" },
  { id: "admin-stats-site-data", label: "Site form / visitor data", tab: "stats" },
  {
    id: "admin-stats-ephemeral",
    label: "Ephemeral caches",
    tab: "cookies",
    panel: "ephemeral",
  },
  {
    id: "admin-photo-health",
    label: "Listing photo health",
    tab: "r2",
  },
  {
    id: "admin-photo-ttl",
    label: "Listing photo TTL",
    tab: "syncs",
    panel: "photo-ttl",
  },
  {
    id: "admin-brokerage-name",
    label: "Brokerage name",
    tab: "data-controls",
    panel: "site",
  },
  {
    id: "admin-site-nav",
    label: "Site menu",
    tab: "server",
    panel: "site-menu",
  },
  {
    id: "admin-mortgage-page",
    label: "Mortgage page",
    tab: "communications",
    panel: "mortgage-page",
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
    tab: "communications",
    panel: "market-digest",
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
    tab: "communications",
    panel: "social-profiles",
  },
  {
    id: "admin-listing-alerts",
    label: "Listing alerts",
    tab: "communications",
    panel: "listing-alerts",
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
    tab: "server",
    panel: "map",
  },
  {
    id: "admin-latest-status-logic",
    label: "Latest rules",
    tab: "server",
    panel: "status-logic",
  },
  {
    id: "admin-ui-kit",
    label: "UI kit — tab styles",
    tab: "server",
    panel: "ui-kit",
  },
  {
    id: "admin-rets-credentials",
    label: "RETS credentials",
    tab: "data-controls",
    panel: "rets",
  },
  {
    id: "admin-browser-cookies",
    label: "Browser cookies + storage catalog",
    tab: "cookies",
    panel: "cookies",
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
    id: "admin-intel-deal-board",
    label: "Deal board middle tier",
    tab: "data-controls",
    panel: "intel-deal-board",
  },
  {
    id: "admin-intel-descriptor-sizes",
    label: "Intelligence filter descriptor sizes",
    tab: "server",
    panel: "intel-descriptor-sizes",
  },
  {
    id: "admin-api-costs",
    label: "Jun/Jul API cost rollup",
    tab: "server",
    panel: "api-costs",
  },
  {
    id: "admin-startup",
    label: "Startup schedule",
    tab: "syncs",
    panel: "overview",
  },
  {
    id: "admin-stats-cache-architecture",
    label: "Stats cache rebuild path",
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
  {
    id: "admin-vision-gis",
    label: "Westport Vision GIS homepage",
    tab: "syncs",
    panel: "overview",
  },
  {
    id: "admin-api-routes",
    label: "API routes",
    tab: "server",
    panel: "api-routes",
  },
  {
    id: "admin-page-styles",
    label: "Page styles",
    tab: "server",
    panel: "page-styles",
  },
  {
    id: "admin-product-pages",
    label: "Product pages",
    tab: "server",
    panel: "docs",
  },
  {
    id: "admin-repo-docs",
    label: "Repository docs",
    tab: "server",
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
    description: "Westport Vision GIS address lookup and parcel page",
  },
  {
    label: "Westport Vision GIS",
    href: WESTPORT_VISION_GIS_HOME,
    description:
      "VGSI cadastral homepage (Streets.aspx). Field Cards are Parcel.aspx?pid=N on this host.",
    external: true,
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
    href: "/admin?tab=visitors",
    description:
      "Admin → Visitors — provider → location or property → date log (unlocked only)",
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
    label: "incremental-sync-architecture.ts",
    path: "lib/incremental-sync-architecture.ts",
    description:
      "Incremental cron / EventBridge / Admin Dashboard clocks diagram source",
  },
  {
    label: "eventbridge-sync-dispatch.ts",
    path: "lib/eventbridge-sync-dispatch.ts",
    description:
      "EventBridge ingress job dispatch (provider/pause/Next gates → worker queue)",
  },
  {
    label: "site-architecture.ts",
    path: "lib/site-architecture.ts",
    description: "Admin → Web server → Site architecture component roster",
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
    label: "sync-vision-addresses",
    detail:
      "Thin Vision GIS trigger — queues sync-vision-addresses-worker (cadastral crawl)",
    schedule: "Weekly Mon ~1:30am ET",
  },
  {
    label: "sync-vision-addresses-worker",
    detail: "Background vision_addresses crawl → field_card JSON + R2 HTML pointer",
    schedule: "On invoke (background)",
  },
  {
    label: "sync-listing-scores",
    detail:
      "Thin Goldilocks (3a) trigger — queues sync-listing-scores-worker when Configure is due",
    schedule: "Every 30 min (weekly-gated)",
  },
  {
    label: "sync-listing-scores-worker",
    detail: "Background Goldilocks score rebuild (always runs; stamps last_listing_scores)",
    schedule: "On invoke (background)",
  },
  {
    label: "sync-listing-edge-scores",
    detail:
      "Thin Edge scores (3b) trigger — queues sync-listing-edge-scores-worker when Configure is due",
    schedule: "Every 30 min (weekly-gated)",
  },
  {
    label: "sync-listing-edge-scores-worker",
    detail: "Background comparable edge-score warm pass (always runs; stamps last_listing_edge_scores)",
    schedule: "On invoke (background)",
  },
  {
    label: "sync-stats-cache",
    detail:
      "Thin stats-cache trigger — queues sync-stats-cache-worker when Configure is due",
    schedule: "Every 30 min (Configure-gated)",
  },
  {
    label: "sync-stats-cache-worker",
    detail: "Background stats_cache rebuild (market stats, months-supply, etc.)",
    schedule: "On invoke (background)",
  },
  {
    label: "sync-deal-of-the-day",
    detail:
      "Thin Deal of the Day trigger — queues sync-deal-of-the-day-worker when Configure is due",
    schedule: "Every 30 min (weekly-gated)",
  },
  {
    label: "sync-deal-of-the-day-worker",
    detail: "Background Deal of the Day cache rebuild",
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
      "Thin trigger — queues market-digest-worker when Configure weekly Mon start time is due (default 08:00 ET)",
    schedule: "Every 30 min (weekly-gated)",
  },
  {
    label: "market-digest-worker",
    detail: "Background Monday market brief email send (also Admin Syncs Run)",
    schedule: "On invoke (background)",
  },
  {
    label: "sync-fomc",
    detail:
      "Thin trigger — queues sync-fomc-worker on FOMC decision day after Configure start time (default 15:15 ET)",
    schedule: "Every 30 min (event-gated)",
  },
  {
    label: "sync-fomc-worker",
    detail:
      "Background FOMC statement scrape → Postgres for /fed-analysis (official Fed text, not AI)",
    schedule: "On invoke (background)",
  },
  {
    label: "sync-cpi",
    detail:
      "Thin trigger — queues sync-cpi-worker on BLS CPI release day after Configure start time (default 09:15 ET)",
    schedule: "Every 30 min (event-gated)",
  },
  {
    label: "sync-cpi-worker",
    detail:
      "Background BLS CPI news-release scrape → Postgres for /fed-analysis (official BLS text, not AI)",
    schedule: "On invoke (background)",
  },
  {
    label: "eventbridge-sync-ingress",
    detail:
      "AWS EventBridge Scheduler HTTP target — Bearer SYNC_CRON_SECRET + JSON { job }. Enqueues the job on sync_queue for the runner (legacy *-worker handoff only for jobs the runner does not own). No Netlify schedule.",
    schedule: "On invoke (EventBridge)",
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
      {
        label: "GET /api/listings/find",
        detail:
          "Address / MLS text search (rets=0 for DB-only typeahead; indexed search_text)",
        href: "/api/listings/find?q=treadwell&rets=0",
      },
      {
        label: "GET /api/addresses/lookup",
        detail: "Westport Vision GIS typeahead (Find)",
        href: "/api/addresses/lookup?town=Westport&q=main",
      },
      { label: "GET /api/addresses/search", detail: "Property directory autocomplete", href: "/api/addresses/search?q=kings" },
      { label: "GET /api/addresses/resolve", detail: "Single address → MLS id (persists)", href: "/api/addresses/resolve?q=87+Kings+Highway+South,+Westport" },
      { label: "GET /api/listings/[mlsId]", detail: "Listing detail payload", href: "/api/listings/24152517" },
    ],
  },
  {
    title: "Intelligence & product caches",
    routes: [
      { label: "GET /api/intelligence/deal-board", detail: "Deal board rows + headlines", href: "/api/intelligence/deal-board" },
      {
        label: "GET /api/intelligence/descriptor-sizes",
        detail: "Intelligence filter descriptor idle font sizes",
        href: "/api/intelligence/descriptor-sizes",
      },
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
      {
        label: "GET /api/active-by-dom",
        detail: "Active inventory counts by Goldilocks DOM day-ranges",
        href: "/api/active-by-dom?city=Westport&kind=sale",
      },
    ],
  },
  {
    title: "Admin & sync",
    routes: [
      {
        label: "GET /api/admin/saved-search-alerts",
        detail: "List end-user listing alerts (Admin → Communications)",
        href: "/api/admin/saved-search-alerts",
      },
      {
        label: "POST /api/admin/saved-search-alerts",
        detail: "Process due listing alerts now { force?: boolean }",
      },
      {
        label: "PATCH /api/admin/saved-search-alerts",
        detail: "Activate or disable a listing alert { id, active }",
      },
      {
        label: "DELETE /api/admin/saved-search-alerts",
        detail: "Permanently delete a listing alert { id }",
      },
      { label: "GET /api/admin/rets-credentials", detail: "RETS credentials + optional probe", href: "/api/admin/rets-credentials" },
      { label: "POST /api/admin/rets-credentials", detail: "Save RETS credentials and probe login" },
      { label: "GET /api/admin/sync", detail: "Trigger sync actions", href: "/api/admin/sync" },
      { label: "GET /api/admin/spotlight-privacy", detail: "Spotlight privacy overrides", href: "/api/admin/spotlight-privacy" },
      {
        label: "GET /api/admin/stack-costs",
        detail: "Jun/Jul vendor API cost rollup (Admin → Web server → API costs)",
        href: "/api/admin/stack-costs",
      },
      { label: "GET /api/admin/goldilocks-config", detail: "Goldilocks weights + characteristics", href: "/api/admin/goldilocks-config" },
      {
        label: "GET/PATCH /api/admin/location-estimate-map-overlay",
        detail: "Show coastal-strip + town-center outlines on showcase and Intelligence maps",
        href: "/api/admin/location-estimate-map-overlay",
      },
      {
        label: "GET/PATCH /api/admin/location-estimate-zip-grid",
        detail: "Painted ¼-mile coastal-value cells (town-center radius overrides)",
        href: "/api/admin/location-estimate-zip-grid",
      },
      {
        label: "GET /api/admin/intelligence-descriptor-sizes",
        detail: "Intelligence filter descriptor mobile/desktop sizes",
        href: "/api/admin/intelligence-descriptor-sizes",
      },
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

export function adminPostgresPanelForSection(
  sectionId: string,
): AdminPostgresPanelId | null {
  const panel = ADMIN_SECTION_LINKS.find((link) => link.id === sectionId)?.panel;
  return isAdminPostgresPanelId(panel) ? panel : null;
}

export function adminArchitecturePanelForSection(
  sectionId: string,
): AdminArchitecturePanelId | null {
  const panel = ADMIN_SECTION_LINKS.find((link) => link.id === sectionId)?.panel;
  return isAdminArchitecturePanelId(panel) ? panel : null;
}

export function adminCommunicationsPanelForSection(
  sectionId: string,
): AdminCommunicationsPanelId | null {
  const panel = ADMIN_SECTION_LINKS.find((link) => link.id === sectionId)?.panel;
  return isAdminCommunicationsPanelId(panel) ? panel : null;
}

export function adminCookiesPanelForSection(
  sectionId: string,
): AdminCookiesPanelId | null {
  const panel = ADMIN_SECTION_LINKS.find((link) => link.id === sectionId)?.panel;
  return isAdminCookiesPanelId(panel) ? panel : null;
}

export function adminServerPanelForSection(
  sectionId: string,
): AdminServerPanelId | null {
  const panel = ADMIN_SECTION_LINKS.find((link) => link.id === sectionId)?.panel;
  return isAdminServerPanelId(panel) ? panel : null;
}

export function isAdminDataControlsPanelId(
  value: string | null | undefined,
): value is AdminDataControlsPanelId {
  return (
    value === "site" ||
    value === "spotlight" ||
    value === "goldilocks" ||
    value === "pricing" ||
    value === "price-bands" ||
    value === "vintages" ||
    value === "rets" ||
    value === "intel-inventory" ||
    value === "intel-deal-board" ||
    value === "ct-coverage" ||
    value === "town-budget"
  );
}

export function isAdminServerPanelId(
  value: string | null | undefined,
): value is AdminServerPanelId {
  return (
    value === "api-routes" ||
    value === "site-menu" ||
    value === "page-styles" ||
    value === "ui-kit" ||
    value === "intel-descriptor-sizes" ||
    value === "api-costs"
  );
}

export function isAdminSyncsPanelId(
  value: string | null | undefined,
): value is AdminSyncsPanelId {
  return (
    value === "dashboard" ||
    value === "configure" ||
    value === "latest-health" ||
    value === "mls-reconcile" ||
    value === "history" ||
    value === "overview" ||
    value === "db-tuning" ||
    value === "rets-connection" ||
    value === "photo-ttl"
  );
}

export function isAdminPostgresPanelId(
  value: string | null | undefined,
): value is AdminPostgresPanelId {
  return (
    value === "schema" || value === "inventory" || value === "town-counts"
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
  return value === "map" || value === "docs" || value === "status-logic";
}

export function isAdminCommunicationsPanelId(
  value: string | null | undefined,
): value is AdminCommunicationsPanelId {
  return (
    value === "market-digest" ||
    value === "social-profiles" ||
    value === "listing-alerts" ||
    value === "mortgage-page"
  );
}

export function isAdminCookiesPanelId(
  value: string | null | undefined,
): value is AdminCookiesPanelId {
  return value === "cookies" || value === "ephemeral";
}

export function adminSectionHref(sectionId: string, tab: AdminTabId): string {
  const link = ADMIN_SECTION_LINKS.find((row) => row.id === sectionId);
  const params = new URLSearchParams({ tab });
  if (
    link?.panel &&
    ((tab === "syncs" && isAdminSyncsPanelId(link.panel)) ||
      (tab === "data-controls" && isAdminDataControlsPanelId(link.panel)) ||
      (tab === "postgres" && isAdminPostgresPanelId(link.panel)) ||
      (tab === "communications" && isAdminCommunicationsPanelId(link.panel)) ||
      (tab === "cookies" && isAdminCookiesPanelId(link.panel)) ||
      (tab === "server" && isAdminServerPanelId(link.panel)))
  ) {
    params.set("panel", link.panel);
  }
  return `/admin?${params.toString()}#${sectionId}`;
}

export function adminCookiesHref(panel: AdminCookiesPanelId): string {
  return `/admin?tab=cookies&panel=${panel}`;
}

export function adminServerHref(panel: AdminServerPanelId): string {
  return `/admin?tab=server&panel=${panel}`;
}

export function adminDataControlsHref(panel: AdminDataControlsPanelId): string {
  return `/admin?tab=data-controls&panel=${panel}`;
}

export function adminSyncsHref(panel: AdminSyncsPanelId): string {
  return `/admin?tab=syncs&panel=${panel}`;
}

export function adminPostgresHref(panel: AdminPostgresPanelId): string {
  return `/admin?tab=postgres&panel=${panel}`;
}

/** Architecture now lives under Web server; the panel ids are unchanged. */
export function adminArchitectureHref(panel: AdminArchitecturePanelId): string {
  return `/admin?tab=server&panel=${panel}`;
}

export function adminCommunicationsHref(
  panel: AdminCommunicationsPanelId,
): string {
  return `/admin?tab=communications&panel=${panel}`;
}

/** Anchor id for a table card on the Admin Postgres schema diagram. */
export function adminPostgresSchemaTableAnchor(table: string): string {
  return `schema-table-${table}`;
}

/** Deep-link to a table on Admin → NEON Postgres → Schema. */
export function adminPostgresTableHref(table: string): string {
  return `/admin?tab=postgres&panel=schema#${adminPostgresSchemaTableAnchor(table)}`;
}
