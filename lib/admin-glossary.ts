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
    term: 'Bash heredoc',
    category: 'tooling',
    definition:
      'A shell quoting form that feeds a multi-line block as stdin or as an argument, commonly written `<<\'EOF\'` … `EOF` (or `<<EOF` when variables should expand). Agents and docs often use it for `git commit -m "$(cat <<\'EOF\' … EOF)"` so the message keeps newlines without messy escaping. Bash / Git Bash / WSL understand heredocs; Windows PowerShell does not — there `<<` is a redirection/parse error. On this PC use a here-string instead, e.g. `@"… "@ | Set-Content …` then `git commit -F file`, or pass multiple `-m` flags.',
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
      'MLS field (ModificationTimestamp) stored per listing — advertising/legal freshness (remarks/photos/meta). Shown small on listing/Spotlight property facts. Drives incremental RETS “what changed” pulls. Not the /latest Reduced/Increased event clock (that is PriceChangeTimestamp). Often UTC in the feed.',
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
      'Postgres JSON column holding the flat RETS field map per listing for flexible MLS attributes.',
  },
  {
    term: 'AGENT_MLS_ID',
    category: 'mls-data',
    definition:
      'Timothy Marks’s SmartMLS / brokerage agent ID (855109), stored in lib/business-info.ts and shown next to brokerage attributions.',
  },
  {
    term: 'Brokerage name',
    category: 'sync-admin',
    definition:
      'Public sponsoring-brokerage display string (default Berkshire Hathaway Home Services NE). Editable in Admin → Site without redeploy; stored in sync_meta key brokerage_name (lib/brokerage-config.ts).',
  },
  {
    term: 'Monday market brief',
    category: 'product',
    definition:
      'Weekly Resend email via Netlify market-digest cron (every 30m, gated to Configure weekly day + start time ET — default Mon 08:00) — not the MLS incremental sync. HTML bars + DOTW card; same snapshot powers /market-pulse. Send day/time live on Syncs → Configure and Communications → Monday market brief (shared Postgres sync_schedule_config); changing the day rewrites the subject day name. Run / pause on Syncs; recipient, subject `{date}`, optional social footer on Communications.',
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
      'Admin → Cookies (top-level tab): view location (Path/host/SameSite + set-by), contents (Show values), and delete cookies for your browser only (filter prefs, tmre_vid visitor id, tmre_site_pass unlock). HttpOnly cookies are listed/cleared via /api/admin/browser-cookies; unlock value stays redacted; clearing unlock logs you out.',
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
      'Host for the Next.js app and serverless functions. Not the same as photo storage (R2) or the Postgres host (Neon).',
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
      'AWS alarm clock that can start TMRE sync jobs instead of (or beside) Netlify cron. Admin → Syncs → Configure has a sticky per-job Scheduler radio (Netlify cron | EventBridge); Dashboard shows it read-only. When a job is on EventBridge, Netlify thin crons skip that job. AWS hits `/.netlify/functions/eventbridge-sync-ingress` with Bearer SYNC_CRON_SECRET and JSON `{ "job": "incremental" }`. Migrate Incremental first; full-resync stays doomsday-only.',
  },
  {
    term: 'Thin scheduling',
    category: 'sync-admin',
    definition:
      'Dense Netlify cron alarms (usually `*/30` = every 30 minutes) that mostly wake a short-lived “thin” function, check Admin Configure (due? paused? Next override?), and often exit without doing the real job. Real work is supposed to happen on a separate background *-worker. Distinct from giving each Sync Dashboard job its own true cadence on an external scheduler. See also Thin schedule → *-worker and Piggybacking.',
  },
  {
    term: 'Thin schedule → *-worker (thin worker pattern)',
    category: 'sync-admin',
    definition:
      'Netlify cron split: a thin scheduled function (≤~30s, schedule only — no background flag) does almost nothing except queue a matching *-worker background function (≤~15m, background = true — no schedule). Example: market-digest → market-digest-worker; sync-listings-full → sync-listings-full-worker. Reason: Netlify forbids schedule + background on the same function (silent no-op / Day-1 failure). The thin half is the alarm clock; the worker does the real RETS/stats/digest work. sync-listings is a special case: the thin cron also runs a lean in-process RETS pull so inventory freshness does not depend on the worker hop succeeding. Part of thin scheduling.',
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
      'A second (or third) scheduled checker that re-queues work when the primary thin schedule → worker path failed silently — e.g. sync-listings-watchdog (`*/15`) queues incremental with source=watchdog if last sync is stale and the job is not paused. Useful as a safety net; in this codebase it is also a patch over a bad architecture (dense Netlify cron, HTTP hop to background workers, pause/defer/not-due gates, piggybacked jobs). Prefer a durable external scheduler + worker per job so freshness does not depend on a watchdog covering up missed ticks. See Thin scheduling and Piggybacking.',
  },
  {
    term: 'Background worker (*-worker)',
    category: 'sync-admin',
    definition:
      'A Netlify function with background = true and no schedule. Invoked by its thin scheduled twin (or Admin Run). Has up to ~15 minutes for heavy work (full sync, address geocode, edge scores, zip boundaries, market digest, board/stats warm). Not the same as the Admin Syncs client FIFO queue.',
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
      '0–100 composite ranking (age, condition, finishes, PPSF fit, layout, schools, DOM) — “not too cheap, not overpriced.” Persisted on listings and read by pages. DOM bands are editable in Admin → Data controls → Goldilocks.',
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
      'Public /latest (“30 on 30”): up to 30 event rows only — Coming Soon, New, Back on Market (Active after Coming Soon / UC / UC-CTS / Temp off market), Reduced, or Increased. Reduced/Increased require MLS PriceChangeTimestamp within 36h (not ModificationTimestamp bumps). Fills today’s Eastern-day events first (event clock desc), then the prior day. Plain Active and Pending never appear. Rules live in lib/latest-status-rules.ts (Admin → Architecture → Status logic). Does not call RETS on page view — reads Postgres / a prebuilt feed cache rebuilt after Incremental. Signup for listing alerts also lives on /latest.',
  },
  {
    term: 'Thin corpus (Find)',
    category: 'product',
    definition:
      'When /find typeahead can only match a narrow searchable set — today mostly MLS rows already in the listings table — so suggestions feel sparse (“no / few hits”) even if the API is fast. Caveat from the Find typeahead options discussion: #3 (client-side index) and #4 (hybrid client+server) win on latency (keystroke → dropdown) but do not fix a thin corpus; they only search what you already shipped. Thickening the corpus means expanding what is searchable (e.g. #1 property-address directory covering off-market / never-listed homes), not only speeding listings-only search (#2). Not the same as thin scheduling (Netlify cron alarm clocks).',
  },
  {
    term: 'Intelligence',
    category: 'ui-tabs',
    definition:
      'Market / deal board with filters, town snapshots, scored listings, and Deal of the Day.',
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
      'Admin → Visitors parent tab (same Admin Log in cookie). Top: Most viewed properties / pages (content_views running totals, side by side). Below: visitors log grouped by network provider → location or property → date with +/− drilldown (visitors table). Header “Visitors” link and legacy `/visitors` both open this tab; `/api/visitors` still requires the unlock.',
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
      'Admin → Data controls → CT coverage: Postgres ct_counties / ct_towns catalog of all CT municipalities. Toggle active to prepare future site-wide coverage. County thumbnails use Census TIGER county outlines (same TIGERweb family as Intelligence ZCTA maps), zoomed to that county. Public pages still use hardcoded TMRE_TOWNS until wired.',
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
