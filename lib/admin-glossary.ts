/**
 * Admin Glossary — acronyms & concepts explained in product chats since
 * work started on this PC. Keep adding entries when new terms come up.
 */

export type GlossaryCategoryId =
  | 'tooling'
  | 'mls-data'
  | 'sync-admin'
  | 'scoring'
  | 'photos-cdn'
  | 'ui-tabs'
  | 'finance'
  | 'product'

export type GlossaryEntry = {
  term: string
  definition: string
  category: GlossaryCategoryId
}

export const GLOSSARY_CATEGORIES: {
  id: GlossaryCategoryId
  label: string
}[] = [
  { id: 'mls-data', label: 'MLS & listing data' },
  { id: 'sync-admin', label: 'Sync, Admin & databases' },
  { id: 'scoring', label: 'Scoring & comps' },
  { id: 'photos-cdn', label: 'Photos & CDN' },
  { id: 'ui-tabs', label: 'Pages & tabs' },
  { id: 'finance', label: 'What if / finance' },
  { id: 'product', label: 'Product & brand' },
  { id: 'tooling', label: 'Tooling & engineering' },
]

export const ADMIN_GLOSSARY: GlossaryEntry[] = [
  // —— Tooling ——
  {
    term: 'npm',
    category: 'tooling',
    definition:
      'Commonly understood as “Node Package Manager” (maintainers say it’s not officially an acronym). Installs JavaScript dependencies and runs scripts like npm run dev or npm run sync:listings.',
  },
  {
    term: 'npm ci',
    category: 'tooling',
    definition:
      'Clean install: deletes node_modules (when present) and installs exactly from package-lock.json — reproducible CI/deploy installs, unlike npm install which may mutate the lockfile. On Railway Railpack, prefer npm install for mls-sync: npm ci’s wipe hits EBUSY on the locked node_modules/.cache mount. Needs Node + (for native addons like node-expat) Python/g++. See Railpack, EBUSY node_modules/.cache (Railway).',
  },
  {
    term: 'package-lock.json',
    category: 'tooling',
    definition:
      'npm’s generated record of the exact dependency tree actually installed: every direct and transitive package, its resolved version, and an integrity hash. package.json states intent (often a range like ^16.0.0); the lockfile states the resolution. Committed to git here (lockfileVersion 3, npm 7+) and it must be, because it is the only thing making the two hosts agree: Netlify builds this repo with npm run build:netlify and Railway builds the same repo for mls-sync with npm install --no-audit --no-fund (see railpack.json), so without the lockfile the site and the sync service could resolve different versions of shared libs like pg or rets-client. Never hand-edit it; to change a version edit package.json and re-run npm install, and resolve merge conflicts by taking either side then re-running npm install. A matching lockfile still does not guarantee a working install of native addons (node-expat, better-sqlite3) — those compile per platform, which is why Netlify sets NPM_CONFIG_BUILD_FROM_SOURCE=false and Windows needs Visual Studio Build Tools. See npm ci, Railpack, Visual Studio Build Tools.',
  },
  {
    term: 'errno (E-prefixed codes)',
    category: 'tooling',
    definition:
      'The E on ENOSPC, EBUSY, ENOENT, EACCES and friends: POSIX error constants from C’s <errno.h>, where E means “error” and the rest is a 1970s-style squeezed abbreviation of the condition — not an initialism, so there is no letter-by-letter expansion. ENOSPC = no space (28), EBUSY = resource busy (16), ENOENT = no such directory ENTry, i.e. file or path not found (2), EACCES = access denied (13), EMFILE = too many open files (24). Node exposes the macro name as err.code, so checks read `if (err.code === \'ENOENT\')`, while libuv often reports the number negated — which is why a Railway build log says “errno -16” for EBUSY. See ENOSPC, EBUSY node_modules/.cache (Railway).',
  },
  {
    term: 'tsc',
    category: 'tooling',
    definition:
      'TypeScript compiler CLI. npx tsc --noEmit type-checks the project without emitting JS files — useful before a Netlify build.',
  },
  {
    term: 'UAC',
    category: 'tooling',
    definition:
      'User Account Control — Windows admin approval dialog. Appears when installing Node or Visual Studio Build Tools.',
  },
  {
    term: 'Visual Studio Build Tools',
    category: 'tooling',
    definition:
      'Windows C++ toolchain needed so native Node modules (e.g. better-sqlite3, RETS XML parsers) can compile during npm install.',
  },
  {
    term: 'SSR',
    category: 'tooling',
    definition:
      'Server-Side Rendering — HTML generated on the server before the browser runs React.',
  },
  {
    term: 'Netlify SSR budget',
    category: 'tooling',
    definition:
      'Wall-clock time Netlify allows one SSR (or other non-background serverless) request before it kills the function. On this site that ceiling is about 26 seconds for page renders — Next.js `export const maxDuration` (e.g. Market Pulse sets 26) asks for up to that many seconds, but the plan hard-caps the real limit. Blow the budget and the visitor gets a gateway timeout / 500 (often an HTML error page), even if Postgres would have finished a moment later. Distinct from background *-worker functions, which get ~15 minutes. Heavy Neon reads during SSR (unbounded Closed history, many towns, etc.) are the usual way pages miss this budget.',
  },
  {
    term: 'Hydration (React)',
    category: 'tooling',
    definition:
      'Client React attaching to server-rendered HTML. “Hydration failed” means server text didn’t match what the client rendered (e.g. locale dates).',
  },
  {
    term: 'Accessibility tree',
    category: 'tooling',
    definition:
      'The browser’s structured view of a page for assistive tech (and for agent/devtools snapshots): roles, names, and states (e.g. link “Photos”, button “Previous photo”, heading “1 Sheridan Street”) rather than raw HTML/CSS. Cursor’s browser tools often return this YAML-style tree instead of a full screenshot — useful to confirm whether a control exists, is current/expanded, or is missing (e.g. no photo buttons) without relying only on visuals.',
  },
  {
    term: 'Turbopack',
    category: 'tooling',
    definition:
      'Next.js 16 default bundler for next dev (replaces the older webpack default for local development).',
  },
  {
    term: 'Heredoc',
    category: 'tooling',
    definition:
      'Short for “here document”: a way to embed a multi-line text block in a shell script or one-liner without escape hell. The shell reads every line after an opener like `<<EOF` (or `<<\'EOF\'`) until it sees a line that is only the closing marker (`EOF`). That block becomes stdin for a command, or (when wrapped in `$(…)`) a string argument. Why it exists: commit messages, SQL, JSON, and email bodies often need real newlines and quotes; putting them in `"…"` or `\'…\'` gets ugly fast. Quoting the marker matters: `<<\'EOF\'` / `<<"EOF"` = literal text (no `$var` expansion); `<<EOF` = expand variables and `$(…)` inside the body. The marker must sit alone at the start of the closing line (no spaces before it unless you used `<<-`, which strips leading tabs). Common pattern in agent/git docs: `git commit -m "$(cat <<\'EOF\'` … message … `EOF` `)"`. Not a git feature — pure shell. Bash, zsh, Git Bash, and WSL support heredocs. Windows PowerShell does not: `<<` is invalid there. On this PC use a PowerShell here-string (`@"… "@`) written to a file then `git commit -F thatfile`, or multiple `git commit -m` flags. See also Bash heredoc (same idea, bash-focused wording).',
  },
  {
    term: 'Bash heredoc',
    category: 'tooling',
    definition:
      'Heredoc syntax as used in bash (`<<\'EOF\'` … `EOF`). Same concept as Heredoc — multi-line literal fed to a command or captured with `$(cat <<\'EOF\' …)`. Preferred in Linux/macOS/Git Bash scripts; agents often paste this form for commit messages. Does not work in Windows PowerShell (use a here-string + `git commit -F` instead).',
  },
  {
    term: 'UI kit (tab styles)',
    category: 'ui-tabs',
    definition:
      'Admin → Web server → UI kit — catalog grouped by style family (segmented gold, independent, zip/town, underline, edge, folder, status). Each surface card shows native preview + Use style draft with After preview and per-row Save (sync_meta tab_kit_assignments). Segmented/independent remaps paint Market Pulse, Stats Sale/Rental, Intelligence filters, Deal of the Week, and Fixer Uppers via useTabKitSegmentedStyle.',
  },
  {
    term: '“This is not the Next.js you know”',
    category: 'tooling',
    definition:
      'Project rule: this app uses a Next version with breaking changes — check node_modules/next/dist/docs/ before assuming older Next APIs.',
  },
  {
    term: 'Idempotent',
    category: 'tooling',
    definition:
      'Safe to run again with the same result — a second (or tenth) run does not duplicate data or break what’s already there. Example: SQL `CREATE TABLE IF NOT EXISTS` and `INSERT … ON CONFLICT DO NOTHING/UPDATE`. TMRE uses this for db migrations (`npm run db:migrate`) and for Admin CT coverage, which creates `ct_counties` / `ct_towns` on first open if Netlify never ran the migration. Opposite of a one-shot script that fails or doubles rows if you re-run it.',
  },
  {
    term: 'Seam',
    category: 'tooling',
    definition:
      'A place where two jobs or two owners meet in the code — the boundary you should name before refactoring, not bury inside “reuse the existing helper.” If one function does more than one job (e.g. pull RETS, write Neon, then warm deal board / latest / heroes / stats), each job-to-job join is a seam. Crossing a seam without an explicit switch is how architecture decays: Railway mls-sync called the old Netlify mega-path with `postHooks: true`, so site-cache warm stayed glued to the RETS→Neon worker and Node-OOMed production. Healthy refactors make seams visible (ownership table + a flag like `postHooks: false` when `source === \'railway\'`) so you can still see “who owns what” after the change. See Railway mls-sync, Node OOM, Same-repo dual deploy (Netlify + Railway).',
  },

  // —— MLS / data ——
  {
    term: 'MLS',
    category: 'mls-data',
    definition:
      'Multiple Listing Service — the shared inventory of listings agents use. TMRE’s data comes from SmartMLS via RETS.',
  },
  {
    term: 'RETS',
    category: 'mls-data',
    definition:
      'Real Estate Transaction Standard — the MLS API feed (SmartMLS ConnectMLS) used to pull listing data into the site.',
  },
  {
    term: 'SmartMLS / ConnectMLS',
    category: 'mls-data',
    definition:
      'The MLS vendor and RETS endpoint (smartmls-rets.connectmls.com) that supplies TMRE town listings.',
  },
  {
    term: 'DMQL',
    category: 'mls-data',
    definition:
      'RETS query language used to filter searches (city, status, modifiedAfter, etc.).',
  },
  {
    term: 'Modification timestamp',
    category: 'mls-data',
    definition:
      'MLS field (ModificationTimestamp) stored per listing — advertising/legal freshness (remarks/photos/meta). Shown small on listing/Spotlight property facts. Drives incremental RETS “what changed” pulls. Never a /latest badge qualifier and never the /latest ranking clock (that is PriceChangeTimestamp / status change / list date). Often UTC in the feed.',
  },
  {
    term: 'Last price change ($ / %)',
    category: 'mls-data',
    definition:
      'Temporal ask→ask move for a listing: dollar delta and percent of the prior ask (signed; negative = Reduced, positive = Increased). Written to stats_cache as listing-price-change:v1:{listingId} whenever sync sees a price change; a later move overwrites the prior calc (not cumulative from OriginalListPrice). Ladder of all moves stays in listing_price_history. Shown on /latest Reduced/Increased rows. Cold cache falls back to the latest history edge, then OriginalListPrice.',
  },
  {
    term: 'UTC / GMT',
    category: 'mls-data',
    definition:
      'Timezone of many MLS timestamps. Showing them as local without conversion can look “in the future.”',
  },
  {
    term: 'Status bucket',
    category: 'mls-data',
    definition:
      'Site grouping of MLS statuses (Active, Closed, Expired, etc.) used for sync and queries — not every MLS subtype label.',
  },
  {
    term: 'Active / Coming Soon / Closed / Expired',
    category: 'mls-data',
    definition:
      'Core inventory states synced from RETS. Sold/rented comps need Closed (and related) rows, not only Active.',
  },
  {
    term: 'DOM (Days on Market)',
    category: 'mls-data',
    definition:
      'How long the listing has been on market. Not the browser Document Object Model.',
  },
  {
    term: 'Vintage',
    category: 'mls-data',
    definition:
      'Year-built era buckets (e.g. Pre-1900, 1900–1940, 1941–1970) from lib/vintage-buckets.ts — used in Stats, Intelligence filters, and comps matching. Read-only summary in Admin → Data controls → Vintages.',
  },
  {
    term: 'CTS',
    category: 'mls-data',
    definition:
      'Continue to Show — under-contract MLS subtype that still allows showings.',
  },
  {
    term: 'jsonb / raw',
    category: 'mls-data',
    definition:
      'The two jsonb payload columns on listings. `raw` is the full flat RETS field map — the catch-all that lets a new MLS field arrive without a schema migration. `data` is the normalized Listing object without raw, used to hydrate the app’s Listing type on read. Anything queried often is promoted to a real typed column instead; the payloads are for flexible or rarely-filtered MLS attributes. See jsonb (Postgres type).',
  },
  {
    term: 'AGENT_MLS_ID',
    category: 'mls-data',
    definition:
      'Timothy Marks’s SmartMLS / brokerage agent ID (855109), stored in lib/business-info.ts and shown next to brokerage attributions.',
  },
  {
    term: 'Cadastral',
    category: 'mls-data',
    definition:
      'Relating to a municipality’s official parcel map and ownership records (the assessor’s cadastral / CAMA inventory), as opposed to MLS listing data. Keys like MBLU (Map / Block / Lot / Unit) and Vision PID (`vision_pid`) identify the land parcel; street address can be missing (vacant lots) or differ from RETS. Neon table `vision_addresses` is the cadastral index (VGSI GIS sync); `town_property_addresses` is a thinner List With Me address catalog, not the full town parcel map.',
  },
  {
    term: 'MBLU',
    category: 'mls-data',
    definition:
      'Map / Block / Lot / Unit — the town assessor’s cadastral parcel label (not a street address). On Westport Vision it looks like `E12/ / 045/000 /` (map sheet, optional block, lot, unit; `000` when there is no condo unit). Stronger secondary key than street number for vacant or oddly addressed parcels; formatting varies by town, so normalize before joining. Distinct from Vision’s internal PID (`vision_pid`) and from MLS `listing_id`. See Cadastral.',
  },
  {
    term: 'Vision PID / vision_pid',
    category: 'mls-data',
    definition:
      'Vision GIS internal parcel id — labeled PID on the Field Card / Parcel.aspx?pid=N (not MBLU). Stored as `vision_addresses.vision_pid` (PK with town) and mirrored onto every `listings.vision_pid` at that address when the match key has exactly one Vision PID (re-lists included; 2+ PIDs stay unmatched). Sync job: vision-addresses (chunked full fill → fingerprint incremental; Field Card HTML in R2).',
  },
  {
    term: 'vision-addresses (sync)',
    category: 'sync-admin',
    definition:
      'Scheduled VGSI GIS crawler (Westport first): Streets.aspx → Parcel.aspx Field Card parse → Neon `vision_addresses` + optional R2 HTML blob. After a town’s street alphabet completes, phase flips to incremental re-crawl comparing `content_fingerprint` (VGSI has no known modified-since feed). Default chunk is 40 parcels (Admin/Netlify, hard cap 200). CLI loops 1000-parcel chunks until the town is complete (`VISION_SYNC_TARGET=neon`); `VISION_SYNC_ONCE=1` for a single chunk. While running, each parcel logs to the console and stamps `vision_addresses_live` (Admin Status shows current address). `scraped_at` is ISO-8601 UTC (Postgres `timestamptz` `+00`). Admin Syncs row + Netlify thin sync-vision-addresses → worker; CLI `npm run sync:vision-addresses`. Distinct from property-addresses (List With Me thin directory).',
  },
  {
    term: 'Brokerage name',
    category: 'sync-admin',
    definition:
      'Public sponsoring-brokerage display string (default Berkshire Hathaway Home Services NE). Editable in Admin → Site without redeploy; stored in sync_meta key brokerage_name (lib/brokerage-config.ts).',
  },
  {
    term: 'Site menu',
    category: 'sync-admin',
    definition:
      'Public header nav config (top-level links + Explore groups): rename, reorder, show/hide, add/remove. The Add page picker is every stable public path in lib/site-pages.ts that is not already in the menu (same list as sitemap.xml) — Market Pulse, Fed Analysis, Deal Model, etc. Dynamic listing/spotlight URLs, /admin, /visitors, and /test stay out so a menu edit cannot 404. Catalog rows hide rather than delete. Stored in sync_meta key site_nav (lib/site-nav-config.ts).',
  },
  {
    term: 'Mortgage page',
    category: 'sync-admin',
    definition:
      'Admin content for /mortgage-rates: market / buyer / seller commentary, an optional hand-entered spot quote, the conforming loan-limit table (with high-cost town links), and preferred lenders with min-down notes. Editable in Admin → Communications → Mortgage page. Stored in sync_meta key mortgage_page (lib/mortgage-page-config.ts). Rate history is not stored here — it comes from FRED into the mortgage_rates table.',
  },
  {
    term: 'FRED (mortgage rate series)',
    category: 'sync-admin',
    definition:
      'St. Louis Fed data API behind /mortgage-rates. Needs FRED_API_KEY. Series in Postgres mortgage_rates: MORTGAGE30US + MORTGAGE15US (Freddie PMMS — only live national fixed averages; no live 10-yr mortgage; MORTGAGE5US 5/1 ARM discontinued Nov 2022), OBMMIC30YF + OBMMIJUMBO30YF (Optimal Blue MMI — daily averages of actual PPE rate locks, not a survey), DGS30/DGS15/DGS10/DGS5 (Treasury constant-maturity / on-the-run equivalents). Sync pulls from 1971 so Max lookback works (OBMMI itself starts ~2015). Lazy refresh when data >12h old; Admin → Communications → Mortgage page has “Refresh rates from FRED”.',
  },
  {
    term: 'Conforming vs jumbo',
    category: 'product',
    definition:
      'Conforming = loan amount at or under the FHFA limit for the county/planning region and unit count (1–4 units), so Fannie/Freddie can buy it. Jumbo = above the limit, priced by banks and private investors. FHFA sets a baseline ladder, local high-cost area limits (Western CT / Greater Bridgeport for TMRE towns), and a national high-cost ceiling (150% of baseline). CT towns are high-cost area — not at the ceiling. Figures on /mortgage-rates are Admin-editable because FHFA revises them annually.'
  },
  {
    term: 'Monday market brief',
    category: 'product',
    definition:
      'Weekly Resend email via Netlify market-digest cron (every 30m wake, gated to Configure weekly day + start time ET — default Mon 08:00, then once-per-week watermark + send lock) — not the MLS incremental sync. HTML bars + DOTW card; same snapshot powers /market-pulse. Send day/time live on Syncs → Configure and Communications → Monday market brief (shared Postgres sync_schedule_config); changing the day rewrites the subject day name. Communications Enabled is tied to Syncs Pause for market-digest — a paused job locks day/time scheduling on Communications and the cron will not send. Recipient, subject `{date}`, optional social footer on Communications.',
  },
  {
    term: 'Buyer / Seller Friendly (Market Pulse)',
    category: 'product',
    definition:
      'Market Pulse town sort. Default is Seller Friendly. STACKED uses a composite (months supply + avg DOM). UNSTACKED sorts each chart on its own metric — Seller: DOM ascending, closed sales descending, median/average price descending; Buyer is the reverse. All towns stays on top. Median and Avg are sandwiched (no gap); Delta is mean minus median in $K and as % of median, drawn on the same dollar scale as Median/Avg. Coming soon (footer on /market-pulse): Active Listings ÷ Housing Units and 24-Month Closings ÷ Housing Units. Scoring in lib/market-pulse-favorability.ts.',
  },
  {
    term: 'Town housing unit count',
    category: 'product',
    definition:
      'Planned Town stats field: number of homes/housing units in a municipality (Census/ACS or curated), tagged with the most current year available. Used as the denominator for Market Pulse inventory-per-home and closings-24mo-per-home favorability factors. Not in Neon yet.',
  },
  {
    term: 'Deploy notifications',
    category: 'sync-admin',
    definition:
      'Admin → Site: email (Resend) and/or SMS (Twilio) when Netlify finishes a main/production deploy. Netlify outgoing webhook POSTs to /api/webhooks/netlify-deploy with DEPLOY_NOTIFY_WEBHOOK_SECRET. Separate from the public Contact phone CTA.',
  },
  {
    term: 'Social media profiles',
    category: 'product',
    definition:
      'Admin → Communications → Social media profiles text slots for Instagram / LinkedIn (or other) handles and URLs. Stored in sync_meta for future auto-posting of the market brief / Deal of the Week graphic; posting APIs not connected yet.',
  },
  {
    term: 'Saved search / listing alert',
    category: 'product',
    definition:
      'Visitor alert from unique cookie searches (tmre_search_history + Intelligence filters). Signup on /latest; email via Resend; cadence immediate / daily / weekly ET. SMS not wired yet (Twilio + A2P planned). Tables: saved_search_alerts + deliveries. Manage in Admin → Communications → Listing alerts (group by email, activate/disable/delete; duplicate = same email + same criteria fingerprint).',
  },

  // —— Sync / admin ——
  {
    term: 'Browser cookies (Admin)',
    category: 'sync-admin',
    definition:
      'Admin → Cookies (top-level tab). Live jar for this browser + Show catalog lists every known cookie purpose from lib/browser-cookies-catalog.ts even when absent. Pref cookies (Intelligence/Stats/OH/NC/etc.) are written by lib/client-prefs.ts (~1 year, Path=/, SameSite=Lax). HttpOnly: tmre_site_pass (Admin unlock), tmre_vid (anonymous visitor id), tmre_user_session (magic-link). Same tab also documents sessionStorage/localStorage keys that are not cookies (e.g. tmre_latest_view for Latest Back restore, listing-return-nav). Clear all / Delete act on this browser only; clearing unlock logs you out. Catalog purposes must be updated when new writeClientPref keys ship.',
  },
  {
    term: 'Client prefs (cookies)',
    category: 'sync-admin',
    definition:
      'Durable UI filter settings stored as non-HttpOnly cookies via lib/client-prefs.ts (readClientPref / writeClientPref). Used heavily on Intelligence, Stats, Open Houses, New Construction, Expired, Fixer-uppers, Deal of the Day, Find. Survives tab close for ~1 year. Distinct from sessionStorage (tab-local, e.g. Latest view chrome) and from HttpOnly session cookies (tmre_site_pass / tmre_vid). See Admin → Cookies catalog.',
  },
  {
    term: 'Market Bands',
    category: 'sync-admin',
    definition:
      'Postgres sync_meta key intel_inventory_segment_bands — editable Value, Mid-market, Luxury, and Discount ranges plus fine steps (Admin → Stats and Data controls → Market Bands). Band steps drive Intelligence inventory-by-price charts; rebuild Stats cache after edits.',
  },
  {
    term: 'Postgres / Neon',
    category: 'sync-admin',
    definition:
      'Primary listings database: Postgres hosted on Neon (DATABASE_URL). Shared by Netlify production and local next dev when DATABASE_URL points at Neon; a localhost DATABASE_URL is a separate non-prod store.',
  },
  {
    term: 'SQLite',
    category: 'sync-admin',
    definition:
      'File-based database used earlier for listings (and still for some local/photo fallbacks). Largely superseded by Postgres + R2 for production inventory/photos.',
  },
  {
    term: 'listings.db / listings.read.db / listings.bundle.db',
    category: 'sync-admin',
    definition:
      'Retired local SQLite paths (write DB / read replica / deploy seed). Production inventory and API reads use Neon Postgres only — Syncs “Refresh finished” stamps completion, it does not copy a SQLite file.',
  },
  {
    term: 'Upsert',
    category: 'sync-admin',
    definition:
      'Insert-or-update in one step (INSERT … ON CONFLICT DO UPDATE). How MLS rows are written so new listings insert and changed ones update.',
  },
  {
    term: 'Full sync / full resync',
    category: 'sync-admin',
    definition:
      'Pulls full Active / Closed / Expired buckets per town, then rebuilds scores and caches. Heavier than incremental; often run on a schedule or via Admin Sync all.',
  },
  {
    term: 'Incremental sync',
    category: 'sync-admin',
    definition:
      '“Modified since” RETS pull using ModificationTimestamp — Active/CS/UC plus recently modified Closed (upserted into the Closed bucket so just-sold comps appear without a full Closed sync). Netlify sync-listings (every 30m, not background) always runs a lean RETS-only pull in-process, stamps last_incremental_cron_tick, and optionally queues sync-listings-worker for board/stats warm + spotlight/alerts. Inventory freshness must never depend on that hop. Admin Sync now runs the same RETS path but does not stamp the cron tick — “Cron last fired: never” with a recent Start/End usually means a manual sync, not a missed */30. Weekly/monthly jobs use the same thin-schedule → *-worker pattern. Combining schedule+background on one Netlify function is a silent no-op (Day-1 failure mode). Admin Syncs shows the heartbeat (Fresh from Postgres); Database Next when overdue is clock-slot math (:00/:30), not proof cron ran.',
  },
  {
    term: 'Next override (spinner)',
    category: 'sync-admin',
    definition:
      'Admin Syncs → Configure: Frequency picklist + Start time (ET) + per-job Scheduler radio (Netlify cron | EventBridge) persist in sync_meta (sync_schedule_config). Netlify wakes every 30m; handlers run only when due and only when Scheduler is Netlify. EventBridge jobs use eventbridge-sync-ingress instead. Next start is read-only (computed). Order ▲/▼ sets Sync all priority — Incremental is included. Dashboard shows Scheduler read-only; Next ▲/▼ still writes one-time sync_next_override_<job> (clears after a successful run).',
  },
  {
    term: 'Smart sync',
    category: 'sync-admin',
    definition:
      'Chooses incremental vs full based on staleness (e.g. full when the last full sync is too old).',
  },
  {
    term: 'sync_meta',
    category: 'sync-admin',
    definition:
      'Key/value store of operational timestamps and flags (last_full_sync, last_incremental_sync, pause, locks, site config).',
  },
  {
    term: 'stats_cache',
    category: 'sync-admin',
    definition:
      'Postgres table of precomputed JSON payloads (market stats, vintage charts, Latest feeds, deal boards, IF/UAG caches) so pages don’t recompute from raw listings every request. Market rebuild upserts in place (no wipe); hourly cron is stale-only; incremental sync refreshes changed towns.',
  },
  {
    term: 'stats_cache_rebuild_lock',
    category: 'sync-admin',
    definition:
      'Durable sync_meta lock (ISO start time) so only one stats_cache rebuild runs across Lambdas. Stolen after ~20 minutes if a holder dies mid-run. Admin Syncs / background stats-cache worker steals immediately (force) so a Next.js timeout cannot leave the row stuck at “0 entries”.',
  },
  {
    term: 'Months supply (cached)',
    category: 'sync-admin',
    definition:
      'Precomputed in stats_cache for every town × For Sale|For Rental × All/Homes/Multi/Condos (plus All Towns). Formula: active count ÷ trailing 3-month average closings for that slice. Rebuilt with the stats cache; extra filters may adjust the numerator after listings load using the cached average — never recomputed as a page-blocking step.',
  },
  {
    term: 'refresh_in_progress / refresh lock',
    category: 'sync-admin',
    definition:
      'Global busy flag while a heavy sync or stats rebuild runs (tracked in lib/listings-refresh-status.ts — formerly sqlite-refresh-status). Sources include incremental, full-sync, full-sync-chunked, and stats-cache. Admin POSTs for most actions return 409 while the lock is held. On Intelligence, unlocked admins see the last/current kind next to Live.',
  },
  {
    term: 'WAITING (Admin sync queue)',
    category: 'sync-admin',
    definition:
      'Status when you click Sync now while another job is running (or still in its retry window). Jobs queue in click order; status reads “Waiting for {name} to finish.” The blocker keeps the slot until success or its last retry — queued jobs do not start during the 60s retry delay.',
  },
  {
    term: 'FIFO',
    category: 'sync-admin',
    definition:
      'First In, First Out — the Admin sync queue runs queued Sync now / Sync all jobs in the order you pressed the buttons.',
  },
  {
    term: 'instrumentation.ts',
    category: 'sync-admin',
    definition:
      'Next.js startup hook that schedules background sync/warm timers in the Node process (more reliable locally than on short-lived serverless).',
  },
  {
    term: 'Netlify',
    category: 'sync-admin',
    definition:
      'Host for the public Next.js site (tmrebuilder.com) and serverless functions — not photo storage (R2), not Postgres (Neon), and not the Incremental RETS puller (Railway mls-sync). Watches GitHub `main` with its own pipeline: Netlify build (`build:netlify` / Next plugin from netlify.toml + UI settings). Does not read railway.toml / railpack.json. See Same-repo dual deploy (Netlify + Railway).',
  },
  {
    term: 'MFA',
    category: 'sync-admin',
    definition:
      'Multi-factor authentication — a second proof of identity (usually a one-time code from an authenticator app) after password. Required when hardening the AWS account used for EventBridge Scheduler: enable MFA on the AWS root user (account email → Security credentials → Assign MFA device), then on any IAM admin user you create for day-to-day console work. Not a TMRE app login feature.',
  },
  {
    term: 'Canonical user ID',
    category: 'sync-admin',
    definition:
      'AWS account identifier shown on the root (or account) Security credentials page — a long hex string unique to the account (not your email, not the 12-digit Account ID). Used mainly when granting S3 / object-storage access by account (ACLs, cross-account policies) so the other party can name your account unambiguously. Not needed for day-to-day EventBridge Scheduler setup; different from IAM User ID and from the 12-digit AWS Account ID.',
  },
  {
    term: 'SNS',
    category: 'sync-admin',
    definition:
      'Amazon Simple Notification Service — AWS pub/sub topics that fan out messages to subscribers (email, SMS, Lambda, HTTPS, etc.). Optional on AWS Budgets threshold alerts: you can paste an SNS topic ARN instead of (or in addition to) plain email recipients, but that needs a topic, subscription confirmation, and a topic policy allowing budgets.amazonaws.com to publish. For TMRE’s EventBridge cost guardrail, skip SNS and use Budget email recipients only unless you later want Slack/Lambda automation from the same alert.',
  },
  {
    term: 'EventBridge Scheduler',
    category: 'sync-admin',
    definition:
      'AWS alarm clock that can start TMRE sync jobs instead of (or beside) Netlify cron. Admin → Syncs → Configure has a sticky per-job Scheduler radio (Netlify cron | EventBridge); Dashboard shows it read-only. When a job is on EventBridge, Netlify thin crons skip that job. AWS hits `/.netlify/functions/eventbridge-sync-ingress` with Bearer SYNC_CRON_SECRET and JSON `{ "job": "incremental" }`. Every ingress hit stamps EventBridge last fired + result on the Dashboard (including skips and 401). Migrate Incremental first; full-resync stays doomsday-only.',
  },
  {
    term: 'EventBridge event bus',
    category: 'sync-admin',
    definition:
      'The router in the middle of AWS EventBridge: a named channel that accepts event JSON and hands each event to whichever Rules match it. Every account starts with one bus named `default` (it also receives the events AWS services emit about themselves); you can add custom buses to isolate traffic, and SaaS vendors can feed partner buses. A bus is not a queue and holds no state — nothing is stored, retried, or replayable unless you attach an Archive, and an event that matches no Rule is dropped silently. That last part is the usual reason a PutEvents call reports success while nothing happens downstream. Events carry an envelope (source, detail-type, detail, time, account, region) and a Rule matches on that shape with an event pattern, then invokes its targets. TMRE chain: EventBridge Scheduler → PutEvents onto the bus → a Rule matching source `tmre.sync` / detail-type `ScheduledSync` → API destination → the Netlify `eventbridge-sync-ingress` function. Bus, Rule, and API destination live only in the AWS console — nothing in this repo names them, so they cannot be reviewed in a diff. Cost is negligible at a 30-minute cadence (AWS-service events on the default bus are free; your own published events bill per million). Being deprecated: Incremental now runs on the always-on Railway mls-sync service and this path is slated for removal. See EventBridge PutEvents, EventBridge Scheduler, Ingress (EventBridge), Railway mls-sync.',
  },
  {
    term: 'EventBridge PutEvents',
    category: 'sync-admin',
    definition:
      'AWS API that drops one custom event onto an EventBridge event bus (source, detail-type, detail JSON). In EventBridge Scheduler’s target picker it is the EventBridge choice for TMRE: Scheduler cannot POST straight to an external HTTPS URL, so the schedule uses PutEvents, then a bus Rule matches that event and invokes an API destination (our Netlify ingress). Different from the other Scheduler “EventBridge” / templated APIs (and from Lambda Invoke, SQS SendMessage, SNS Publish, Step Functions StartExecution, etc.): those call a concrete AWS resource you already own; PutEvents only publishes onto a bus and does nothing useful until a Rule + target (API destination) exist. Also different from classic EventBridge scheduled Rules, which can target an API destination in one hop without PutEvents. TMRE fields: source `tmre.sync`, detail-type `ScheduledSync`, detail `{ "job": "incremental" }`.',
  },
  {
    term: 'Sync now (scheduler-aware)',
    category: 'sync-admin',
    definition:
      'Admin → Syncs → Dashboard Sync now button. Uses Configure Scheduler per job: when EventBridge, queues via the EventBridge dispatch path (source=eventbridge; same worker handoff AWS uses after ingress); on queue failure falls back to the Netlify admin queue. When Netlify, queues as admin directly. Scoped Incremental (town/status picker) always uses the admin queue. Does not call AWS PutEvents — that only happens from EventBridge Scheduler or the AWS Send events console. Watch Start/End after Sync now; message text says which path queued.',
  },
  {
    term: 'EventBridge last fired',
    category: 'sync-admin',
    definition:
      'Dashboard stamp that AWS rang our doorbell (ingress HTTP hit). Not proof listings updated. Success = End moved + new MLS rows in Neon. See End (Incremental), Smoke test (sync).',
  },
  {
    term: 'Ingress (EventBridge)',
    category: 'sync-admin',
    definition:
      'The HTTPS doorway from AWS into TMRE: Netlify function `eventbridge-sync-ingress` at `/.netlify/functions/eventbridge-sync-ingress`. EventBridge Scheduler cannot POST to an arbitrary URL by itself in the templated-target UI, so the usual path is Scheduler → PutEvents → bus Rule → API destination → this ingress. Ingress checks Bearer SYNC_CRON_SECRET, requires Configure Scheduler = EventBridge for that job, then queues sync-listings-worker with source=eventbridge. The worker must treat that source like Admin (bypass Configure “not due”) — EventBridge is the clock; re-checking due after queue was a Day-1 failure mode that left Dashboard on “queued — no End yet”. Not an AWS product name — “ingress” here means our receive endpoint.',
  },
  {
    term: 'Thin cron',
    category: 'sync-admin',
    definition:
      'The short Netlify scheduled function that is only an alarm clock: `schedule` in netlify.toml (often `*/30` = every 30 minutes), no `background` flag, ~26–30s budget. On each wake it hydrates sync_meta, checks Pause / Configure due / Next override / (sometimes) already-sent watermarks, then either returns skipped or queues the matching *-worker. It is not the weekly/hourly cadence itself — Configure Frequency + Start time decide whether this wake does work. Examples: `market-digest`, `sync-listing-scores` (Goldilocks 3a), `sync-listing-edge-scores` (Edge 3b), `sync-stats-cache`, `sync-deal-of-the-day`, `sync-property-addresses`. Must never also set `background: true` on the same function (silent no-op). See Thin scheduling, Thin schedule → *-worker, Disposable 202-queued.',
  },
  {
    term: 'Thin scheduling',
    category: 'sync-admin',
    definition:
      'Dense Netlify cron alarms (usually `*/30` = every 30 minutes) that mostly wake a short-lived thin cron, check Admin Configure (due? paused? Next override?), and often exit without doing the real job. Real work is supposed to happen on a separate background *-worker. Distinct from giving each Sync Dashboard job its own true cadence on an external scheduler. See also Thin cron, Thin schedule → *-worker, and Piggybacking.',
  },
  {
    term: 'Thin schedule → *-worker (thin worker pattern)',
    category: 'sync-admin',
    definition:
      'Netlify cron split: a thin cron (≤~30s, schedule only — no background flag) does almost nothing except queue a matching *-worker background function (≤~15m, background = true — no schedule). Example: market-digest → market-digest-worker; sync-listings-full → sync-listings-full-worker. Reason: Netlify forbids schedule + background on the same function (silent no-op / Day-1 failure). The thin half is the alarm clock; the worker does the real RETS/stats/digest work. sync-listings is a special case: the thin cron also runs a lean in-process RETS pull so inventory freshness does not depend on the worker hop succeeding. Part of thin scheduling.',
  },
  {
    term: 'Why cron is not inside the Netlify host',
    category: 'sync-admin',
    definition:
      'The public site on Netlify is not an always-on Node process you can hang a setInterval/cron on. Each page/API hit is a short-lived serverless invocation that dies when the request ends — there is no durable “host” left running between visitors. Netlify’s scheduler therefore wakes a separate scheduled function (thin cron), which is itself another short Lambda (~26–30s wall clock). Heavy RETS/stats work needs a second hop: a background *-worker (~15m). You cannot put schedule + background on one function (silent no-op). That is why “cron inside the website host” is not available here, and why the thin → worker split (or Railway mls-sync) exists. See Thin schedule → *-worker, Background worker (*-worker), Disposable 202-queued, SSR request budget.',
  },
  {
    term: 'Piggybacking (sync)',
    category: 'sync-admin',
    definition:
      'When a Sync Dashboard job has no dedicated cron of its own and only runs inside another job’s worker. Main example: stats-cache and publish-snapshot (Refresh finished) are offered only via overdue catch-up inside the incremental sync-listings-worker (`onlyJobs: [\'stats-cache\', \'publish-snapshot\']`), not a standalone scheduled function. If the incremental hop is paused, skipped, or the nested queue fails, the piggybacked job can stay Overdue for days even though Configure says it is due. Incremental post-hooks that rebuild stats only for towns with upserts are a softer form of the same dependence.',
  },
  {
    term: 'Watchdog (sync)',
    category: 'sync-admin',
    definition:
      'A Netlify schedule (every ~15 minutes) that re-queues Incremental if the finished-pull clock (End) is missing or older than ~70 minutes. Plain English: if the main alarm/worker path did not finish, try again. It is a safety net — if you need it constantly, the primary path is broken. Under EventBridge it must still run when End is stale (standing it down left End null with no recovery). See End (Incremental), Smoke test (sync).',
  },
  {
    term: 'Start (Incremental)',
    category: 'sync-admin',
    definition:
      'Dashboard clock: when a pull was last queued (Admin Sync now, cron, EventBridge, or watchdog). Advancing Start only means “we asked for a run,” not that MLS data landed. Pair with End.',
  },
  {
    term: 'End (Incremental)',
    category: 'sync-admin',
    definition:
      'Dashboard / /latest “Last pull” clock: when an Incremental RETS pull last finished writing to Neon (sync_meta last_incremental_sync). This is the inventory-freshness stamp. EventBridge “last fired” is not a substitute. On Railway, a live heartbeat with a stale End is STALE (process up, pull not finishing) — not the same as BROKEN (process dead).',
  },
  {
    term: 'End wipe',
    category: 'sync-admin',
    definition:
      'Bug/pattern where code deleted last_incremental_sync at the start of a pull so the Dashboard looked “in flight,” then never wrote a new End if the worker died. Left End null and made /latest fall back to an old full-sync time (looked like July). Fixed by keeping the prior End until a new finish overwrites it. See End (Incremental).',
  },
  {
    term: 'State heal / orphan heal',
    category: 'sync-admin',
    definition:
      'Cleanup when Admin shows a stuck “queued” or open Start after AWS/Netlify accepted a job but no End arrived — clear the stale “in progress” flags and mark ingress as orphaned so the row is not pink forever. Healing the UI is not the same as pulling MLS data; Sync now or the watchdog must still run a real finish. See Watchdog (sync).',
  },
  {
    term: 'Incremental health split',
    category: 'sync-admin',
    definition:
      'Two clocks, not one. Process = last_mls_sync_heartbeat (Railway mls-sync up?). Inventory = last_incremental_sync End (did a pull finish?). Pink BROKEN is process-dead on Railway (~45m without heartbeat) or End-broken on legacy Netlify/EventBridge. Live process + old End is STALE, not pink. Overdue Next is text, not row color. Shared evaluator: lib/incremental-sync-health.ts. See Hard broken state (BROKEN), End (Incremental), Railway mls-sync.',
  },
  {
    term: 'Hard broken state (BROKEN)',
    category: 'sync-admin',
    definition:
      'Admin Incremental pink row. EventBridge/Netlify: End missing or older than ~70 minutes, or AWS queued with no End past the hang window. Railway: pink only when last_mls_sync_heartbeat is older than ~45 minutes (process dead). A live heartbeat with a stale End is Status STALE, not pink. Overdue Next is clock text, not row color. Operator: if BROKEN, check Railway deploy /health; if STALE, the puller is up but last_incremental_sync is not moving — Sync now after MLS_SYNC_SERVICE_URL is https://…, then confirm End moved.',
  },
  {
    term: 'Last pull (Latest page)',
    category: 'sync-admin',
    definition:
      '/latest header label for End (last_incremental_sync) only. Must not fall back to last full sync — that hid a broken Incremental behind a July date. Missing End → Last pull MISSING. End older than ~70m → Last pull {age} · stale (not “broken”). Fresh End → Last pull {age}. “Newest MLS update” is a different clock (listing event times in the feed), not proof of a fresh pull.',
  },
  {
    term: 'Smoke test (sync)',
    category: 'sync-admin',
    definition:
      'Go-live check after changing Incremental scheduler (e.g. to EventBridge): within one cycle, (1) End moves to minutes ago, (2) a known brand-new MLS# from SmartMLS appears in Neon//latest. AWS “last fired” alone is not a pass. CLI: `npm run smoke:incremental -- --mls=24196609,24196740` (optional `--max-age-min=70`, `--require-eb`). Exit 0 only when End is fresh and every MLS# is in Neon. Fail either check → do not call the cutover successful.',
  },
  {
    term: 'Background worker (*-worker)',
    category: 'sync-admin',
    definition:
      'A Netlify function with background = true and no schedule. Invoked by its thin scheduled twin (or Admin Run). Has up to ~15 minutes for heavy work (full sync, address geocode, edge scores, zip boundaries, market digest, board/stats warm). Not the same as the Admin Syncs client FIFO queue.',
  },
  {
    term: 'Disposable 202-queued',
    category: 'sync-admin',
    definition:
      'HTTP 202 Accepted (“queued”) from Netlify/EventBridge ingress or a thin cron wake. Only means the doorbell rang / the background invoke was accepted — not that RETS ran or Neon got rows. Disposable as a health signal: ignore it for peace of mind. Trust End (last_incremental_sync), upsert counts, a known new MLS# in listings, and (on Railway) last_mls_sync_heartbeat. Smoke test (sync) is the pass/fail check.',
  },
  {
    term: 'sync-listings-worker',
    category: 'sync-admin',
    definition:
      'Legacy Incremental puller: Netlify background Lambda at /.netlify/functions/sync-listings-worker. Being replaced by Railway mls-sync for Incremental. A 202 “queued” only meant the wake was accepted; success is End + rows in listings. Prefer Railway service (scheduler radio).',
  },
  {
    term: 'Same-repo dual deploy (Netlify + Railway)',
    category: 'sync-admin',
    definition:
      'One GitHub repo (`tmre-website` / `main`), two independent deploy pipelines — they do not share a build brain. Netlify (site): watches main → Netlify build (`build:netlify` / Next plugin from netlify.toml / UI) → tmrebuilder.com. Railway (mls-sync): watches the same repo → railway.toml + railpack.json (Railpack builder) → install deps → start `npm run start:mls-sync` — no Next site build. Push to main can trigger both. Netlify ignores Railway config; Railway ignores netlify.toml. See Netlify, Railway mls-sync, Railpack.',
  },
  {
    term: 'Railway mls-sync',
    category: 'sync-admin',
    definition:
      'Always-on Node service (services/mls-sync) on Railway that pulls SmartMLS RETS and writes Neon on its own schedule (~30m) and via POST /run. Netlify is not in the pull path — the website only reads Neon End/heartbeat. Its job stops at the Neon write: the process sets `MLS_SYNC_SERVICE=1` at boot and `runIncrementalSyncListingsWork` reads that to force `postHooks: false`, so deal board / latest feeds / heroes / stats never warm inside this process no matter who asked for the run — Admin “Sync now” and the watchdog POST /run with their own `source`, and those runs stay just as lean. It instead queues a Side-work-only worker on Netlify to do that warm. Admin Configure → Incremental → Railway service. Env: MLS_SYNC_SERVICE_URL on Netlify; on Railway Variables: DATABASE_URL + RETS_* + SYNC_CRON_SECRET (+ optional MLS_SYNC_INTERVAL_MS, + NEXT_PUBLIC_SITE_URL so the warm handoff can find the site). RETS sessions close themselves — every call goes through the library’s auto-logout client, so there is no lingering login to clean up. Smoke: npm run smoke:incremental -- --mls=…. Build: Railpack + railpack.json (Node 20, npm install, skip Next) + railway.toml start/health — not a Netlify/Next deploy. If /health returns Railway’s 502 “Application failed to respond,” check deploy logs for Node OOM before assuming a bad PORT bind. Note the Admin pause / Next / “not due” gates do not apply to it: Railway counts as an explicit run and is its own clock. See Same-repo dual deploy (Netlify + Railway), Railpack, Node OOM, postHooks, Side-work-only.',
  },
  {
    term: 'OOM',
    category: 'sync-admin',
    definition:
      'Out of memory — the process (or host) ran out of RAM and was killed or crashed. Generic term; on this project the usual form on Railway mls-sync is a Node OOM (V8 JavaScript heap), not the Linux OOM killer. Symptom chain: process dies → nothing listens on PORT → Railway edge 502 “Application failed to respond” → restart → often “refresh already in progress” skip + false ok=true until the lock clears. Fix by lowering peak memory (stop loading huge JSON / board+hero warm in the sync worker) or raising RAM / NODE_OPTIONS --max-old-space-size. See Node OOM, Railway mls-sync.',
  },
  {
    term: 'Node OOM',
    category: 'sync-admin',
    definition:
      'Node.js / V8 JavaScript heap exhaustion: log line `FATAL ERROR: … Allocation failed - JavaScript heap out of memory` (often “Ineffective mark-compacts near heap limit”), with GC chatter around ~475–490 MB and a native stack through `JsonParse` / `Builtin_JsonParse`. Distinct from the OS OOM killer. On Railway mls-sync this has crashed the process after heavy post-pull warm (deal-board ~1450 listings, latest-hero RETS fetches) while the same heap still holds sync payloads — process restarts, /health 502s until listen is back, and boot ticks can skip Incremental because a refresh lock was left held. Prefer stripping or hard-capping warm work on mls-sync (RETS→Neon only) over only bumping heap size — which is now what the code does: `postHooks: false` on `source === \'railway\'` keeps board/stats warm out of the puller entirely, so the heap only ever holds one job’s payloads. See OOM, Railway mls-sync, postHooks.',
  },
  {
    term: 'postHooks',
    category: 'sync-admin',
    definition:
      'The switch on `syncIncrementalListings` that decides whether site caches warm in the same process that just pulled RETS. `true` (Netlify worker, Admin) runs the warm chain after the Neon upserts: latest town feeds, hero thumbnails, intelligence deal board, per-town stats cache. `false` stops at the Neon write and logs a `post-hooks-skip` step. It is the seam between “get the data” and “make the site fast,” and the reason the two now live in different hosts: Railway mls-sync sets it false so its heap only ever holds the pull, which is what ended the Node OOM crash loop. Netlify’s ≤30s scheduled fallback also sets it false for a different reason — no time. See Railway mls-sync, Node OOM, Side-work-only, Seam.',
  },
  {
    term: 'Side-work-only',
    category: 'sync-admin',
    definition:
      'A worker run that skips RETS entirely and does just the warm and digest half: latest town feeds, intelligence deal board, stats cache, spotlight statuses, saved-search alerts. Queued as `sideWorkOnly: true` on `/.netlify/functions/sync-listings-worker`. Two callers use it — Netlify’s thin cron after a lean in-process pull, and Railway mls-sync handing warm back to Netlify once its Neon write is done. If that handoff fails (missing NEXT_PUBLIC_SITE_URL / SYNC_CRON_SECRET on Railway, or a password gate), nothing breaks permanently: boards rebuild on the next stale read and digests catch up on the following run. Look for a `warm-handoff` step in the incremental step log to see which way it went. See postHooks, Railway mls-sync.',
  },
  {
    term: 'MLS_SYNC_SERVICE_URL',
    category: 'sync-admin',
    definition:
      'Netlify env var: public base URL of the Railway mls-sync service (no trailing slash). Prefer `https://…up.railway.app`. Host-only values are accepted and normalized to https. Admin Sync now and the Incremental watchdog POST /run here when Incremental Scheduler is Railway.',
  },
  {
    term: 'Railpack',
    category: 'sync-admin',
    definition:
      'Railway’s current default image builder (UI: Builder = Railpack). Successor to Nixpacks — when Railpack is selected, root nixpacks.toml is ignored; use railpack.json (+ railway.toml for start/health). Docs call out that cache mounts cannot be cleared by install scripts (EBUSY if you try). For mls-sync: Node 20, python/build-essential for node-expat, install = npm install (not npm ci), build = echo skip (must not run Next `npm run build`), start = npm run start:mls-sync. Leave UI Build Command empty or echo-skip; never npm ci. See EBUSY node_modules/.cache (Railway), Same-repo dual deploy (Netlify + Railway).',
  },
  {
    term: 'Nixpacks',
    category: 'sync-admin',
    definition:
      'Older Railway image builder (maintenance mode). Day-1 mls-sync mistake: assuming nixpacks.toml + railway.toml builder=NIXPACKS controlled the deploy while the UI showed Builder = Railpack — Railpack won and ignored Nixpacks config (including npm ci / Node pinning attempts). Prefer Railpack + railpack.json. See Railpack.',
  },
  {
    term: 'EBUSY node_modules/.cache (Railway)',
    category: 'sync-admin',
    definition:
      'Build fail (errno -16) when a script tries to rmdir /app/node_modules/.cache while Railpack has that path locked as a cache mount — Railpack docs warn about this. Common trigger: npm ci (wipes node_modules). Fix for mls-sync: railpack.json install = npm install; build = skip Next; never put npm ci in UI Build Command. Optional one-shot: NO_CACHE=1 then redeploy. Same log filename timestamp as an earlier fail often means an old deployment — check the commit SHA on the deploy card. See Railpack, npm ci.',
  },
  {
    term: 'node-expat',
    category: 'sync-admin',
    definition:
      'Native Node addon (C++/node-gyp) used for XML parsing on the SmartMLS RETS path (dependency of rets-client). Install must compile it on the host — needs Python + a C++ toolchain, not just Node. On Railway, missing Python is a hard build fail; AWS SDK “Unsupported engine” lines in the same log are usually warnings. See Railpack, npm ci.',
  },
  {
    term: 'EBADENGINE (npm)',
    category: 'sync-admin',
    definition:
      'npm warning that the current Node version is below a package’s engines field (e.g. @aws-sdk/* wanting ≥20 while the builder is on 18). Often non-fatal by itself — the Railway mls-sync Day-1 red herring next to the real node-expat / Python failure. Fix by pinning Node 20 in railpack.json (Railpack), not by removing the AWS SDK.',
  },
  {
    term: 'Lambda / serverless function',
    category: 'sync-admin',
    definition:
      'Short-lived Netlify/AWS process per request. Each gets its own /tmp; cold starts need DB reconnect / photo backends ready.',
  },
  {
    term: 'Cold start',
    category: 'sync-admin',
    definition:
      'A new Lambda instance that has empty /tmp until the app reconnects to Postgres / restores any local artifacts.',
  },
  {
    term: 'Hydrate (DB in prod)',
    category: 'sync-admin',
    definition:
      'Restore durable state so a serverless instance can serve listings (historically SQLite blob restore; now primarily Neon Postgres connectivity).',
  },
  {
    term: 'Netlify Blobs',
    category: 'sync-admin',
    definition:
      'Netlify object storage. Used historically to shuttle whole SQLite files between Lambdas; photo path prefers R2 when configured.',
  },
  {
    term: 'WAL',
    category: 'sync-admin',
    definition:
      'Write-Ahead Log — SQLite durability mode. Must checkpoint before blobbing a DB file or unsynced writes are lost.',
  },
  {
    term: 'ENOSPC',
    category: 'sync-admin',
    definition:
      '“No space left on device.” Letters: E + NOSPC, where the E is just “error” (the prefix on every POSIX errno macro) and NOSPC is a squeezed “no space” — errno 28 on Linux, which libuv/Node may report negated as -28. Not an acronym; see errno (E-prefixed codes). On TMRE it was hit when /tmp (~512 MB on Netlify) couldn’t hold write DB + read-snapshot at once.',
  },
  {
    term: 'GLIBC mismatch',
    category: 'sync-admin',
    definition:
      'Native modules built on a newer Linux than Lambda supports — SQLite/RETS fail even with good credentials.',
  },
  {
    term: 'jsonb (Postgres type)',
    category: 'sync-admin',
    definition:
      'Postgres’ binary, decomposed JSON type — parsed and stored as a structure rather than as the text you sent. Costs slightly more on write than the plain `json` type, and is far faster to read, operate on, and index, which is why every JSON column here is jsonb. Trade-off versus `json`: jsonb discards insignificant whitespace, does not preserve key order, and keeps only the last of duplicate keys, so it is not a byte-exact round trip of the original document. Operators in daily use: `->` returns jsonb, `->>` returns text (the form all over lib/db/listings-repo.ts, e.g. raw->>\'ParcelNumber\'), `#>` / `#>>` walk a path, `@>` tests containment, `?` tests key existence. Indexing options are GIN for containment/existence across arbitrary keys (jsonb_path_ops is smaller and faster but supports only @>) or a plain B-tree expression index on one extracted key such as ((raw->>\'ParcelNumber\')) — usually the cheaper answer. TMRE deliberately runs NO GIN index on listings.raw: 0001_init.sql leaves idx_listings_raw_gin commented out because B-tree indexes on promoted typed columns cover every current query. Write semantics worth knowing: there is no partial in-place update. jsonb_set builds a whole new document, so touching one key rewrites the entire value, which defeats HOT and drives bloat — and values over roughly 2 KB get TOASTed (compressed and stored out-of-line in a side table). Columns here: listings.data + listings.raw, stats_cache.payload, visitors.geo / pages, zip_boundaries.rings, saved_search_alerts.criteria, plus the scoring breakdowns. See jsonb / raw, GIN (Postgres), Heap-only tuple (HOT).',
  },
  {
    term: 'GIN (Postgres)',
    category: 'sync-admin',
    definition:
      'Generalized Inverted Index on jsonb. Helps containment/search; costly on frequent RETS upserts if overused.',
  },
  {
    term: 'Heap-only tuple (HOT)',
    category: 'sync-admin',
    definition:
      'Heap = a table’s own storage pages (as opposed to its indexes). Tuple = one physical version of a row. A heap-only tuple is a new row version written into the same heap page as the version it replaces, linked from it by a pointer (t_ctid), with NO new index entries added — the existing index entries still point at the original tuple and readers follow the chain inside the page. It is “heap-only” because that version exists solely in the heap and no index knows it is there. Requirements: the UPDATE changed no indexed column, and the new version fits on the same page (hence fillfactor). Break either and you get an ordinary update plus a fresh entry in every index on the table, which is where index bloat and write amplification come from. Bonus: dead HOT versions can be reclaimed by page pruning during ordinary reads and writes, without waiting for VACUUM. Check the ratio with n_tup_hot_upd against n_tup_upd in pg_stat_user_tables. On TMRE this matters because Incremental upserts (ON CONFLICT DO UPDATE) rewrite listings rows every ~30 minutes against a table carrying several indexes. See HOT update, GIN (Postgres), Why “update a tuple” is not a contradiction.',
  },
  {
    term: 'Why “update a tuple” is not a contradiction',
    category: 'sync-admin',
    definition:
      'It does sound like one, and the instinct behind the objection is correct: a tuple really is immutable once written. Postgres never modifies a row in place. Under MVCC (multi-version concurrency control) an UPDATE writes a brand-new tuple and merely stamps the old one as dead (xmax = the updating transaction), so transactions that started earlier keep reading the old version and no reader is ever blocked by a writer. What gets updated is therefore the ROW — a logical identity that may be represented by many tuples over its lifetime — while each TUPLE is a single immutable snapshot of that row. “Tuple update” is shorthand for “an update to a row, which produced another tuple”. Postgres docs frequently say “row version” instead of tuple for exactly this reason, and the word tuple itself is inherited from relational theory, not from Python’s immutable tuple type (which happens to carry the same immutability, differently motivated). Two consequences worth remembering: an UPDATE costs about as much as an INSERT, and dead versions accumulate until VACUUM or page pruning reclaims them, which is what table bloat is. See Heap-only tuple (HOT).',
  },
  {
    term: 'HOT update',
    category: 'sync-admin',
    definition:
      'Postgres heap-only tuple update that skips index maintenance when indexed columns don’t change. Rewriting raw jsonb often prevents HOT. See Heap-only tuple (HOT) for the mechanism.',
  },
  {
    term: 'EAV',
    category: 'sync-admin',
    definition:
      'Entity–Attribute–Value model for sparse metadata. Flexible but slower for comps UI than typed edges + precomputed cache.',
  },
  {
    term: 'Admin',
    category: 'sync-admin',
    definition:
      'Internal /admin console for sync, schemas, site controls, photo health, credentials, Stats inventory, and this Glossary.',
  },
  {
    term: 'Freshness',
    category: 'sync-admin',
    definition:
      'How up-to-date photos, listings, and caches are versus the MLS.',
  },

  // —— Scoring ——
  {
    term: 'Goldilocks score',
    category: 'scoring',
    definition:
      '0–100 composite ranking (age, condition, finishes, PPSF fit, layout, schools, DOM) — “not too cheap, not overpriced.” Persisted on listings.goldilocks_* and read by Intelligence. DOTD currently rescores a 500-listing peer cap into a frozen cache (deal-of-the-day:v7) on its own schedule — same formula, different snapshot. Consolidation: DOTD should pick from the Intelligence-scored board instead of scoring twice.',
  },
  {
    term: 'PPSF',
    category: 'scoring',
    definition:
      'Price per square foot — a Goldilocks factor and a common listing metadata column.',
  },
  {
    term: 'Score breakdown',
    category: 'scoring',
    definition:
      'Per-factor Goldilocks component scores and weights stored with the composite.',
  },
  {
    term: 'Board peers / peer scoring',
    category: 'scoring',
    definition:
      'Scoring a listing relative to similar Active inventory in the same town / peer pool.',
  },
  {
    term: 'Edge score',
    category: 'scoring',
    definition:
      'Similarity/fit score from metadata (town, zip, year, beds, baths, sqft, condition signals) used to rank comps; stored in listing_edge_scores.',
  },
  {
    term: 'Edge scores',
    category: 'sync-admin',
    definition:
      'Sync Dashboard step 3b — rebuild of listing_edge_scores. Own Configure Frequency / Start / Pause / Scheduler (job id `edge-scores`), own End stamp `last_listing_edge_scores`, and Netlify thin cron `sync-listing-edge-scores` → `sync-listing-edge-scores-worker`. Uncoupled from Goldilocks (3a / `listing-scores` / `last_listing_scores`). Also runs as a full-resync finalize step. See Edge score, Thin cron, Goldilocks score.',
  },
  {
    term: 'Superlatives',
    category: 'scoring',
    definition:
      'Short uniqueness phrases for a home vs peers in town/zip (cached; schools alone are not treated as unique).',
  },
  {
    term: 'Vintage edge',
    category: 'scoring',
    definition:
      'If a home sits near the edge of its vintage span, comps matching may also include the bordering vintage bucket.',
  },
  {
    term: 'Edges (comps graph)',
    category: 'scoring',
    definition:
      'Stored subject→related relationships with rank/score/payload — the preferred “relative property” store vs pure EAV.',
  },
  {
    term: 'avg-score-by-vintage',
    category: 'scoring',
    definition:
      'Cached mean Active Goldilocks score per vintage bucket (per town × sale/rental) in stats_cache — for later “best value vintage” surfacing.',
  },

  // —— Photos / CDN ——
  {
    term: 'CDN',
    category: 'photos-cdn',
    definition:
      'Content Delivery Network — edge caches that serve bytes near the visitor so origin (Lambda) isn’t on every image view. Today Netlify may cache the proxy; a public R2 hostname is a later option.',
  },
  {
    term: 'Cloudflare R2',
    category: 'photos-cdn',
    definition:
      'S3-compatible object storage for listing photo bytes (often $0 egress to Cloudflare). Private API today; clients still use the stable /api/listings/…/photos/… proxy.',
  },
  {
    term: 'Photo warming',
    category: 'photos-cdn',
    definition:
      'Prefetch listing images into R2 (or the SQLite photo fallback) so page requests don’t hit RETS on first view.',
  },
  {
    term: 'Bounded warm',
    category: 'photos-cdn',
    definition:
      'Warm with hard caps: scope (e.g. Latest heroes), depth (hero only), volume (e.g. ≤48 RETS fetches/cycle), concurrency (e.g. 2).',
  },
  {
    term: 'Cold gap (photos)',
    category: 'photos-cdn',
    definition:
      'Active listings that report photoCount > 0 but have zero stored photos in R2/index — the Admin → R2 → Listing photo health metric.',
  },
  {
    term: 'Hero (photo)',
    category: 'photos-cdn',
    definition:
      'Lead thumbnail (usually photo index 0) in list rows — not the marketing “hero section” unless stated.',
  },
  {
    term: 'Photo 404 / ?fetch=1',
    category: 'photos-cdn',
    definition:
      'Cache miss returns 404; UI retries with ?fetch=1 to pull Media CDN (or RETS for display thumbs) into R2. Bare 404s must not be CDN-cached as if they were the final image.',
  },
  {
    term: '?size=full',
    category: 'photos-cdn',
    definition:
      'Gallery / full-view photo proxy flag. Serves full MediaURL from the MLS CDN (not RETS Thumbnail objects) and refuses undersized thumb cache hits.',
  },
  {
    term: 'listing-photos.db',
    category: 'photos-cdn',
    definition:
      'Former local SQLite BLOB store for photos; used when R2 is not configured.',
  },
  {
    term: 'Photo TTL',
    category: 'photos-cdn',
    definition:
      'Admin-tunable minutes for how long a warmed photo is considered fresh before the warm path may refresh it (does not delete R2 objects by itself). Editable under Admin → Syncs → Listing photo TTL.',
  },
  {
    term: 'File sharding',
    category: 'photos-cdn',
    definition:
      'Splitting photos across many local files/folders on disk. Contrasted with R2, which keeps bytes in the cloud.',
  },

  // —— UI / tabs ——
  {
    term: 'Sold / Rented tabs',
    category: 'ui-tabs',
    definition:
      'Listing subnav tabs for recently closed comps vs currently on-market matches (Sold | Rented).',
  },
  {
    term: 'For Sale On Market',
    category: 'ui-tabs',
    definition:
      'Active / Coming Soon for-sale comps shown beside Recently Sold on the Sold tab. On mobile, SOLD (n) / ON THE MARKET (n) sub-tabs switch panes; Criteria stays on the same row.',
  },
  {
    term: 'Criteria',
    category: 'ui-tabs',
    definition:
      'Match rules shown above Sold/Rented/What if panels (zip, beds ±, baths ±, vintage, sqft, lot). Bracket tokens expand to numeric bounds when clicked.',
  },
  {
    term: 'UAG / Under Agreement',
    category: 'ui-tabs',
    definition:
      'Tab of under-contract comps (“Under Contract” / CTS), split For Sale vs Rentals; resolved on demand with cache, not full bulk sync of every UC listing.',
  },
  {
    term: 'IF / What if',
    category: 'ui-tabs',
    definition:
      'Tab that estimates sale and rent ranges from matched comps and shows the math and properties that fed each estimate.',
  },
  {
    term: 'Spotlight',
    category: 'ui-tabs',
    definition:
      'Curated property slots (#1–#5) with privacy controls (hide address/photos/map) managed in Admin → Spotlight. Assign by MLS # only.',
  },
  {
    term: 'Spotlight Safety',
    category: 'ui-tabs',
    definition:
      'Don’t let a stale Closed sale win over a live listing at the same address — not “never show Closed.” Admin pins Spotlight by MLS # (any status); the site does not auto-pick from street address. Full rule set is published on Admin → Spotlight (Spotlight rules panel).',
  },
  {
    term: 'Spotlight display order',
    category: 'ui-tabs',
    definition:
      'Admin → Spotlight can reorder the public property rail (e.g. show #5 first) without changing slot ids. Property #5 stays #5 (same MLS, privacy, ?property=5 bookmarks). Public page polls /api/spotlight/tabs for a version stamp every ~18s.',
  },
  {
    term: 'Deal of the Day / Week',
    category: 'ui-tabs',
    definition:
      'Featured high-score listing surfaces (homepage / Intelligence), backed by stats_cache payloads.',
  },
  {
    term: 'Latest',
    category: 'product',
    definition:
      'Public /latest (“30 on 30”): up to 30 event rows only — Coming Soon, New, Back on Market (Active after Coming Soon / UC / UC-CTS / Temp off market), Reduced, or Increased. Reduced/Increased require MLS PriceChangeTimestamp within 36h and use the most recent ask→ask move (stats_cache key listing-price-change:v1:{id}, $ + %; a later move overwrites). New ranks by list date; CS/BOM by status-change. ModificationTimestamp bumps never earn a slot or move a row into “today.” Under Contract / UC-CTS and Pending never appear. Fills today’s Eastern-day events first (event clock desc), then the prior day. Rules live in lib/latest-status-rules.ts (Admin → Architecture → Latest rules). Does not call RETS on page view — reads Postgres / a prebuilt feed cache (max ~45m) rebuilt after Incremental. Signup for listing alerts also lives on /latest.',
  },
  {
    term: 'Thin corpus (Find)',
    category: 'product',
    definition:
      'When /find typeahead can only match a narrow searchable set — historically MLS rows in the listings table — so suggestions feel sparse even if the API is fast. /find is Westport Lookup: typeahead is vision_addresses (cadastral) plus Westport MLS streets that GIS has not ingested yet. Off-market parcels open /find/westport/{vision_pid} with the Vision field card on the page; on-market rows merge listing-wins + Vision gap-fill. Incomplete GIS fill no longer hides MLS addresses. Not the same as thin scheduling (Netlify cron alarm clocks).',
  },
  {
    term: 'Intelligence',
    category: 'ui-tabs',
    definition:
      'Market / deal board with filters, town snapshots, scored listings, and Deal of the Day. Board scores come from listings.goldilocks_* (Lane 3 warm). Homepage / DOTD page read a separate frozen cache that is not rebuilt on that warm — that is why the same MLS can show two numbers.',
  },
  {
    term: 'Intelligence middle tier',
    category: 'ui-tabs',
    definition:
      'Collapsible middle ~60% of the current deal-board page when sorted by Score descending (vintage filter off). Top/bottom ~20% each; collapsed board keeps ≥10 rows. Rules in Admin → Data controls → Deal board (lib/intelligence-deal-board-tiers.ts).',
  },
  {
    term: 'Visitors log',
    category: 'sync-admin',
    definition:
      'Admin → Visitors parent tab (same Admin Log in cookie). Top: Most viewed properties / pages (content_views running totals, side by side). Most viewed properties supports +/− into who viewed each listing, grouped by network provider → location (desc by views on that property). Below: visitors log grouped by provider → location or property → date with +/− drilldown (visitors table). Header “Visitors” link and legacy `/visitors` both open this tab; `/api/visitors` still requires the unlock.',
  },
  {
    term: 'List with Me',
    category: 'ui-tabs',
    definition:
      'Seller lead / address-capture flow for listing with the agent.',
  },
  {
    term: 'VisitorLocationBadge',
    category: 'ui-tabs',
    definition:
      'Zip-code pill in the main header (left of the email icon). Rotating gold border glow until first click; click opens confirm/edit ZIP popover (localStorage override + visitor location refresh for personalization).',
  },

  // —— Finance ——
  {
    term: 'FOMC',
    category: 'finance',
    definition:
      'Federal Open Market Committee — the Fed body that sets the federal funds target range (usually eight meetings a year). TMRE’s /fed-analysis page tracks the meeting calendar and prevailing rate decision for housing/mortgage context.',
  },
  {
    term: 'IF estimate',
    category: 'finance',
    definition:
      'Cached sale/rent scenario amounts (midpoint + low/high) derived from matched comps using the same match family as Sold/Rented tabs.',
  },
  {
    term: 'Weighted $/sqft',
    category: 'finance',
    definition:
      'Comp pricing method that blends price-per-square-foot across matched sold/active sets (with vintage/premium weighting) to form a subject estimate.',
  },

  // —— Product ——
  {
    term: 'TMRE',
    category: 'product',
    definition:
      'Timothy Marks Real Estate / the brand and site covering core CT towns (Norwalk, New Canaan, Westport, Wilton, Weston, Fairfield, Ridgefield).',
  },
  {
    term: 'CT coverage',
    category: 'product',
    definition:
      'Admin → Data controls → CT coverage: Postgres ct_counties / ct_towns catalog of all CT municipalities. Checking Activate opens the canonical town-activation playbook side panel before Phase 0 can save (flag only — not RETS/public yet). Each town also has a Playbook link. County thumbnails use Census TIGER outlines. Public pages still use hardcoded TMRE_TOWNS until wired.',
  },
  {
    term: 'Town activation playbook',
    category: 'product',
    definition:
      'Canonical Admin checklist for every town going forward (Phases 0–5): Activate flag → catalog/MLS codes → runtime town list → RETS + warm → product surfaces → public gate. Same process for Easton or any later county town; only Phase 0 is implemented as a save today.',
  },
  {
    term: 'BHHS',
    category: 'product',
    definition:
      'Berkshire Hathaway Home Services NE — sponsoring brokerage display name (admin Site → Brokerage name / sync_meta). Agent MLS #855109.',
  },
  {
    term: 'MVP',
    category: 'product',
    definition:
      'Minimum Viable Product — smallest shippable loop (listings sync → browse → lead email → operable Admin).',
  },
  {
    term: 'Resend',
    category: 'product',
    definition:
      'Email API used to deliver contact / list-with-me notifications.',
  },
  {
    term: 'Netlify DNS',
    category: 'product',
    definition:
      'Authoritative nameservers for tmrebuilder.com (live check 10 Aug 2026: dns1–4.p08.nsone.net / NS1). This is where apex A/CNAME, Resend SPF/DKIM TXT, and inbound MX for a mail forwarder are published. Distinct from Netlify the app host (site + Lane 3). Not Cloudflare — a Cloudflare zone may exist for R2/Email Routing UI, but the public internet does not use Cloudflare as DNS while NS stay here. See Admin → Architecture → Site architecture.',
  },
  {
    term: 'MX (Mail Exchanger)',
    category: 'product',
    definition:
      'DNS record that tells the internet where to deliver mail for a domain — “Mail Exchanger,” not “mailbox.” Format is priority + hostname (lowest priority number wins). TMRE uses Resend to send (SPF/DKIM TXT on Netlify DNS). Receiving at fred@tmrebuilder.com needs inbound MX on Netlify DNS pointing at a forwarder (ImprovMX / Forward Email / etc.) — Path B. Cloudflare Email Routing only works when Cloudflare is authoritative DNS; with Netlify DNS it can show Active in the CF UI and still never receive. See Netlify DNS, Resend, DMARC.',
  },
  {
    term: 'fred@tmrebuilder.com',
    category: 'product',
    definition:
      'Branded address intended for the FRED (St. Louis Fed) API account — unique email, not a personal mailbox. Forward to tmarkst@aol.com (or similar). Setup: inbound MX forwarder on Netlify DNS (not Cloudflare Email Routing while NS = Netlify). After confirm, store FRED_API_KEY on Netlify and use Admin → Mortgage → Refresh from FRED. See Netlify DNS, MX.',
  },
  {
    term: 'DMARC',
    category: 'product',
    definition:
      'Email authentication policy for the sending domain; new domains often land in corporate spam until reputation builds.',
  },
]

export function glossaryGrouped(): {
  category: (typeof GLOSSARY_CATEGORIES)[number]
  entries: GlossaryEntry[]
}[] {
  return GLOSSARY_CATEGORIES.map((category) => ({
    category,
    entries: ADMIN_GLOSSARY.filter((e) => e.category === category.id).sort(
      (a, b) => a.term.localeCompare(b.term),
    ),
  })).filter((g) => g.entries.length > 0)
}
