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
    term: 'Hydration (React)',
    category: 'tooling',
    definition:
      'Client React attaching to server-rendered HTML. “Hydration failed” means server text didn’t match what the client rendered (e.g. locale dates).',
  },
  {
    term: 'Turbopack',
    category: 'tooling',
    definition:
      'Next.js 16 default bundler for next dev (replaces the older webpack default for local development).',
  },
  {
    term: '“This is not the Next.js you know”',
    category: 'tooling',
    definition:
      'Project rule: this app uses a Next version with breaking changes — check node_modules/next/dist/docs/ before assuming older Next APIs.',
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
      'MLS field (ModificationTimestamp) stored per listing. Drives Latest sorting and incremental “what changed” queries. Often UTC in the feed.',
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
      'Year-built era buckets (e.g. Pre-1900, 1900–1940, 1941–1970) used in Stats, Intelligence filters, and comps matching.',
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
      'Postgres JSON column holding the flat RETS field map per listing for flexible MLS attributes.',
  },
  {
    term: 'AGENT_MLS_ID',
    category: 'mls-data',
    definition:
      'Timothy Marks’s SmartMLS / brokerage agent ID (855109), stored in lib/business-info.ts and shown next to Berkshire Hathaway attributions.',
  },

  // —— Sync / admin ——
  {
    term: 'Postgres / Neon',
    category: 'sync-admin',
    definition:
      'Primary listings database: Postgres hosted on Neon (DATABASE_URL). Can also run against local Postgres in development.',
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
      'Historical SQLite paths: write DB, read snapshot for APIs during sync, and deploy-bundled seed. Production inventory is now Postgres.',
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
      '“Modified since” RETS pull using ModificationTimestamp — only changed listings upserted. Cadence is about every 30 minutes on the Latest path.',
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
      'Postgres table of precomputed JSON payloads (market stats, vintage charts, Latest feeds, deal boards, IF/UAG caches) so pages don’t recompute from raw listings every request.',
  },
  {
    term: 'refresh_in_progress / refresh lock',
    category: 'sync-admin',
    definition:
      'Global busy flag while a heavy sync or stats rebuild runs. Admin POSTs for most actions return 409 while the lock is held.',
  },
  {
    term: 'WAITING (Admin sync queue)',
    category: 'sync-admin',
    definition:
      'Status when you click Sync now while another job is running. Jobs queue in click order; status reads “Waiting for {name} to finish.”',
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
      'Host for the Next.js app and serverless functions. Not the same as photo storage (R2) or the Postgres host (Neon).',
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
      '“No space left on device.” Hit when /tmp (~512 MB on Netlify) couldn’t hold write DB + read-snapshot at once.',
  },
  {
    term: 'GLIBC mismatch',
    category: 'sync-admin',
    definition:
      'Native modules built on a newer Linux than Lambda supports — SQLite/RETS fail even with good credentials.',
  },
  {
    term: 'GIN (Postgres)',
    category: 'sync-admin',
    definition:
      'Generalized Inverted Index on jsonb. Helps containment/search; costly on frequent RETS upserts if overused.',
  },
  {
    term: 'HOT update',
    category: 'sync-admin',
    definition:
      'Postgres heap-only tuple update that skips index maintenance when indexed columns don’t change. Rewriting raw jsonb often prevents HOT.',
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
      '0–100 composite ranking (age, condition, finishes, PPSF fit, layout, schools) — “not too cheap, not overpriced.” Persisted on listings and read by pages.',
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
      'Active listings that report photoCount > 0 but have zero stored photos in R2/index — the Admin “Listing photo health” metric.',
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
      'Cache miss returns 404; UI retries with ?fetch=1 to pull from RETS into R2. Bare 404s must not be CDN-cached as if they were the final image.',
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
      'Admin-tunable minutes for how long a warmed photo is considered fresh before the warm path may refresh it (does not delete R2 objects by itself).',
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
      'Listing subnav tabs (formerly Sales / Rentals) for recently closed comps vs currently on-market matches. Prefixed by WHAT / AND ON MARKET labels when stacked.',
  },
  {
    term: 'On market / Available Now',
    category: 'ui-tabs',
    definition:
      'Active / Coming Soon similar homes for the subject. On mobile, jump links use “Available Now(n)” for the on-market panel.',
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
      'Curated property slots (#1–#3) with privacy controls (hide address/photos/map) managed in Admin Site controls.',
  },
  {
    term: 'Deal of the Day / Week',
    category: 'ui-tabs',
    definition:
      'Featured high-score listing surfaces (homepage / Intelligence), backed by stats_cache payloads.',
  },
  {
    term: 'Latest',
    category: 'ui-tabs',
    definition:
      'Explore page of recently MLS-updated listings, fed from DB/cache after incremental sync — not live RETS per page view.',
  },
  {
    term: 'Intelligence',
    category: 'ui-tabs',
    definition:
      'Market / deal board with filters, town snapshots, scored listings, and Deal of the Day.',
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
      'Zip-code pill in the main header (left of the email icon). Planned: rotating border glow until first click; confirm/edit zip for personalization.',
  },

  // —— Finance ——
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
    term: 'BHHS',
    category: 'product',
    definition:
      'Berkshire Hathaway HomeServices — sponsoring brokerage (New England Properties). Agent MLS #855109.',
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
