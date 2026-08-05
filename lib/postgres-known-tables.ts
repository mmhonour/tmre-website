/**
 * Canonical Neon Postgres public tables (db/migrations/*.sql).
 * Used by Admin schema diagram ordering and database inventory stats.
 * Live discovery still surfaces any extra public table; this list is the
 * documented inventory + preferred display order.
 *
 * When you add a migration that creates a table, append it here and update
 * Admin overlays (relationships, stats inventory, glossary) in the same change.
 */

export const POSTGRES_KNOWN_TABLES = [
  'listings',
  'sync_meta',
  'stats_cache',
  'listing_tax_history',
  'listing_if_estimates',
  'listing_relations',
  'listing_edge_scores',
  'listing_superlatives',
  'listing_price_history',
  'listing_photo_index',
  'town_property_addresses',
  'zip_boundaries',
  'visitors',
  'content_views',
  'fomc_meetings',
  'cpi_releases',
  'mortgage_rates',
  'leads',
  'site_users',
  'site_user_magic_links',
  'site_user_sessions',
  'saved_search_alerts',
  'saved_search_alert_deliveries',
  'sync_runs',
  'schema_migrations',
] as const

export type PostgresKnownTable = (typeof POSTGRES_KNOWN_TABLES)[number]

/** Alias for Admin diagram / inventory sort priority. */
export const POSTGRES_PRIORITY_TABLES: readonly string[] = POSTGRES_KNOWN_TABLES
