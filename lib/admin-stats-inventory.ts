/**
 * Catalog of product stats / caches for the Admin Stats tab.
 * Keep in sync when adding new stats_cache keys, derived tables, or file stores.
 *
 * Mental model for the columns:
 * - **Table** — Postgres table that holds the state (e.g. `stats_cache`, `listings`).
 * - **Key pattern** — how a row is addressed *inside* that table (usually
 *   `stats_cache.cache_key`, or a listing id). This is NOT a filesystem path and
 *   usually NOT a single column name unless notes say so (e.g. goldilocks columns).
 * - **Code** — TypeScript module that reads/writes the state (`owner`).
 */

export type StatsStorageMedium =
  | 'postgres'
  | 'memory'
  | 'file'
  | 'r2'
  | 'blobs'
  | 'browser'

export type StatsInventoryCategoryId =
  | 'market'
  | 'feeds'
  | 'deals'
  | 'intelligence'
  | 'listing-derived'
  | 'photos'
  | 'sync-control'
  | 'site-data'
  | 'ephemeral'

export type StatsLiveProbe =
  | { kind: 'stats_cache_prefix'; prefix: string }
  | { kind: 'postgres_table'; table: string }
  | { kind: 'sync_meta_count' }
  /** Count of listings rows with a non-null goldilocks_score. */
  | { kind: 'goldilocks_scored' }
  | { kind: 'none' }

export type StatsInventoryEntry = {
  id: string
  name: string
  category: StatsInventoryCategoryId
  medium: StatsStorageMedium
  /** Where it lives (table, path, process Map, …). */
  location: string
  /** Key / path pattern shown in the UI. */
  keyPattern: string
  /** Owning module path. */
  owner: string
  notes?: string
  live: StatsLiveProbe
}

export type StatsInventoryCategory = {
  id: StatsInventoryCategoryId
  label: string
  description: string
}

export const STATS_STORAGE_MEDIUM_META: Record<
  StatsStorageMedium,
  { label: string; short: string }
> = {
  postgres: { label: 'Neon Postgres', short: 'Postgres' },
  memory: { label: 'Process memory', short: 'Memory' },
  file: { label: 'Local / disk file', short: 'File' },
  r2: { label: 'Cloudflare R2', short: 'R2' },
  blobs: { label: 'Netlify Blobs', short: 'Blobs' },
  browser: { label: 'Browser storage', short: 'Browser' },
}

export const STATS_INVENTORY_CATEGORIES: StatsInventoryCategory[] = [
  {
    id: 'market',
    label: 'Market & town stats',
    description:
      'Precomputed Stats / Intelligence inputs upserted by rebuildStatsCache (stale hourly cron, full sync, or per-town after incremental), including months-supply slices (town × sale/rental × property class).',
  },
  {
    id: 'feeds',
    label: 'Latest feeds',
    description:
      'Prebuilt Latest ticker and per-town feeds; market stats rebuild upserts in place (no full wipe).',
  },
  {
    id: 'deals',
    label: 'Deal of the Day / Week',
    description: 'Homepage deal selections cached in stats_cache.',
  },
  {
    id: 'intelligence',
    label: 'Intelligence',
    description: 'Deal board, town snapshots, and request-scoped in-memory filters.',
  },
  {
    id: 'listing-derived',
    label: 'Listing-derived scores & comps',
    description:
      'Goldilocks, edges, superlatives, IF/UAG, finish quality, spotlight — tables and per-listing cache rows.',
  },
  {
    id: 'photos',
    label: 'Listing photos',
    description: 'Binary photo storage plus index / health metadata.',
  },
  {
    id: 'sync-control',
    label: 'Sync control & config',
    description: 'Timestamps, pause flags, algo versions, and admin config in sync_meta.',
  },
  {
    id: 'site-data',
    label: 'Site form / visitor data',
    description: 'JSON files written by public forms and visitor tracking.',
  },
  {
    id: 'ephemeral',
    label: 'Ephemeral (memory / browser)',
    description: 'Per-instance or client-only caches — not durable across deploys.',
  },
]

export const STATS_INVENTORY: StatsInventoryEntry[] = [
  // —— Market ——
  {
    id: 'interesting-stat',
    name: 'Homepage interesting stat',
    category: 'market',
    medium: 'postgres',
    location: 'stats_cache',
    keyPattern: 'interesting-stat:home:v1 · interesting-stat:history:v1',
    owner: 'lib/interesting-stat.ts',
    notes:
      'Deep market highlight appended on each stats_cache rebuild (history ring, cap 24). Homepage rotates among recent entries ~every 45m. Browse pool on Admin → Stats.',
    live: { kind: 'stats_cache_prefix', prefix: 'interesting-stat:' },
  },
  {
    id: 'market-stats',
    name: 'Market stats',
    category: 'market',
    medium: 'postgres',
    location: 'stats_cache',
    keyPattern: 'market-stats:{town|All}:{sale|rental}',
    owner: 'lib/stats-cache.ts',
    notes: 'Active inventory medians, DOM, etc.',
    live: { kind: 'stats_cache_prefix', prefix: 'market-stats:' },
  },
  {
    id: 'market-stats-listings',
    name: 'Market median listing rows',
    category: 'market',
    medium: 'postgres',
    location: 'stats_cache',
    keyPattern: 'market-stats-listings:{town}:{sale|rental}',
    owner: 'lib/stats-cache.ts',
    live: { kind: 'stats_cache_prefix', prefix: 'market-stats-listings:' },
  },
  {
    id: 'sales-by-month',
    name: 'Sales by month',
    category: 'market',
    medium: 'postgres',
    location: 'stats_cache',
    keyPattern: 'sales-by-month:{town}:{sale|rental}',
    owner: 'lib/stats-cache.ts',
    live: { kind: 'stats_cache_prefix', prefix: 'sales-by-month:' },
  },
  {
    id: 'months-supply',
    name: 'Months supply (precomputed)',
    category: 'market',
    medium: 'postgres',
    location: 'stats_cache',
    keyPattern: 'months-supply:{town|All}:{sale|rental}:{all|homes|multi|condos}',
    owner: 'lib/months-supply-cache.ts',
    notes:
      'Required site-wide cache: every TMRE town (+ All) × For Sale|For Rental × All types|Homes|Multi-family|Condos. Formula = active inventory ÷ trailing 3-month avg closings for that same slice. RebuildStatsCache always writes these; finer filters (beds, zip, price, …) may refine the numerator after listings return using the cached avg closings — they must not block result delivery. Index key: months-supply-index:All:all.',
    live: { kind: 'stats_cache_prefix', prefix: 'months-supply:' },
  },
  {
    id: 'active-by-month',
    name: 'Active by month',
    category: 'market',
    medium: 'postgres',
    location: 'stats_cache',
    keyPattern: 'active-by-month:{town}:{sale|rental}',
    owner: 'lib/stats-cache.ts',
    live: { kind: 'stats_cache_prefix', prefix: 'active-by-month:' },
  },
  {
    id: 'sales-by-month-by-town',
    name: 'Sales-by-month town bundle',
    category: 'market',
    medium: 'postgres',
    location: 'stats_cache',
    keyPattern: 'sales-by-month-by-town:All:{sale|rental}',
    owner: 'lib/stats-cache.ts',
    live: { kind: 'stats_cache_prefix', prefix: 'sales-by-month-by-town:' },
  },
  {
    id: 'active-by-month-by-town',
    name: 'Active-by-month town bundle',
    category: 'market',
    medium: 'postgres',
    location: 'stats_cache',
    keyPattern: 'active-by-month-by-town:All:{sale|rental}',
    owner: 'lib/stats-cache.ts',
    live: { kind: 'stats_cache_prefix', prefix: 'active-by-month-by-town:' },
  },
  {
    id: 'sales-by-vintage',
    name: 'Sales by vintage',
    category: 'market',
    medium: 'postgres',
    location: 'stats_cache',
    keyPattern: 'sales-by-vintage:{town|All}:{sale|rental}',
    owner: 'lib/stats-cache.ts',
    live: { kind: 'stats_cache_prefix', prefix: 'sales-by-vintage:' },
  },
  {
    id: 'sales-by-price',
    name: 'Sales by price band',
    category: 'market',
    medium: 'postgres',
    location: 'stats_cache',
    keyPattern: 'sales-by-price:{town|All}:{sale|rental}',
    owner: 'lib/stats-cache.ts',
    live: { kind: 'stats_cache_prefix', prefix: 'sales-by-price:' },
  },
  {
    id: 'avg-score-by-vintage',
    name: 'Avg Goldilocks score by vintage',
    category: 'market',
    medium: 'postgres',
    location: 'stats_cache',
    keyPattern: 'avg-score-by-vintage:{town|All}:{sale|rental}',
    owner: 'lib/stats-cache.ts',
    notes: 'Active scored listings; also refreshed after listing-scores rebuild.',
    live: { kind: 'stats_cache_prefix', prefix: 'avg-score-by-vintage:' },
  },
  {
    id: 'avg-score-by-vintage-by-town',
    name: 'Avg-score-by-vintage town bundle',
    category: 'market',
    medium: 'postgres',
    location: 'stats_cache',
    keyPattern: 'avg-score-by-vintage-by-town:All:{sale|rental}',
    owner: 'lib/stats-cache.ts',
    live: { kind: 'stats_cache_prefix', prefix: 'avg-score-by-vintage-by-town:' },
  },

  // —— Feeds ——
  {
    id: 'latest-feed-global',
    name: 'Latest global feed',
    category: 'feeds',
    medium: 'postgres',
    location: 'stats_cache',
    keyPattern: 'latest-feed:v1:global',
    owner: 'lib/latest-feed-cache.ts',
    live: { kind: 'stats_cache_prefix', prefix: 'latest-feed:' },
  },
  {
    id: 'latest-town-feed',
    name: 'Latest town feeds',
    category: 'feeds',
    medium: 'postgres',
    location: 'stats_cache',
    keyPattern: 'latest-town-feed:v1:{town|bundle}',
    owner: 'lib/latest-town-feed-cache.ts',
    notes: 'Preserved across hourly stats_cache clears.',
    live: { kind: 'stats_cache_prefix', prefix: 'latest-town-feed:' },
  },

  // —— Deals ——
  {
    id: 'deal-of-the-day',
    name: 'Deal of the Day',
    category: 'deals',
    medium: 'postgres',
    location: 'stats_cache',
    keyPattern: 'deal-of-the-day:v5:{scope}:{kind}',
    owner: 'lib/deal-of-the-day-cache.ts',
    notes: 'Preserved across hourly stats_cache clears.',
    live: { kind: 'stats_cache_prefix', prefix: 'deal-of-the-day:' },
  },
  {
    id: 'deal-of-the-week',
    name: 'Deal of the Week',
    category: 'deals',
    medium: 'postgres',
    location: 'stats_cache',
    keyPattern: 'deal-of-the-week:v1',
    owner: 'lib/deal-of-the-week-cache.ts',
    live: { kind: 'stats_cache_prefix', prefix: 'deal-of-the-week:' },
  },

  // —— Intelligence ——
  {
    id: 'intelligence-deal-board',
    name: 'Intelligence deal board',
    category: 'intelligence',
    medium: 'postgres',
    location: 'stats_cache',
    keyPattern: 'intelligence-deal-board:v2',
    owner: 'lib/intelligence-deal-board-cache.ts',
    live: { kind: 'stats_cache_prefix', prefix: 'intelligence-deal-board:' },
  },
  {
    id: 'intelligence-town-snapshot',
    name: 'Intelligence town snapshots',
    category: 'intelligence',
    medium: 'postgres',
    location: 'stats_cache',
    keyPattern: 'intelligence-town-snapshot:v1:{town}',
    owner: 'lib/intelligence-town-snapshot.ts',
    live: { kind: 'stats_cache_prefix', prefix: 'intelligence-town-snapshot:' },
  },
  {
    id: 'intelligence-snapshot-memory',
    name: 'Filtered board snapshot cache',
    category: 'intelligence',
    medium: 'memory',
    location: 'Process Map (per Lambda instance)',
    keyPattern: '{generation}:{town}|{filters…}',
    owner: 'lib/intelligence-snapshot-cache.ts',
    notes: 'Lost on cold start; not shared across instances.',
    live: { kind: 'none' },
  },
  {
    id: 'intelligence-all-towns-descriptor',
    name: 'All-towns AI descriptor',
    category: 'intelligence',
    medium: 'memory',
    location: 'Process Map (15m TTL)',
    keyPattern: 'hash(filters)',
    owner: 'lib/intelligence-all-towns-descriptor.ts',
    live: { kind: 'none' },
  },

  // —— Listing-derived ——
  {
    id: 'listings-goldilocks',
    name: 'Goldilocks scores',
    category: 'listing-derived',
    medium: 'postgres',
    location: 'listings.goldilocks_* columns',
    keyPattern: 'listings.id → goldilocks_score / breakdown / scored_at',
    owner: 'lib/listing-scores-rebuild.ts',
    notes: 'Live count = rows with goldilocks_score set (not total listings).',
    live: { kind: 'goldilocks_scored' },
  },
  {
    id: 'listing-edge-scores',
    name: 'Listing edge scores',
    category: 'listing-derived',
    medium: 'postgres',
    location: 'listing_edge_scores',
    keyPattern: 'table rows by mls_id',
    owner: 'lib/listing-edge-score.ts',
    live: { kind: 'postgres_table', table: 'listing_edge_scores' },
  },
  {
    id: 'listing-superlatives',
    name: 'Listing superlatives',
    category: 'listing-derived',
    medium: 'postgres',
    location: 'listing_superlatives',
    keyPattern: 'table rows by listing_id',
    owner: 'lib/listing-superlatives-rebuild.ts',
    live: { kind: 'postgres_table', table: 'listing_superlatives' },
  },
  {
    id: 'listing-relations',
    name: 'Comparables / rental relations',
    category: 'listing-derived',
    medium: 'postgres',
    location: 'listing_relations',
    keyPattern: 'comp_* / rental_* edges',
    owner: 'lib/listing-comparables-cache.ts',
    live: { kind: 'postgres_table', table: 'listing_relations' },
  },
  {
    id: 'listing-if-estimates',
    name: 'IF estimates (table)',
    category: 'listing-derived',
    medium: 'postgres',
    location: 'listing_if_estimates',
    keyPattern: 'table rows by listing_id',
    owner: 'lib/db/listings-repo.ts',
    live: { kind: 'postgres_table', table: 'listing_if_estimates' },
  },
  {
    id: 'if-detail-cache',
    name: 'IF detail payload cache',
    category: 'listing-derived',
    medium: 'postgres',
    location: 'stats_cache',
    keyPattern: 'if:detail:v{N}:{listingId}:{matchFp}',
    owner: 'lib/listing-if-compute.ts',
    live: { kind: 'stats_cache_prefix', prefix: 'if:detail:' },
  },
  {
    id: 'uag-cache',
    name: 'Under-agreement comps cache',
    category: 'listing-derived',
    medium: 'postgres',
    location: 'stats_cache',
    keyPattern: 'uag:v{N}:{subjectId}:{matchFp}',
    owner: 'lib/listing-uag-resolve.ts',
    live: { kind: 'stats_cache_prefix', prefix: 'uag:' },
  },
  {
    id: 'finish-quality',
    name: 'Finish quality assessments',
    category: 'listing-derived',
    medium: 'postgres',
    location: 'stats_cache',
    keyPattern: 'finish-quality:v1:{mlsId}',
    owner: 'lib/finish-quality.ts',
    notes: '~7 day TTL on read path.',
    live: { kind: 'stats_cache_prefix', prefix: 'finish-quality:' },
  },
  {
    id: 'spotlight-cache',
    name: 'Spotlight listing payloads',
    category: 'listing-derived',
    medium: 'postgres',
    location: 'stats_cache',
    keyPattern: 'spotlight:v2:{mlsId}',
    owner: 'lib/spotlight-cache.ts',
    live: { kind: 'stats_cache_prefix', prefix: 'spotlight:' },
  },
  {
    id: 'listing-tax-history',
    name: 'Property tax history',
    category: 'listing-derived',
    medium: 'postgres',
    location: 'listing_tax_history',
    keyPattern: 'table rows by listing_id',
    owner: 'lib/listing-property-tax-cache.ts',
    live: { kind: 'postgres_table', table: 'listing_tax_history' },
  },
  {
    id: 'listing-price-history',
    name: 'Listing price history',
    category: 'listing-derived',
    medium: 'postgres',
    location: 'listing_price_history',
    keyPattern: 'table rows by listing_id',
    owner: 'lib/db/listings-repo.ts',
    live: { kind: 'postgres_table', table: 'listing_price_history' },
  },

  // —— Photos ——
  {
    id: 'photos-r2',
    name: 'Photo binaries (R2)',
    category: 'photos',
    medium: 'r2',
    location: 'Cloudflare R2 bucket',
    keyPattern: 'photos/{cacheId}/{photoIndex}',
    owner: 'lib/r2-photo-store.ts',
    notes: 'Primary production photo store when R2 is configured.',
    live: { kind: 'none' },
  },
  {
    id: 'listing-photo-index',
    name: 'Listing photo index',
    category: 'photos',
    medium: 'postgres',
    location: 'listing_photo_index',
    keyPattern: 'table rows by listing id / index',
    owner: 'lib/db/listing-photo-index-repo.ts',
    live: { kind: 'postgres_table', table: 'listing_photo_index' },
  },
  {
    id: 'listing-photos-sqlite',
    name: 'Photo SQLite fallback',
    category: 'photos',
    medium: 'file',
    location: 'data/listing-photos.db (or /tmp on Lambda)',
    keyPattern: 'listing_photos table in SQLite file',
    owner: 'lib/listing-photos-db.ts',
    notes: 'Used when R2 is not configured.',
    live: { kind: 'none' },
  },
  {
    id: 'listing-photos-blobs',
    name: 'Photo DB blob checkpoint',
    category: 'photos',
    medium: 'blobs',
    location: 'Netlify Blobs store tmre-listings-db',
    keyPattern: 'listing-photos.db',
    owner: 'lib/listing-photos-db-persist.ts',
    notes: 'Legacy round-trip when R2 is off.',
    live: { kind: 'none' },
  },
  {
    id: 'photo-proxy-health',
    name: 'Photo proxy hit/miss counters',
    category: 'photos',
    medium: 'postgres',
    location: 'sync_meta',
    keyPattern: 'listing_photo_proxy_health_v1',
    owner: 'lib/listing-photo-health.ts',
    live: { kind: 'none' },
  },

  // —— Sync control ——
  {
    id: 'sync-meta',
    name: 'Sync meta + site config',
    category: 'sync-control',
    medium: 'postgres',
    location: 'sync_meta (+ in-process hydrate Map)',
    keyPattern: 'last_* / scheduled_sync_* / *_config / rets_* / …',
    owner: 'lib/db/sync-meta-store.ts',
    notes: 'Control plane: timestamps, pause, Goldilocks/pricing/RETS config.',
    live: { kind: 'sync_meta_count' },
  },
  {
    id: 'sync-runs',
    name: 'Sync run history',
    category: 'sync-control',
    medium: 'postgres',
    location: 'sync_runs',
    keyPattern: 'table rows',
    owner: 'lib/db/listings-repo.ts',
    live: { kind: 'postgres_table', table: 'sync_runs' },
  },
  {
    id: 'chunked-resync-progress',
    name: 'Chunked full-resync progress',
    category: 'sync-control',
    medium: 'blobs',
    location: 'Netlify Blobs tmre-listings-db',
    keyPattern: 'chunked-full-resync-progress',
    owner: 'lib/db/chunked-resync-progress.ts',
    live: { kind: 'none' },
  },

  // —— Site data ——
  {
    id: 'visitors-json',
    name: 'Visitors log',
    category: 'site-data',
    medium: 'file',
    location: 'data/visitors.json',
    keyPattern: 'data/visitors.json',
    owner: 'lib/visitors.ts',
    live: { kind: 'none' },
  },
  {
    id: 'contacts-json',
    name: 'Contact form leads',
    category: 'site-data',
    medium: 'file',
    location: 'data/contacts.json',
    keyPattern: 'data/contacts.json',
    owner: 'app/api/contact/route.ts',
    live: { kind: 'none' },
  },

  // —— Ephemeral ——
  {
    id: 'rets-memory',
    name: 'RETS search / photo URL cache',
    category: 'ephemeral',
    medium: 'memory',
    location: 'Process Map',
    keyPattern: 'search:… / photo:preferred:… / photo:all:… / mls:…',
    owner: 'lib/rets.ts',
    live: { kind: 'none' },
  },
  {
    id: 'open-houses-memory',
    name: 'Open houses window cache',
    category: 'ephemeral',
    medium: 'memory',
    location: 'Process Map',
    keyPattern: 'oh:{start}:{end}',
    owner: 'lib/open-houses-server.ts',
    live: { kind: 'none' },
  },
  {
    id: 'vision-appraisal-memory',
    name: 'Vision appraisal owner cache',
    category: 'ephemeral',
    medium: 'memory',
    location: 'Process Map',
    keyPattern: '{town}:{streetNo}:{streetName}',
    owner: 'lib/vision-appraisal.ts',
    live: { kind: 'none' },
  },
  {
    id: 'warm-listing-memory',
    name: 'Warm listing inflight maps',
    category: 'ephemeral',
    medium: 'memory',
    location: 'Process Map',
    keyPattern: 'inflight warm keys',
    owner: 'lib/warm-listing-cache.ts',
    live: { kind: 'none' },
  },
  {
    id: 'looked-at-browser',
    name: 'Looked-at listings',
    category: 'ephemeral',
    medium: 'browser',
    location: 'localStorage',
    keyPattern: 'tmre_looked_at',
    owner: 'lib/looked-at-listings.ts',
    live: { kind: 'none' },
  },
  {
    id: 'deal-board-view-browser',
    name: 'Intel board view preference',
    category: 'ephemeral',
    medium: 'browser',
    location: 'localStorage / session',
    keyPattern: 'intel-board-view',
    owner: 'lib/deal-board-view.ts',
    live: { kind: 'none' },
  },
]

export function statsInventoryByCategory(): {
  category: StatsInventoryCategory
  entries: StatsInventoryEntry[]
}[] {
  return STATS_INVENTORY_CATEGORIES.map((category) => ({
    category,
    entries: STATS_INVENTORY.filter((e) => e.category === category.id),
  })).filter((group) => group.entries.length > 0)
}

/**
 * Postgres table associated with this catalog entry, when applicable.
 * Returns null for memory / file / R2 / browser stores.
 */
export function statsInventoryPostgresTable(
  entry: StatsInventoryEntry,
): string | null {
  if (entry.medium !== 'postgres') return null
  switch (entry.live.kind) {
    case 'postgres_table':
      return entry.live.table
    case 'stats_cache_prefix':
      return 'stats_cache'
    case 'sync_meta_count':
      return 'sync_meta'
    case 'goldilocks_scored':
      return 'listings'
    default:
      break
  }
  const loc = entry.location.trim().split(/[\s(+]/)[0] ?? ''
  if (/^[a-z][a-z0-9_]*$/.test(loc)) return loc
  return null
}

/** Human label for what keyPattern means for this entry. */
export function statsInventoryKeyFieldLabel(entry: StatsInventoryEntry): string {
  if (entry.live.kind === 'stats_cache_prefix') return 'cache_key'
  if (entry.live.kind === 'goldilocks_scored') return 'columns'
  if (entry.live.kind === 'sync_meta_count') return 'key'
  if (entry.live.kind === 'postgres_table') return 'rows'
  if (entry.medium === 'file' || entry.medium === 'blobs' || entry.medium === 'r2') {
    return 'path'
  }
  if (entry.medium === 'memory' || entry.medium === 'browser') return 'key'
  return 'key'
}
